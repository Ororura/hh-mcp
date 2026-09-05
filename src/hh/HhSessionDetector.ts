import type { Page } from "playwright";
import { HhSelectors, HhTextPatterns } from "./HhSelectors.js";
import { anyPresent, anyVisible, pageContainsText } from "./locatorUtils.js";

export type DetectedSession = "AUTHENTICATED" | "AUTH_REQUIRED" | "CAPTCHA_REQUIRED" | "UNKNOWN";

export class HhSessionDetector {
  async detect(page: Page): Promise<DetectedSession> {
    if (
      (await anyVisible(page, HhSelectors.captcha)) ||
      (await pageContainsText(page, HhTextPatterns.captcha))
    ) {
      return "CAPTCHA_REQUIRED";
    }

    if (await anyPresent(page, HhSelectors.authenticated)) return "AUTHENTICATED";

    const pathname = new URL(page.url()).pathname;
    if (
      pathname.startsWith("/account/login") ||
      pathname.startsWith("/account/signup") ||
      (await anyPresent(page, HhSelectors.authRequired))
    ) {
      return "AUTH_REQUIRED";
    }

    return "UNKNOWN";
  }
}
