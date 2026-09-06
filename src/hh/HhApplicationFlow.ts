import type { Locator, Page, Route } from "playwright";
import type { HhConfig } from "../config/config.js";
import { HhTechnicalError } from "../domain/errors.js";
import type { ResumeSelection, ResumeSummary } from "../domain/resume.js";
import { HhApplicationDetector, type ApplicationUiState } from "./HhApplicationDetector.js";
import {
  HhSelectors,
  HhTextPatterns,
  HhTextSnippets,
  knownSubmissionUrlPattern,
} from "./HhSelectors.js";
import type { HhUrlPolicy } from "./HhUrlPolicy.js";
import type { HhVacancyPage } from "./HhVacancyPage.js";
import { firstVisible } from "./locatorUtils.js";

export type OpenApplicationResult = ApplicationUiState & {
  blockedMutation?: boolean;
};

export type PreparedForm = {
  coverLetterFieldFound: boolean;
  coverLetterFilled: boolean;
  missingRequiredCoverLetter: boolean;
  root?: Locator;
};

export type ResumeSelectionResult =
  | { selected: true; resume: ResumeSummary; availableResumes: ResumeSummary[] }
  | { selected: false; availableResumes: ResumeSummary[] };

export class HhApplicationFlow {
  readonly #detector: HhApplicationDetector;
  #interceptedExternalUrl?: string;
  #blockedMutation = false;
  #dryRun = false;
  #submissionArmed = false;
  #popupTask: Promise<void> | undefined;

  constructor(
    private readonly page: Page,
    private readonly urlPolicy: HhUrlPolicy,
    private readonly config: HhConfig,
  ) {
    this.#detector = new HhApplicationDetector(urlPolicy);
  }

