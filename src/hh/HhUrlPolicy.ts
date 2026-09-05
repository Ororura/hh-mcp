export type ParsedVacancyUrl = {
  id: string;
  url: string;
};

export class HhUrlPolicy {
  constructor(private readonly additionalAllowedHosts: ReadonlySet<string> = new Set()) {}

  parseVacancyUrl(rawUrl: string): ParsedVacancyUrl {
    const url = new URL(rawUrl);
    if (!this.isAllowedPageUrl(url.toString())) {
      throw new Error("vacancyUrl must use HTTPS and an allowed HH.ru host");
    }
    const match = /^\/vacancy\/(\d+)\/?$/.exec(url.pathname);
    if (!match?.[1]) throw new Error("vacancyUrl must match /vacancy/<numeric-id>");
    return { id: match[1], url: url.toString() };
  }

  isAllowedPageUrl(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      if (this.additionalAllowedHosts.has(url.host)) {
        return url.protocol === "http:" || url.protocol === "https:";
      }
      return url.protocol === "https:" && (url.hostname === "hh.ru" || url.hostname.endsWith(".hh.ru"));
    } catch {
      return false;
    }
  }
}
