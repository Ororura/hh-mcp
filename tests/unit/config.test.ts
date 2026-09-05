import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.js";

describe("loadConfig", () => {
  it("uses safe production defaults", () => {
    const config = loadConfig({}, "/project");
    expect(config.headless).toBe(true);
    expect(config.trace).toBe(false);
    expect(config.browserProfileDir).toBe(path.resolve("/project/data/hh-browser-profile"));
  });

  it("parses explicit booleans and paths", () => {
    const config = loadConfig(
      { HH_HEADLESS: "false", HH_TRACE: "true", HH_BROWSER_PROFILE_DIR: "profile" },
      "/project",
    );
    expect(config.headless).toBe(false);
    expect(config.trace).toBe(true);
    expect(config.browserProfileDir).toBe("/project/profile");
  });

  it("rejects ambiguous boolean values", () => {
    expect(() => loadConfig({ HH_HEADLESS: "1" }, "/project")).toThrow();
  });
});
