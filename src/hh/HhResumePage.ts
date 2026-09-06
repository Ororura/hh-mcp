import type { Page } from "playwright";
import type { HhConfig } from "../config/config.js";
import type { ResumeContent, ResumeSummary } from "../domain/resume.js";
import { HhSelectors } from "./HhSelectors.js";
import type { HhUrlPolicy } from "./HhUrlPolicy.js";

export type ResumeLookupResult =
  | { found: true; resume: ResumeContent; availableResumes: ResumeSummary[] }
  | { found: false; availableResumes: ResumeSummary[]; unsupported: boolean };

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

export class HhResumePage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
    private readonly urlPolicy: HhUrlPolicy,
    private readonly config: HhConfig,
  ) {}

  async openList(): Promise<void> {
    await this.page.goto(new URL("/applicant/resumes", this.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: this.config.timeouts.navigation,
    });
  }

  async findByExactTitle(expectedTitle: string): Promise<ResumeLookupResult> {
    const candidates = await this.listCandidates();
    if (candidates.length === 0) {
      return { found: false, availableResumes: [], unsupported: true };
    }

    const expected = normalize(expectedTitle);
    const matches = candidates.filter(
      ({ resume, searchableText }) =>
        resume.title === expected || searchableText.includes(expected),
    );
    if (matches.length !== 1) {
      return {
        found: false,
        availableResumes: candidates.map(({ resume }) => resume),
        unsupported: false,
      };
    }

    const match = matches[0];
    if (!match || !this.urlPolicy.isAllowedPageUrl(match.url)) {
      return {
        found: false,
        availableResumes: candidates.map(({ resume }) => resume),
        unsupported: true,
      };
    }

    await this.page.goto(match.url, {
      waitUntil: "domcontentloaded",
      timeout: this.config.timeouts.navigation,
    });

    return {
      found: true,
      availableResumes: candidates.map(({ resume }) => resume),
      resume: {
        ...match.resume,
        title: expected,
        url: this.page.url(),
        ...(await this.readOptionalSections()),
      },
    };
  }

  private async listCandidates(): Promise<
    Array<{ resume: ResumeSummary; url: string; searchableText: string }>
  > {
    const byUrl = new Map<
      string,
      { resume: ResumeSummary; url: string; searchableText: string }
    >();
    for (const selector of HhSelectors.resumeListLink) {
      const links = this.page.locator(selector);
      for (let index = 0; index < await links.count(); index += 1) {
        const link = links.nth(index);
        const href = await link.getAttribute("href");
        const searchableText = normalize((await link.textContent()) ?? "");
        const nestedTitle = normalize(
          (await link.locator(HhSelectors.resumeTitle).first().textContent().catch(() => null)) ?? "",
        );
        const labelledTitle = normalize(
          (await link.getAttribute("aria-label")) ?? (await link.getAttribute("title")) ?? "",
        );
        const title = nestedTitle || labelledTitle || searchableText;
        if (!href || !title || !searchableText) continue;
        const url = new URL(href, this.page.url()).toString();
        if (!this.urlPolicy.isAllowedPageUrl(url)) continue;
        const id = this.resumeId(url);
        if (!id) continue;
        byUrl.set(url, { resume: { id, title }, url, searchableText });
      }
      if (byUrl.size > 0) break;
    }
    return [...byUrl.values()];
  }

  private async readOptionalSections(): Promise<Omit<ResumeContent, keyof ResumeSummary | "url">> {
    const [position, experience, skills, education, about, textSections] = await Promise.all([
      this.readSection(HhSelectors.resumePosition),
      this.readSection(HhSelectors.resumeExperience),
      this.readSection(HhSelectors.resumeSkills),
      this.readSection(HhSelectors.resumeEducation),
      this.readSection(HhSelectors.resumeAbout),
      this.readTextSections(),
    ]);
    return {
      ...(position ? { position } : {}),
      ...(experience || textSections.experience
        ? { experience: experience ?? textSections.experience }
        : {}),
      ...(skills || textSections.skills ? { skills: skills ?? textSections.skills } : {}),
      ...(education || textSections.education
        ? { education: education ?? textSections.education }
        : {}),
      ...(about || textSections.about ? { about: about ?? textSections.about } : {}),
    };
  }

  private async readTextSections(): Promise<{
    experience?: string;
    skills?: string;
    education?: string;
    about?: string;
  }> {
    const body = await this.page
      .locator(HhSelectors.resumePageBody)
      .innerText()
      .catch(() => "");
    const lines = body
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean);
    const boundaries = [
      /^Контакты$/i,
      /^Опыт работы(?:\s*:.*)?$/i,
      /^Навыки$/i,
      /^Образование$/i,
      /^Знание языков$/i,
      /^Подтверждение навыков$/i,
      /^Курсы(?: и повышение квалификации)?$/i,
      /^О себе$/i,
      /^Портфолио$/i,
      /^Рекомендации$/i,
      /^Сканируйте QR-код/i,
      /^HeadHunter$/i,
    ];
    const section = (heading: RegExp): string | undefined => {
      const start = lines.findIndex((line) => heading.test(line));
      if (start < 0) return undefined;
      const relativeEnd = lines
        .slice(start + 1)
        .findIndex((line) => boundaries.some((boundary) => boundary.test(line)));
      const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd;
      const value = lines
        .slice(start + 1, end)
        .filter((line) => !/^(?:Редактировать|Добавить|Развернуть|Указать уровни)$/i.test(line))
        .join(" ");
      return value || undefined;
    };
    const experience = section(/^Опыт работы(?:\s*:.*)?$/i);
    const skills = section(/^Навыки$/i);
    const education = section(/^Образование$/i);
    const about = section(/^О себе$/i);
    return {
      ...(experience ? { experience } : {}),
      ...(skills ? { skills } : {}),
      ...(education ? { education } : {}),
      ...(about ? { about } : {}),
    };
  }

  private async readSection(selectors: readonly string[]): Promise<string | undefined> {
    for (const selector of selectors) {
      const locator = this.page.locator(selector).first();
      if (!(await locator.isVisible().catch(() => false))) continue;
      const value = normalize((await locator.textContent()) ?? "");
      if (value) return value;
    }
    return undefined;
  }

  private resumeId(rawUrl: string): string | undefined {
    const match = /^\/resume\/([^/?#]+)\/?$/.exec(new URL(rawUrl).pathname);
    return match?.[1];
  }
}
