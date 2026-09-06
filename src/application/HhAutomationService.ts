import type { ArtifactManager } from "../artifacts/ArtifactManager.js";
import type { BrowserManager } from "../browser/BrowserManager.js";
import type { BrowserSession } from "../browser/BrowserSession.js";
import { BrowserProfileBusyError, type BrowserFlowLock } from "../browser/BrowserLock.js";
import type { HhConfig } from "../config/config.js";
import { asTechnicalError } from "../domain/errors.js";
import {
  busyResult,
  type ApplicationContextResult,
  type ApplicationResult,
  type FailedResult,
  type HhToolResult,
  type InspectVacancyResult,
  type SessionStatusResult,
  type VacancySummary,
} from "../domain/results.js";
import type { ResumeSelection, ResumeSummary } from "../domain/resume.js";
import { diagnosticStatuses } from "../domain/statuses.js";
import type { ApplicationHistoryRepository } from "../history/ApplicationHistoryRepository.js";
import { HhApplicationFlow } from "../hh/HhApplicationFlow.js";
import { HhResumePage } from "../hh/HhResumePage.js";
import type { HhSessionDetector } from "../hh/HhSessionDetector.js";
import type { HhUrlPolicy } from "../hh/HhUrlPolicy.js";
import { HhVacancyPage } from "../hh/HhVacancyPage.js";
import { ApplicationStateMachine } from "./ApplicationStateMachine.js";

export type HhLogger = {
  info(message: string): void;
  error(message: string): void;
};

type ExecuteContext = {
  session: BrowserSession;
};

export class HhAutomationService {
  constructor(
    private readonly config: HhConfig,
    private readonly browser: BrowserManager,
    private readonly flowLock: BrowserFlowLock,
    private readonly urlPolicy: HhUrlPolicy,
    private readonly sessionDetector: HhSessionDetector,
    private readonly artifacts: ArtifactManager,
    private readonly history: ApplicationHistoryRepository,
    private readonly logger: HhLogger,
  ) {}

  async sessionStatus(): Promise<SessionStatusResult> {
    return this.execute("session-status", "session", async ({ session }) => {
      await session.page.goto(new URL("/applicant/resumes", this.config.baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: this.config.timeouts.navigation,
      });
      const detected = await this.sessionDetector.detect(session.page);
      if (detected === "AUTHENTICATED") {
        this.logger.info("[HH] Session authenticated");
        return { status: "AUTHENTICATED" };
      }
      if (detected === "AUTH_REQUIRED") return { status: "AUTH_REQUIRED" };
      if (detected === "CAPTCHA_REQUIRED") return { status: "CAPTCHA_REQUIRED" };
      return this.failed("Unable to classify HH session state");
    });
  }

  async inspectVacancy(vacancyUrl: string): Promise<InspectVacancyResult> {
    const parsed = this.urlPolicy.parseVacancyUrl(vacancyUrl);
    return this.execute("inspect-vacancy", parsed.id, async ({ session }) => {
      const vacancyPage = new HhVacancyPage(session.page, parsed.url, this.urlPolicy, this.config);
      this.logger.info(`[HH] Opening vacancy ${parsed.id}`);
      await vacancyPage.open();
      const authResult = await this.classifyAuth(session);
      const vacancy = await vacancyPage.summary();
      if (authResult) return { ...authResult, vacancy };

      const classification = await vacancyPage.classify();
      if (classification.status === "AVAILABLE") {
        this.logger.info("[HH] Vacancy available");
        return {
          status: "AVAILABLE",
          vacancy,
          application: {
            canApply: true,
            alreadyApplied: false,
            questionnaireLikely: await vacancyPage.questionnaireLikely(),
          },
        };
      }
      if (classification.status === "ALREADY_APPLIED") {
        return {
          status: "ALREADY_APPLIED",
          vacancy,
          application: { canApply: false, alreadyApplied: true },
        };
      }
      return {
        status: classification.status,
        vacancy,
        application: { canApply: false, alreadyApplied: false },
        ...(classification.externalUrl ? { externalUrl: classification.externalUrl } : {}),
      };
    }, parsed.url, "hh_inspect_vacancy");
  }

