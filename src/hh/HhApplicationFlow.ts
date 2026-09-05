import type { Locator, Page, Route } from "playwright";
import type { HhConfig } from "../config/config.js";
import { HhTechnicalError } from "../domain/errors.js";
import { HhApplicationDetector, type ApplicationUiState } from "./HhApplicationDetector.js";
import { HhSelectors, HhTextSnippets, knownSubmissionUrlPattern } from "./HhSelectors.js";
import type { HhUrlPolicy } from "./HhUrlPolicy.js";
import type { HhVacancyPage } from "./HhVacancyPage.js";

export type OpenApplicationResult = ApplicationUiState & {
  blockedMutation?: boolean;
};

export type PreparedForm = {
  coverLetterFieldFound: boolean;
  missingRequiredCoverLetter: boolean;
  root?: Locator;
};

export class HhApplicationFlow {
  readonly #detector: HhApplicationDetector;
  #interceptedExternalUrl?: string;
  #blockedMutation = false;
  #popupTask: Promise<void> | undefined;

  constructor(
    private readonly page: Page,
    private readonly urlPolicy: HhUrlPolicy,
    private readonly config: HhConfig,
  ) {
    this.#detector = new HhApplicationDetector(urlPolicy);
  }

  async open(vacancyPage: HhVacancyPage, dryRun: boolean): Promise<OpenApplicationResult> {
    await this.installNavigationGuard(dryRun);
    this.page.once("popup", (popup) => {
      this.#popupTask = this.capturePopup(popup);
    });
    const applyEntry = await vacancyPage.applyEntry();
    if (!applyEntry) return { kind: "UNKNOWN" };

    const href = await applyEntry.getAttribute("href");
    if (href) {
      const target = new URL(href, this.page.url()).toString();
      if (!this.urlPolicy.isAllowedPageUrl(target)) {
        return { kind: "EXTERNAL_APPLICATION", externalUrl: target };
      }
    }

    await applyEntry.click({ timeout: this.config.timeouts.element });
    await this.waitForApplicationState();
    await this.#popupTask;
    const detected = await this.#detector.detect(this.page, this.#interceptedExternalUrl);
    return { ...detected, ...(this.#blockedMutation ? { blockedMutation: true } : {}) };
  }

  async prepareForm(root: Locator | undefined, coverLetter?: string): Promise<PreparedForm> {
    const field = await this.#detector.coverLetterField(this.page);
    if (!field) {
      return { coverLetterFieldFound: false, missingRequiredCoverLetter: false, ...(root ? { root } : {}) };
    }

    const required =
      (await field.getAttribute("required")) !== null ||
      (await field.getAttribute("aria-required")) === "true";
    const normalizedLetter = coverLetter?.trim();
    if (required && !normalizedLetter) {
      return { coverLetterFieldFound: true, missingRequiredCoverLetter: true, ...(root ? { root } : {}) };
    }
    if (normalizedLetter) await field.fill(normalizedLetter);
    return { coverLetterFieldFound: true, missingRequiredCoverLetter: false, ...(root ? { root } : {}) };
  }

  async hasSubmitButton(root?: Locator): Promise<boolean> {
    return (await this.#detector.submitButton(this.page, root)) !== undefined;
  }

  async submit(root?: Locator): Promise<void> {
    const button = await this.#detector.submitButton(this.page, root);
    if (!button) throw new HhTechnicalError("SELECTOR_NOT_FOUND", "Application submit button not found");
    await button.click({ timeout: this.config.timeouts.element });
  }

  async confirmSubmission(): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        ({ selectors, successText }) => {
          if (selectors.some((selector) => document.querySelector(selector))) return true;
          return successText.some((text) => document.body?.innerText.toLowerCase().includes(text));
        },
        {
          selectors: [...HhSelectors.submissionSuccess],
          successText: [...HhTextSnippets.submissionSuccess],
        },
        { timeout: this.config.timeouts.submitConfirmation },
      );
      return this.#detector.submissionConfirmed(this.page);
    } catch {
      return false;
    }
  }

  private async installNavigationGuard(dryRun: boolean): Promise<void> {
    await this.page.route("**/*", async (route: Route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const isExternalNavigation =
        request.isNavigationRequest() &&
        request.frame() === this.page.mainFrame() &&
        !this.urlPolicy.isAllowedPageUrl(request.url());

      if (isExternalNavigation) {
        this.#interceptedExternalUrl = request.url();
        await route.abort("blockedbyclient");
        return;
      }

      if (
        dryRun &&
        (["POST", "PUT", "PATCH", "DELETE"].includes(method) ||
          knownSubmissionUrlPattern.test(request.url()))
      ) {
        this.#blockedMutation = true;
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });
  }

  private async waitForApplicationState(): Promise<void> {
    await this.page
      .waitForFunction(
        ({ selectors }) => {
          return selectors.some((selector) => document.querySelector(selector));
        },
        {
          selectors: [
            ...HhSelectors.applicationRoot,
            ...HhSelectors.questionnaire,
            ...HhSelectors.submissionSuccess,
            ...HhSelectors.captcha,
          ],
        },
        { timeout: this.config.timeouts.applicationTransition },
      )
      .catch(() => undefined);
  }

  private async capturePopup(popup: Page): Promise<void> {
    try {
      await popup.waitForLoadState("domcontentloaded", {
        timeout: this.config.timeouts.applicationTransition,
      }).catch(() => undefined);
      if (!this.urlPolicy.isAllowedPageUrl(popup.url())) this.#interceptedExternalUrl = popup.url();
    } finally {
      await popup.close().catch(() => undefined);
    }
  }
}