  async open(
    vacancyPage: HhVacancyPage,
    dryRun: boolean,
    requireApplicationForm = false,
  ): Promise<OpenApplicationResult> {
    this.#dryRun = dryRun || requireApplicationForm;
    this.#submissionArmed = !dryRun && !requireApplicationForm;
    await this.installNavigationGuard();
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
    if (await this.continueApplicationWarning()) {
      await this.waitForApplicationState();
    }
    await this.#popupTask;
    const detected = await this.#detector.detect(this.page, this.#interceptedExternalUrl);
    return { ...detected, ...(this.#blockedMutation ? { blockedMutation: true } : {}) };
  }

  async prepareForm(root: Locator | undefined, coverLetter?: string): Promise<PreparedForm> {
    const normalizedLetter = coverLetter?.trim();
    let field = await this.#detector.coverLetterField(this.page);
    if (!field && normalizedLetter) field = await this.revealCoverLetterField();

    if (!field) {
      return {
        coverLetterFieldFound: false,
        coverLetterFilled: false,
        missingRequiredCoverLetter: false,
        ...(root ? { root } : {}),
      };
    }

    const required =
      (await field.getAttribute("required")) !== null ||
      (await field.getAttribute("aria-required")) === "true";
    if (required && !normalizedLetter) {
      return {
        coverLetterFieldFound: true,
        coverLetterFilled: false,
        missingRequiredCoverLetter: true,
        ...(root ? { root } : {}),
      };
    }

    if (normalizedLetter) await field.fill(normalizedLetter);
    const coverLetterFilled = normalizedLetter
      ? (await field.inputValue()) === normalizedLetter
      : false;
    return {
      coverLetterFieldFound: true,
      coverLetterFilled,
      missingRequiredCoverLetter: false,
      ...(root ? { root } : {}),
    };
  }

  async selectResume(selection: ResumeSelection): Promise<ResumeSelectionResult> {
    const title = this.page.locator(HhSelectors.resumeTitle).first();
    const control = this.page.getByRole("button").filter({ has: title }).first();
    if (!(await control.isVisible().catch(() => false))) {
      return { selected: false, availableResumes: [] };
    }

    await control.click({ timeout: this.config.timeouts.element });
    const optionList = this.page.locator(HhSelectors.resumeOptionList).first();
    const optionListVisible = await optionList
      .waitFor({ state: "visible", timeout: this.config.timeouts.element })
      .then(() => true)
      .catch(() => false);
    if (!optionListVisible) {
      return { selected: false, availableResumes: [] };
    }

    const optionLocators = optionList.locator(HhSelectors.resumeOption);
    const availableResumes: ResumeSummary[] = [];
    const matches: Array<{ locator: Locator; resume: ResumeSummary }> = [];
    for (let index = 0; index < (await optionLocators.count()); index += 1) {
      const option = optionLocators.nth(index);
      const id = await option.getAttribute("data-magritte-select-option");
      const optionTitle = normalizeResumeTitle(
        (await option.locator(HhSelectors.resumeTitle).first().textContent()) ?? "",
      );
      if (!id || !optionTitle) continue;

      const resume = { id, title: optionTitle };
      availableResumes.push(resume);
      const idMatches = !selection.id || selection.id === id;
      const titleMatches =
        !selection.title ||
        normalizeResumeTitle(selection.title).toLocaleLowerCase("ru") ===
          optionTitle.toLocaleLowerCase("ru");
      if (idMatches && titleMatches) matches.push({ locator: option, resume });
    }

    if (matches.length !== 1) {
      return { selected: false, availableResumes };
    }

    const match = matches[0];
    if (!match) return { selected: false, availableResumes };
    await match.locator.click({ timeout: this.config.timeouts.element });
    await control
      .getByText(match.resume.title, { exact: true })
      .waitFor({ state: "visible", timeout: this.config.timeouts.element });
    return { selected: true, resume: match.resume, availableResumes };
  }

  async hasSubmitButton(root?: Locator): Promise<boolean> {
    return (await this.#detector.submitButton(this.page, root)) !== undefined;
  }

  async submit(
    root?: Locator,
    expectedCoverLetter?: string,
    expectedResume?: ResumeSummary,
  ): Promise<void> {
    const normalizedLetter = expectedCoverLetter?.trim();
    if (normalizedLetter) {
      const field = await this.#detector.coverLetterField(this.page);
      if (!field || (await field.inputValue()) !== normalizedLetter) {
        throw new HhTechnicalError(
          "UNEXPECTED_PAGE_STATE",
          "Cover letter was provided but is not present in the HH application form",
        );
      }
    }

    if (expectedResume) {
      const selectedTitle = await this.page.locator(HhSelectors.resumeTitle).first().textContent();
      if (normalizeResumeTitle(selectedTitle ?? "") !== expectedResume.title) {
        throw new HhTechnicalError(
          "UNEXPECTED_PAGE_STATE",
          "Selected resume changed before HH application submission",
        );
      }
    }

    const button = await this.#detector.submitButton(this.page, root);
    if (!button) throw new HhTechnicalError("SELECTOR_NOT_FOUND", "Application submit button not found");
    this.#dryRun = false;
    this.#submissionArmed = true;
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

  private async installNavigationGuard(): Promise<void> {
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
        (this.#dryRun && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) ||
        (!this.#submissionArmed && knownSubmissionUrlPattern.test(request.url()))
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
            ...HhSelectors.applicationContinue,
            ...HhSelectors.questionnaire,
            ...HhSelectors.submissionSuccess,
            ...HhSelectors.captcha,
          ],
        },
        { timeout: this.config.timeouts.applicationTransition },
      )
      .catch(() => undefined);
  }

  private async continueApplicationWarning(): Promise<boolean> {
    const bySelector = await firstVisible(this.page, HhSelectors.applicationContinue);
    const byRole = this.page
      .getByRole("button", { name: HhTextPatterns.applicationContinue })
      .first();
    const control =
      bySelector ?? ((await byRole.isVisible().catch(() => false)) ? byRole : undefined);
    if (!control) return false;
    await control.click({ timeout: this.config.timeouts.element });
    return true;
  }

  private async revealCoverLetterField(): Promise<Locator | undefined> {
    const bySelector = await firstVisible(this.page, HhSelectors.coverLetterToggle);
    const byRole = this.page
      .getByRole("button", { name: HhTextPatterns.addCoverLetter })
      .first();
    const byText = this.page.getByText(HhTextPatterns.addCoverLetter, { exact: true }).first();
    const toggle =
      bySelector ??
      ((await byRole.isVisible().catch(() => false))
        ? byRole
        : (await byText.isVisible().catch(() => false))
          ? byText
          : undefined);
    if (!toggle) return undefined;

    const addControl = toggle.getByText(HhTextPatterns.addCoverLetter).first();
    const clickTarget = (await addControl.isVisible().catch(() => false)) ? addControl : toggle;
    await clickTarget.click({ timeout: this.config.timeouts.element });
    await this.page
      .waitForFunction(
        ({ selectors }) =>
          selectors.some((selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            return style.visibility !== "hidden" && style.display !== "none";
          }),
        { selectors: [...HhSelectors.coverLetter] },
        { timeout: this.config.timeouts.element },
      )
      .catch(() => undefined);
    return this.#detector.coverLetterField(this.page);
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

function normalizeResumeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
