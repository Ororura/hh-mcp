import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HhAutomationService } from "../../src/application/HhAutomationService.js";
import type { HhConfig } from "../../src/config/config.js";
import { createRuntime } from "../../src/runtime.js";
import { HhFixtureServer } from "../fixtures/HhFixtureServer.js";

describe("HH browser flows", () => {
  const fixture = new HhFixtureServer();
  let tempDir: string;
  let service: HhAutomationService;
  let config: HhConfig;
  const logs: string[] = [];

  beforeAll(async () => {
    await fixture.start();
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hh-mcp-integration-"));
    config = {
      projectDir: tempDir,
      browserProfileDir: path.join(tempDir, "profile"),
      headless: true,
      trace: false,
      artifactsDir: path.join(tempDir, "artifacts"),
      historyPath: path.join(tempDir, "history.sqlite"),
      baseUrl: fixture.baseUrl,
      timeouts: {
        navigation: 3_000,
        element: 1_000,
        applicationTransition: 500,
        submitConfirmation: 1_000,
      },
    };
    service = createRuntime(config, {
      allowedTestHosts: new Set([fixture.host]),
      logger: {
        info: (message) => logs.push(message),
        error: (message) => logs.push(message),
      },
    }).service;
  });

  afterAll(async () => {
    if (service) await service.close();
    if (fixture.baseUrl) await fixture.stop();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fixture.sessionMode = "authenticated";
    fixture.resetSubmissions();
    logs.length = 0;
  });

  it("classifies authenticated and unauthenticated sessions", async () => {
    await expect(service.sessionStatus()).resolves.toMatchObject({ status: "AUTHENTICATED" });
    fixture.sessionMode = "auth-required";
    await expect(service.sessionStatus()).resolves.toMatchObject({ status: "AUTH_REQUIRED" });
  });

  it.each([
    [100, "AVAILABLE"],
    [101, "VACANCY_CLOSED"],
    [102, "ALREADY_APPLIED"],
    [104, "CAPTCHA_REQUIRED"],
    [105, "EXTERNAL_APPLICATION"],
    [107, "AVAILABLE"],
    [112, "UNSUPPORTED_FLOW"],
  ] as const)("inspects fixture %s as %s", async (id, expected) => {
    const result = await service.inspectVacancy(fixture.vacancyUrl(id));
    expect(result.status).toBe(expected);
    if (["CAPTCHA_REQUIRED", "UNSUPPORTED_FLOW"].includes(expected)) {
      expect(result.artifactPath).toMatch(/\.png$/);
    }
  });

  it("prepare fills a form but never sends the application", async () => {
    const coverLetter = "CONFIDENTIAL-COVER-LETTER-CONTENT";
    const result = await service.prepareApplication(fixture.vacancyUrl(100), coverLetter);
    expect(result).toMatchObject({
      status: "READY_TO_SUBMIT",
      application: { coverLetterFieldFound: true, questionnaireRequired: false },
    });
    expect(fixture.submitCount).toBe(0);
    expect(logs.join("\n")).not.toContain(coverLetter);
  });

  it("dry-run blocks an application entry that directly submits", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(113), "Hello");
    expect(result.status).toBe("UNSUPPORTED_FLOW");
    expect(fixture.submitCount).toBe(0);
  });

  it("returns BUSY for a concurrent flow", async () => {
    const first = service.inspectVacancy(fixture.vacancyUrl(100));
    const second = await service.inspectVacancy(fixture.vacancyUrl(101));
    expect(second.status).toBe("BUSY");
    await expect(first).resolves.toMatchObject({ status: "AVAILABLE" });
  });

  it("returns BUSY when another process-level runtime owns the profile", async () => {
    await service.inspectVacancy(fixture.vacancyUrl(100));
    const secondaryConfig: HhConfig = {
      ...config,
      historyPath: path.join(tempDir, "secondary-history.sqlite"),
    };
    const secondary = createRuntime(secondaryConfig, {
      allowedTestHosts: new Set([fixture.host]),
      logger: { info: () => undefined, error: () => undefined },
    }).service;
    try {
      await expect(secondary.inspectVacancy(fixture.vacancyUrl(100))).resolves.toMatchObject({
        status: "BUSY",
      });
    } finally {
      await secondary.close();
    }
  });

  it("classifies unknown application UI and saves a screenshot", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(107), "Hello");
    expect(result.status).toBe("UNSUPPORTED_FLOW");
    expect(result.artifactPath).toMatch(/\.png$/);
    expect(fixture.submitCount).toBe(0);
  });

  it("supports a form without a cover-letter field when no letter was requested", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(108));
    expect(result).toMatchObject({
      status: "READY_TO_SUBMIT",
      application: { coverLetterFieldFound: false, coverLetterFilled: false },
    });
    expect(fixture.submitCount).toBe(0);
  });

  it("does not submit when a requested cover letter cannot be added", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(108), "Must be attached");
    expect(result).toMatchObject({
      status: "UNSUPPORTED_FLOW",
      application: { coverLetterFieldFound: false, coverLetterFilled: false },
    });
    expect(fixture.submitCount).toBe(0);
  });

  it("rejects a missing required cover letter", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(109));
    expect(result.status).toBe("MISSING_REQUIRED_COVER_LETTER");
    expect(fixture.submitCount).toBe(0);
  });

  it("stops at employer questionnaires and saves a screenshot", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(103), "Hello");
    expect(result.status).toBe("QUESTIONNAIRE_REQUIRED");
    expect(result.artifactPath).toMatch(/\.png$/);
    await expect(access(result.artifactPath as string)).resolves.toBeUndefined();
    expect(fixture.submitCount).toBe(0);
  });

  it("never clicks submit when the current HH task-questionnaire UI is present", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(103), "Hello");
    expect(result.status).toBe("QUESTIONNAIRE_REQUIRED");
    expect(fixture.submitCount).toBe(0);
  });

  it("reveals, fills, and verifies a hidden cover-letter field before submit", async () => {
    const coverLetter = "EXPECTED-HIDDEN-COVER-LETTER";
    const result = await service.submitApplication(fixture.vacancyUrl(116), coverLetter);
    expect(result).toMatchObject({
      status: "SUBMITTED",
      application: { coverLetterFieldFound: true, coverLetterFilled: true },
    });
    expect(fixture.submitCount).toBe(1);
    expect(fixture.submittedCoverLetter).toBe(coverLetter);
  });

  it("selects a resume by stable HH id before submit", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(118), "Hello", {
      id: "resume-java",
    });
    expect(result).toMatchObject({
      status: "SUBMITTED",
      application: {
        coverLetterFilled: true,
        selectedResume: { id: "resume-java", title: "Java Backend Developer" },
      },
    });
    expect(fixture.submitCount).toBe(1);
    expect(fixture.submittedResumeId).toBe("resume-java");
  });

  it("selects a resume by exact title in dry-run mode", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(117), "Hello", {
      title: "Java Backend Developer",
    });
    expect(result).toMatchObject({
      status: "READY_TO_SUBMIT",
      application: {
        selectedResume: { id: "resume-java", title: "Java Backend Developer" },
      },
    });
    expect(fixture.submitCount).toBe(0);
  });

  it("does not submit when the requested resume is unavailable", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(117), "Hello", {
      id: "missing-resume",
    });
    expect(result).toMatchObject({
      status: "RESUME_NOT_FOUND",
      application: {
        availableResumes: [
          { id: "resume-frontend", title: "Frontend Developer" },
          { id: "resume-java", title: "Java Backend Developer" },
        ],
      },
    });
    expect(fixture.submitCount).toBe(0);
  });

  it("submits once and requires UI confirmation", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(106), "Hello");
    expect(result).toMatchObject({
      status: "SUBMITTED",
      application: { coverLetterFieldFound: true, coverLetterFilled: true },
    });
    expect(fixture.submitCount).toBe(1);
    expect(fixture.submittedCoverLetter).toBe("Hello");
  });

  it("uses local history as duplicate protection in addition to the UI check", async () => {
    const vacancyUrl = fixture.vacancyUrl(115);
    await expect(service.submitApplication(vacancyUrl, "Hello")).resolves.toMatchObject({
      status: "SUBMITTED",
    });
    fixture.resetSubmissions();
    const repeated = await service.submitApplication(vacancyUrl, "Hello");
    expect(repeated).toMatchObject({
      status: "FAILED",
      error: { code: "UNEXPECTED_PAGE_STATE" },
    });
    expect(fixture.submitCount).toBe(0);
  });

  it("blocks a direct-submit entry when a cover letter was requested", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(113), "Hello");
    expect(result.status).toBe("UNSUPPORTED_FLOW");
    expect(fixture.submitCount).toBe(0);
  });

  it("blocks a direct-submit entry when resume selection was requested", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(113), undefined, {
      id: "resume-java",
    });
    expect(result.status).toBe("UNSUPPORTED_FLOW");
    expect(fixture.submitCount).toBe(0);
  });

  it("supports an explicitly authorized direct-submit flow without a cover letter", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(113));
    expect(result.status).toBe("SUBMITTED");
    expect(fixture.submitCount).toBe(1);
  });

  it("does not report success when submit click lacks UI confirmation", async () => {
    const result = await service.submitApplication(fixture.vacancyUrl(114));
    expect(result).toMatchObject({
      status: "FAILED",
      error: { code: "UNEXPECTED_PAGE_STATE" },
    });
    expect(result.artifactPath).toMatch(/\.png$/);
    await expect(access(result.artifactPath as string)).resolves.toBeUndefined();
    expect(fixture.submitCount).toBe(1);
  });

  it("saves a Playwright trace when tracing is enabled", async () => {
    const traceRoot = path.join(tempDir, "trace-runtime");
    const traceConfig: HhConfig = {
      projectDir: traceRoot,
      browserProfileDir: path.join(traceRoot, "profile"),
      headless: true,
      trace: true,
      artifactsDir: path.join(traceRoot, "artifacts"),
      historyPath: path.join(traceRoot, "history.sqlite"),
      baseUrl: fixture.baseUrl,
      timeouts: {
        navigation: 3_000,
        element: 1_000,
        applicationTransition: 500,
        submitConfirmation: 1_000,
      },
    };
    const traceService = createRuntime(traceConfig, {
      allowedTestHosts: new Set([fixture.host]),
      logger: { info: () => undefined, error: () => undefined },
    }).service;
    try {
      const result = await traceService.inspectVacancy(fixture.vacancyUrl(100));
      expect(result.tracePath).toMatch(/\.zip$/);
      await expect(access(result.tracePath as string)).resolves.toBeUndefined();
    } finally {
      await traceService.close();
    }
  });

  it("does not open application UI when authentication is required", async () => {
    const result = await service.prepareApplication(fixture.vacancyUrl(110), "Hello");
    expect(result.status).toBe("AUTH_REQUIRED");
    expect(fixture.submitCount).toBe(0);
  });
});