  async getApplicationContext(
    vacancyUrl: string,
    resumeTitle: string,
  ): Promise<ApplicationContextResult> {
    const parsed = this.urlPolicy.parseVacancyUrl(vacancyUrl);
    return this.execute("application-context", parsed.id, async ({ session }) => {
      const vacancyPage = new HhVacancyPage(session.page, parsed.url, this.urlPolicy, this.config);
      this.logger.info(`[HH] Opening vacancy ${parsed.id}`);
      await vacancyPage.open();
      const vacancy = await vacancyPage.applicationContext();
      const authResult = await this.classifyAuth(session);
      if (authResult) return { ...authResult, vacancy };

      const classification = await vacancyPage.classify();
      if (classification.status !== "AVAILABLE") {
        return {
          status: classification.status,
          vacancy,
          ...(classification.externalUrl ? { externalUrl: classification.externalUrl } : {}),
        } as ApplicationContextResult;
      }
      if (!vacancy.description) {
        return {
          status: "UNSUPPORTED_FLOW",
          vacancy,
          message: "HH vacancy description could not be read safely",
        };
      }

      const resumePage = new HhResumePage(
        session.page,
        this.config.baseUrl,
        this.urlPolicy,
        this.config,
      );
      this.logger.info("[HH] Opening resume list");
      await resumePage.openList();
      const resumeAuthResult = await this.classifyAuth(session);
      if (resumeAuthResult) return { ...resumeAuthResult, vacancy };

      const lookup = await resumePage.findByExactTitle(resumeTitle);
      if (!lookup.found) {
        return {
          status: lookup.unsupported ? "UNSUPPORTED_FLOW" : "RESUME_NOT_FOUND",
          vacancy,
          message: lookup.unsupported
            ? "HH resume list could not be read safely"
            : "Requested resume was not found or its title is ambiguous",
          application: { availableResumes: lookup.availableResumes },
        };
      }

      const resumeAuthAfterNavigation = await this.classifyAuth(session);
      if (resumeAuthAfterNavigation) return { ...resumeAuthAfterNavigation, vacancy };
      const { experience, skills, education, about } = lookup.resume;
      if (!experience && !skills && !education && !about) {
        return {
          status: "UNSUPPORTED_FLOW",
          vacancy,
          resume: lookup.resume,
          message: "HH resume content could not be read safely",
        };
      }

      this.logger.info("[HH] Application context ready");
      return { status: "CONTEXT_READY", vacancy, resume: lookup.resume };
    }, parsed.url, "hh_get_application_context");
  }

  async prepareApplication(
    vacancyUrl: string,
    coverLetter?: string,
    resume?: ResumeSelection,
  ): Promise<ApplicationResult> {
    return this.runApplication("prepare", vacancyUrl, coverLetter, resume);
  }

  async submitApplication(
    vacancyUrl: string,
    coverLetter?: string,
    resume?: ResumeSelection,
  ): Promise<ApplicationResult> {
    return this.runApplication("submit", vacancyUrl, coverLetter, resume);
  }

  async close(): Promise<void> {
    await this.browser.close();
    this.history.close();
  }

