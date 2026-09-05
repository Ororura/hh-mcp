import { describe, expect, it } from "vitest";
import { HhUrlPolicy } from "../../src/hh/HhUrlPolicy.js";

describe("HhUrlPolicy", () => {
  const policy = new HhUrlPolicy();

  it("accepts HH vacancy URLs and extracts the id", () => {
    expect(policy.parseVacancyUrl("https://spb.hh.ru/vacancy/123?from=test")).toEqual({
      id: "123",
      url: "https://spb.hh.ru/vacancy/123?from=test",
    });
  });

  it.each([
    "http://hh.ru/vacancy/123",
    "https://evil.example/vacancy/123",
    "https://fake-hh.ru/vacancy/123",
    "https://hh.ru/search/vacancy/123",
    "https://hh.ru/vacancy/not-a-number",
  ])("rejects unsafe or malformed URL %s", (url) => {
    expect(() => policy.parseVacancyUrl(url)).toThrow();
  });

  it("allows an explicitly injected local test host", () => {
    const local = new HhUrlPolicy(new Set(["127.0.0.1:3000"]));
    expect(local.parseVacancyUrl("http://127.0.0.1:3000/vacancy/42").id).toBe("42");
  });
});
