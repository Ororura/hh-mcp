import { describe, expect, it } from "vitest";
import { ApplicationHistoryRepository } from "../../src/history/ApplicationHistoryRepository.js";

describe("ApplicationHistoryRepository", () => {
  it("records diagnostic history and detects submitted vacancies", () => {
    const repository = new ApplicationHistoryRepository(":memory:");
    repository.record({
      vacancyId: "123",
      vacancyUrl: "https://hh.ru/vacancy/123",
      toolName: "hh_submit_application",
      status: "SUBMITTED",
      attemptedAt: "2026-09-06T00:00:00.000Z",
      submittedAt: "2026-09-06T00:00:00.000Z",
    });
    expect(repository.count()).toBe(1);
    expect(repository.wasSubmitted("123")).toBe(true);
    expect(repository.wasSubmitted("456")).toBe(false);
    repository.close();
  });
});
