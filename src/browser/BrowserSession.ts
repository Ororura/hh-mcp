import type { BrowserContext, Page } from "playwright";

export class BrowserSession {
  #closed = false;

  constructor(
    readonly page: Page,
    private readonly context: BrowserContext,
    readonly tracePath?: string,
  ) {}

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    if (this.tracePath) {
      await this.context.tracing.stop({ path: this.tracePath }).catch(() => undefined);
    }
    await this.page.close().catch(() => undefined);
  }
}
