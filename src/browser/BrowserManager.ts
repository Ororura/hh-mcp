import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright";
import type { ArtifactManager } from "../artifacts/ArtifactManager.js";
import type { HhConfig } from "../config/config.js";
import { BrowserProfileLease } from "./BrowserLock.js";
import { BrowserSession } from "./BrowserSession.js";

export class BrowserManager {
  #context: BrowserContext | undefined;
  readonly #profileLease: BrowserProfileLease;

  constructor(
    private readonly config: HhConfig,
    private readonly artifacts: ArtifactManager,
  ) {
    this.#profileLease = new BrowserProfileLease(config.browserProfileDir);
  }

  async createSession(label: string): Promise<BrowserSession> {
    const context = await this.context();
    let tracePath: string | undefined;
    try {
      if (this.config.trace) {
        tracePath = await this.artifacts.tracePath(label);
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      }
      const reusablePage = context.pages().find((candidate) => candidate.url() === "about:blank");
      const page = reusablePage ?? (await context.newPage());
      page.setDefaultTimeout(this.config.timeouts.element);
      page.setDefaultNavigationTimeout(this.config.timeouts.navigation);
      return new BrowserSession(page, context, tracePath);
    } catch (error) {
      if (tracePath) await context.tracing.stop({ path: tracePath }).catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    const context = this.#context;
    this.#context = undefined;
    if (context) await context.close().catch(() => undefined);
    await this.#profileLease.release();
  }

  private async context(): Promise<BrowserContext> {
    if (this.#context) return this.#context;

    await mkdir(this.config.browserProfileDir, { recursive: true });
    await this.#profileLease.acquire();
    try {
      const context = await chromium.launchPersistentContext(this.config.browserProfileDir, {
        headless: this.config.headless,
        locale: "ru-RU",
        acceptDownloads: false,
        serviceWorkers: "block",
      });
      context.on("close", () => {
        this.#context = undefined;
        void this.#profileLease.release();
      });
      this.#context = context;
      return context;
    } catch (error) {
      await this.#profileLease.release();
      throw error;
    }
  }
}
