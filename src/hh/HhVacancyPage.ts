import type { Locator, Page } from "playwright";
import type { HhConfig } from "../config/config.js";
import type { VacancySummary } from "../domain/results.js";
import type { VacancyStatus } from "../domain/statuses.js";
import { HhSelectors, HhTextPatterns } from "./HhSelectors.js";
import type { HhUrlPolicy, ParsedVacancyUrl } from "./HhUrlPolicy.js";
import { anyVisible, firstVisible, pageContainsText } from "./locatorUtils.js";

export type VacancyClassification = {
  status: VacancyStatus;
  externalUrl?: string;
};

export class HhVacancyPage {
  readonly vacancy: ParsedVacancyUrl;

  constructor(
    readonly page: Page,
    vacancyUrl: string,
    private readonly urlPolicy: HhUrlPolicy,
    private readonly config: HhConfig,
  ) {
    this.vacancy = urlPolicy.parseVacancyUrl(vacancyUrl);
  }

  async open(): Promise<void> {
    await this.page.goto(this.vacancy.url, {
      waitUntil: "domcontentloaded",
      timeout: this.config.timeouts.navigation,
    });
  }

  async summary(): Promise<VacancySummary> {
    const title = await this.readText(HhSelectors.vacancyTitle);
    const employer = await this.readText(HhSelectors.vacancyEmployer);
    return {
      id: this.vacancy.id,
      url: this.page.url(),
      ...(title ? { title } : {}),
      ...(employer ? { employer } : {}),
    };
  }

  async classify(): Promise<VacancyClassification> {
    if (
      (await anyVisible(this.page, HhSelectors.vacancyClosed)) ||
      (await pageContainsText(this.page, HhTextPatterns.vacancyClosed))
    ) {
      return { status: "VACANCY_CLOSED" };
    }

    if (await this.isAlreadyApplied()) return { status: "ALREADY_APPLIED" };

    const apply = await this.applyEntry();
    if (apply) {
      const href = await apply.getAttribute("href");
      if (href) {
        const target = new URL(href, this.page.url()).toString();
        if (!this.urlPolicy.isAllowedPageUrl(target)) {
          return { status: "EXTERNAL_APPLICATION", externalUrl: target };
        }
      }
      return { status: "AVAILABLE" };
    }

    return { status: "UNSUPPORTED_FLOW" };
  }

  async isAlreadyApplied(): Promise<boolean> {
    return (
      (await anyVisible(this.page, HhSelectors.alreadyApplied)) ||
      (await pageContainsText(this.page, HhTextPatterns.alreadyApplied))
    );
  }

  async questionnaireLikely(): Promise<boolean> {
    return (
      (await anyVisible(this.page, HhSelectors.questionnaire)) ||
      (await pageContainsText(this.page, HhTextPatterns.questionnaire))
    );
  }

  async applyEntry(): Promise<Locator | undefined> {
    return (
      (await firstVisible(this.page, HhSelectors.applyEntry)) ??
      (await this.page.getByRole("button", { name: HhTextPatterns.apply }).first().isVisible().catch(() => false)
        ? this.page.getByRole("button", { name: HhTextPatterns.apply }).first()
        : undefined) ??
      (await this.page.getByRole("link", { name: HhTextPatterns.apply }).first().isVisible().catch(() => false)
        ? this.page.getByRole("link", { name: HhTextPatterns.apply }).first()
        : undefined)
    );
  }

  private async readText(selectors: readonly string[]): Promise<string | undefined> {
    const locator = await firstVisible(this.page, selectors);
    const value = await locator?.textContent();
    const normalized = value?.replace(/\s+/g, " ").trim();
    return normalized || undefined;
  }
}
