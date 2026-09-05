import { describe, expect, it } from "vitest";
import {
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