  private async runApplication(
    mode: "prepare" | "submit",
    vacancyUrl: string,
    coverLetter?: string,
    resume?: ResumeSelection,
  ): Promise<ApplicationResult> {
    const parsed = this.urlPolicy.parseVacancyUrl(vacancyUrl);
    const label = mode === "prepare" ? "prepare-application" : "submit-application";
    const toolName = mode === "prepare" ? "hh_prepare_application" : "hh_submit_application";

    return this.execute(label, parsed.id, async ({ session }) => {
      const machine = new ApplicationStateMachine();
      const vacancyPage = new HhVacancyPage(session.page, parsed.url, this.urlPolicy, this.config);
      this.logger.info(`[HH] Opening vacancy ${parsed.id}`);
      await vacancyPage.open();
      machine.transition({ stage: "PAGE_OPENED", vacancyId: parsed.id });

      const authResult = await this.classifyAuth(session);
      const vacancy = await vacancyPage.summary();
      if (authResult) {
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: authResult.status });
        return { ...authResult, vacancy };
      }
      machine.transition({ stage: "AUTH_CHECKED", vacancyId: parsed.id });

      const classification = await vacancyPage.classify();
      if (classification.status !== "AVAILABLE") {
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: classification.status });
        return {
          status: classification.status,
          vacancy,
          ...(classification.externalUrl ? { externalUrl: classification.externalUrl } : {}),
        } as ApplicationResult;
      }
      machine.transition({ stage: "VACANCY_CLASSIFIED", vacancyId: parsed.id });

      if (mode === "submit" && this.history.wasSubmitted(parsed.id)) {
        machine.transition({
          stage: "TERMINAL",
          vacancyId: parsed.id,
          reason: "LOCAL_HISTORY_CONFLICT",
        });
        return this.failed(
          "Local history records this vacancy as submitted, but HH UI did not confirm it",
          vacancy,
        );
      }

      this.logger.info("[HH] Opening application form");
      machine.transition({ stage: "APPLICATION_ENTRY", vacancyId: parsed.id });
      const flow = new HhApplicationFlow(session.page, this.urlPolicy, this.config);
      const opened = await flow.open(
        vacancyPage,
        mode === "prepare",
        Boolean(coverLetter?.trim() || resume),
      );

      if (opened.kind === "SUBMITTED") {
        if (mode === "submit" && (coverLetter?.trim() || resume)) {
          machine.transition({
            stage: "TERMINAL",
            vacancyId: parsed.id,
            reason: "UNEXPECTED_PAGE_STATE",
          });
          return this.failed(
            "HH reported a direct submission before requested application fields could be verified",
            vacancy,
          );
        }
        if (mode === "submit") {
          machine.transition({ stage: "SUBMITTED", vacancyId: parsed.id });
          this.logger.info("[HH] Submission confirmed");
          return { status: "SUBMITTED", vacancy };
        }
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: "UNSUPPORTED_FLOW" });
        return { status: "UNSUPPORTED_FLOW", vacancy, message: "Dry-run encountered a direct-submit UI" };
      }

      if (opened.kind !== "APPLICATION_FORM") {
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: opened.kind });
        return this.applicationTerminalResult(opened, vacancy);
      }
      machine.transition({ stage: "APPLICATION_FORM", vacancyId: parsed.id });

      let selectedResume: ResumeSummary | undefined;
      if (resume) {
        const resumeSelection = await flow.selectResume(resume);
        if (!resumeSelection.selected) {
          machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: "RESUME_NOT_FOUND" });
          return {
            status: "RESUME_NOT_FOUND",
            vacancy,
            message: "Requested resume was not found or its title is ambiguous",
            application: { availableResumes: resumeSelection.availableResumes },
          };
        }
        selectedResume = resumeSelection.resume;
        this.logger.info("[HH] Resume selected");
      }

      const prepared = await flow.prepareForm(opened.root, coverLetter);
      if (prepared.missingRequiredCoverLetter) {
        machine.transition({
          stage: "TERMINAL",
          vacancyId: parsed.id,
          reason: "MISSING_REQUIRED_COVER_LETTER",
        });
        return {
          status: "MISSING_REQUIRED_COVER_LETTER",
          vacancy,
          application: {
            coverLetterFieldFound: true,
            coverLetterFilled: false,
            questionnaireRequired: false,
            ...(selectedResume ? { selectedResume } : {}),
          },
        };
      }
      if (coverLetter?.trim() && !prepared.coverLetterFilled) {
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: "UNSUPPORTED_FLOW" });
        return {
          status: "UNSUPPORTED_FLOW",
          vacancy,
          message: "Cover letter was provided but HH did not expose a writable cover-letter field",
          application: {
            coverLetterFieldFound: prepared.coverLetterFieldFound,
            coverLetterFilled: false,
            questionnaireRequired: false,
            ...(selectedResume ? { selectedResume } : {}),
          },
        };
      }
      if (prepared.coverLetterFilled) {
        this.logger.info("[HH] Cover letter filled");
      }

      if (!(await flow.hasSubmitButton(prepared.root))) {
        machine.transition({ stage: "TERMINAL", vacancyId: parsed.id, reason: "UNSUPPORTED_FLOW" });
        return { status: "UNSUPPORTED_FLOW", vacancy, message: "Application submit control not found" };
      }
      machine.transition({ stage: "READY", vacancyId: parsed.id });

      if (mode === "prepare") {
        return {
          status: "READY_TO_SUBMIT",
          vacancy,
          application: {
            coverLetterFieldFound: prepared.coverLetterFieldFound,
            coverLetterFilled: prepared.coverLetterFilled,
            questionnaireRequired: false,
            ...(selectedResume ? { selectedResume } : {}),
          },
        };
      }

      machine.transition({ stage: "SUBMITTING", vacancyId: parsed.id });
      this.logger.info("[HH] Submitting");
      await flow.submit(prepared.root, coverLetter, selectedResume);
      if (!(await flow.confirmSubmission())) {
        machine.transition({
          stage: "TERMINAL",
          vacancyId: parsed.id,
          reason: "UNEXPECTED_PAGE_STATE",
        });
        return this.failed("Submit was clicked, but HH UI did not confirm the application", vacancy);
      }

      machine.transition({ stage: "SUBMITTED", vacancyId: parsed.id });
      this.logger.info("[HH] Submission confirmed");
      return {
        status: "SUBMITTED",
        vacancy,
        application: {
          coverLetterFieldFound: prepared.coverLetterFieldFound,
          coverLetterFilled: prepared.coverLetterFilled,
          questionnaireRequired: false,
          ...(selectedResume ? { selectedResume } : {}),
        },
      };
    }, parsed.url, toolName);
  }

  private async classifyAuth(
    session: BrowserSession,
  ): Promise<
    | { status: "AUTH_REQUIRED" }
    | { status: "CAPTCHA_REQUIRED" }
    | FailedResult
    | undefined
  > {
    const auth = await this.sessionDetector.detect(session.page);
    if (auth === "AUTHENTICATED") {
      this.logger.info("[HH] Session authenticated");
      return undefined;
    }
    if (auth === "AUTH_REQUIRED") return { status: "AUTH_REQUIRED" };
    if (auth === "CAPTCHA_REQUIRED") return { status: "CAPTCHA_REQUIRED" };
    return this.failed("Unable to determine authentication state");
  }

  private applicationTerminalResult(
    state: Exclude<Awaited<ReturnType<HhApplicationFlow["open"]>>, { kind: "APPLICATION_FORM" }>,
    vacancy: VacancySummary,
  ): ApplicationResult {
    switch (state.kind) {
      case "CAPTCHA_REQUIRED":
      case "QUESTIONNAIRE_REQUIRED":
        return {
          status: state.kind,
          vacancy,
          application: { questionnaireRequired: state.kind === "QUESTIONNAIRE_REQUIRED" },
        };
      case "EXTERNAL_APPLICATION":
        return { status: "EXTERNAL_APPLICATION", vacancy, externalUrl: state.externalUrl };
      case "UNKNOWN":
        return { status: "UNSUPPORTED_FLOW", vacancy, message: "Unknown HH application UI" };
      case "SUBMITTED":
        return { status: "UNSUPPORTED_FLOW", vacancy };
    }
  }

  private async execute<T extends HhToolResult>(
    label: string,
    vacancyId: string,
    handler: (context: ExecuteContext) => Promise<T>,
    vacancyUrl?: string,
    toolName?: string,
  ): Promise<T> {
    const release = this.flowLock.tryAcquire();
    if (!release) return busyResult() as T;

    let session: BrowserSession | undefined;
    let result: T;
    try {
      session = await this.browser.createSession(`${label}_${vacancyId}`);
      result = await handler({ session });
    } catch (error) {
      if (error instanceof BrowserProfileBusyError) {
        result = busyResult() as T;
      } else {
        const technicalError = asTechnicalError(error);
        this.logger.error(`[HH] ${technicalError.code}: ${technicalError.message}`);
        result = {
          status: "FAILED",
          message: technicalError.message,
          error: technicalError,
        } as T;
      }
    }

    if (session && diagnosticStatuses.has(result.status)) {
      try {
        result = {
          ...result,
          artifactPath: await this.artifacts.screenshot(session.page, vacancyId, result.status),
        };
      } catch (error) {
        this.logger.error(`[HH] Failed to save screenshot: ${String(error)}`);
      }
    }

    const tracePath = session?.tracePath;
    await session?.close();
    if (tracePath) result = { ...result, tracePath };
    release();

    if (vacancyUrl && toolName) this.recordHistory(vacancyId, vacancyUrl, toolName, result);
    return result;
  }

  private recordHistory(
    vacancyId: string,
    vacancyUrl: string,
    toolName: string,
    result: HhToolResult,
  ): void {
    const attemptedAt = new Date().toISOString();
    try {
      this.history.record({
        vacancyId,
        vacancyUrl,
        toolName,
        status: result.status,
        attemptedAt,
        ...(result.status === "SUBMITTED" ? { submittedAt: attemptedAt } : {}),
        ...(result.error ? { failureCode: result.error.code } : {}),
      });
    } catch (error) {
      this.logger.error(`[HH] Failed to record local history: ${String(error)}`);
    }
  }

  private failed(message: string, vacancy?: VacancySummary): FailedResult {
    return {
      status: "FAILED",
      message,
      error: { code: "UNEXPECTED_PAGE_STATE", message },
      ...(vacancy ? { vacancy } : {}),
    };
  }
}
