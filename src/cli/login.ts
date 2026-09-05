import { loadConfig } from "../config/config.js";
import { createRuntime } from "../runtime.js";

const config = { ...loadConfig(), headless: false, trace: false };
const { browser, service } = createRuntime(config);

try {
  const session = await browser.createSession("manual-login");
  console.error(`[HH] Opening ${config.baseUrl} for manual login`);
  console.error("[HH] Log in manually, then close the Chromium window to save the session");
  await session.page.goto(config.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.timeouts.navigation,
  });
  await new Promise<void>((resolve) => session.page.context().once("close", () => resolve()));
} finally {
  await service.close();
}
