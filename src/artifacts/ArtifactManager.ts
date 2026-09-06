import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export class ArtifactManager {
  constructor(private readonly artifactsDir: string) {}

  async screenshot(page: Page, vacancyId: string, reason: string): Promise<string> {
    await mkdir(this.artifactsDir, { recursive: true });
    const filename = `${timestamp()}_vacancy-${safeSegment(vacancyId)}_${safeSegment(reason)}.png`;
    const artifactPath = path.resolve(this.artifactsDir, filename);
    await page.screenshot({ path: artifactPath, fullPage: true });
    return artifactPath;
  }

  async tracePath(label: string): Promise<string> {
    const tracesDir = path.resolve(this.artifactsDir, "traces");
    await mkdir(tracesDir, { recursive: true });
    return path.resolve(tracesDir, `${timestamp()}_${safeSegment(label)}.zip`);
  }
}
