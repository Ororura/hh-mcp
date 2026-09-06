import { describe, expect, it } from "vitest";
import {
  applicationContextInputSchema,
  applicationContextOutputSchema,
  applicationInputSchema,
  prepareApplicationOutputSchema,
  submitApplicationOutputSchema,
} from "../../src/tools/schemas.js";

describe("MCP schemas", () => {
  it("accepts only production HH vacancy URLs at the MCP boundary", () => {
    expect(
      applicationInputSchema.safeParse({ vacancyUrl: "https://hh.ru/vacancy/123" }).success,
    ).toBe(true);
    expect(
      applicationInputSchema.safeParse({ vacancyUrl: "http://127.0.0.1:3000/vacancy/123" })
        .success,
    ).toBe(false);
  });

  it("accepts resume selection by id or title and rejects an empty selector", () => {
    expect(
      applicationInputSchema.safeParse({
        vacancyUrl: "https://hh.ru/vacancy/123",
        resume: { id: "resume-id" },
      }).success,
    ).toBe(true);
    expect(
      applicationInputSchema.safeParse({
        vacancyUrl: "https://hh.ru/vacancy/123",
        resume: { title: "Java Backend Developer" },
      }).success,
    ).toBe(true);
    expect(
      applicationInputSchema.safeParse({
        vacancyUrl: "https://hh.ru/vacancy/123",
        resume: {},
      }).success,
    ).toBe(false);
  });

  it("validates the read-only application context contract", () => {
    expect(
      applicationContextInputSchema.safeParse({
        vacancyUrl: "https://spb.hh.ru/vacancy/123",
        resumeTitle: "Java Backend Developer",
      }).success,
    ).toBe(true);
    expect(
      applicationContextInputSchema.safeParse({
        vacancyUrl: "https://spb.hh.ru/vacancy/123",
        resumeTitle: "",
      }).success,
    ).toBe(false);
    expect(
      applicationContextOutputSchema.safeParse({
        status: "CONTEXT_READY",
        vacancy: {
          id: "123",
          url: "https://spb.hh.ru/vacancy/123",
          description: "Java and Spring Boot",
        },
        resume: {
          id: "resume-id",
          title: "Java Backend Developer",
          url: "https://spb.hh.ru/resume/resume-id",
          experience: "Built REST APIs",
        },
      }).success,
    ).toBe(true);
  });

  it("does not advertise submit as a prepare result", () => {
    expect(prepareApplicationOutputSchema.safeParse({ status: "SUBMITTED" }).success).toBe(false);
    expect(prepareApplicationOutputSchema.safeParse({ status: "READY_TO_SUBMIT" }).success).toBe(
      true,
    );
  });

  it("does not advertise ready-only state as a submit result", () => {
    expect(submitApplicationOutputSchema.safeParse({ status: "READY_TO_SUBMIT" }).success).toBe(
      false,
    );
    expect(submitApplicationOutputSchema.safeParse({ status: "SUBMITTED" }).success).toBe(true);
  });
});
