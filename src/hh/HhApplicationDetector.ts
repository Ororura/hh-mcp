import type { Locator, Page } from "playwright";
import { HhSelectors, HhTextPatterns } from "./HhSelectors.js";
import type { HhUrlPolicy } from "./HhUrlPolicy.js";
import { anyVisible, firstVisible, pageContainsText } from "./locatorUtils.js";

export type ApplicationUiState =
  | { kind: "CAPTCHA_REQUIRED" }
  | { kind: "QUESTIONNAIRE_REQUIRED" }
  | { kind: "EXTERNAL_APPLICATION"; externalUrl: string }
  | { kind: "APPLICATION_FORM"; root?: Locator }
  | { kind: "SUBMITTED" }
  | { kind: "UNKNOWN" };

export class HhApplicationDetector {
  constructor(private readonly urlPolicy: HhUrlPolicy) {}

  async detect(page: Page, interceptedExternalUrl?: string): Promise<ApplicationUiState> {
    if (
      (await anyVisible(page, HhSelectors.captcha)) ||
      (await pageContainsText(page, HhTextPatterns.captcha))
    ) {
      return { kind: "CAPTCHA_REQUIRED" };
    }

    if (interceptedExternalUrl) {
      return { kind: "EXTERNAL_APPLICATION", externalUrl: interceptedExternalUrl };
    }
    if (!this.urlPolicy.isAllowedPageUrl(page.url())) {
      return { kind: "EXTERNAL_APPLICATION", externalUrl: page.url() };
    }

    if (
      (await anyVisible(page, HhSelectors.questionnaire)) ||
      (await pageContainsText(page, HhTextPatterns.questionnaire))
    ) {
      return { kind: "QUESTIONNAIRE_REQUIRED" };
    }

    if (
      (await anyVisible(page, HhSelectors.submissionSuccess)) ||
      (await pageContainsText(page, HhTextPatterns.success))
    ) {
      return { kind: "SUBMITTED" };
    }

    const root = await firstVisible(page, HhSelectors.applicationRoot);
    if (root || (await this.coverLetterField(page)) || (await this.submitButton(page, root))) {
      return { kind: "APPLICATION_FORM", ...(root ? { root } : {}) };
    }

    return { kind: "UNKNOWN" };
  }

  async coverLetterField(page: Page): Promise<Locator | undefined> {
    return firstVisible(page, HhSelectors.coverLetter);
  }

  async submitButton(page: Page, root?: Locator): Promise<Locator | undefined> {
    const scope = root ?? page.locator("body");
    for (const selector of HhSelectors.submitApplication) {
      const locator = scope.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    if (!root) return undefined;
    const byRole = scope.getByRole("button", { name: HhTextPatterns.submit }).first();
    return (await byRole.isVisible().catch(() => false)) ? byRole : undefined;
  }

  async submissionConfirmed(page: Page): Promise<boolean> {
    return (
      (await anyVisible(page, HhSelectors.submissionSuccess)) ||
      (await pageContainsText(page, HhTextPatterns.success))
    );
  }
}
