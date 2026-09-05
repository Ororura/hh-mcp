import type { Locator, Page } from "playwright";

export async function firstVisible(page: Page, selectors: readonly string[]): Promise<Locator | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return undefined;
}

export async function anyVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  return (await firstVisible(page, selectors)) !== undefined;
}

export async function anyPresent(page: Page, selectors: readonly string[]): Promise<boolean> {
  for (const selector of selectors) {
    if ((await page.locator(selector).count()) > 0) return true;
  }
  return false;
}

export async function pageContainsText(page: Page, pattern: RegExp): Promise<boolean> {
  return page.getByText(pattern).first().isVisible().catch(() => false);
}
