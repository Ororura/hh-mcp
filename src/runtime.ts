import { ArtifactManager } from "./artifacts/ArtifactManager.js";
import { HhAutomationService, type HhLogger } from "./application/HhAutomationService.js";
import { BrowserManager } from "./browser/BrowserManager.js";
import { BrowserFlowLock } from "./browser/BrowserLock.js";
import { loadConfig, type HhConfig } from "./config/config.js";
import { ApplicationHistoryRepository } from "./history/ApplicationHistoryRepository.js";
import { HhSessionDetector } from "./hh/HhSessionDetector.js";
import { HhUrlPolicy } from "./hh/HhUrlPolicy.js";

export const stderrLogger: HhLogger = {
  info: (message) => console.error(message),
  error: (message) => console.error(message),
};

export function createRuntime(
  config: HhConfig = loadConfig(),
  options: {
    allowedTestHosts?: ReadonlySet<string>;
    logger?: HhLogger;
  } = {},
): { service: HhAutomationService; browser: BrowserManager } {
  const artifacts = new ArtifactManager(config.artifactsDir);
  const browser = new BrowserManager(config, artifacts);
  const service = new HhAutomationService(
    config,
    browser,
    new BrowserFlowLock(),
    new HhUrlPolicy(options.allowedTestHosts),
    new HhSessionDetector(),
    artifacts,
    new ApplicationHistoryRepository(config.historyPath),
    options.logger ?? stderrLogger,
  );
  return { service, browser };
}
