export const technicalErrorCodes = [
  "NAVIGATION_FAILED",
  "SELECTOR_NOT_FOUND",
  "BROWSER_CRASHED",
  "UNEXPECTED_PAGE_STATE",
] as const;

export type TechnicalErrorCode = (typeof technicalErrorCodes)[number];

export type TechnicalError = {
  code: TechnicalErrorCode;
  message: string;
};

export class HhTechnicalError extends Error {
  readonly code: TechnicalErrorCode;

  constructor(code: TechnicalErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HhTechnicalError";
    this.code = code;
  }
}

export function asTechnicalError(error: unknown): TechnicalError {
  if (error instanceof HhTechnicalError) {
    return { code: error.code, message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const code: TechnicalErrorCode =
    normalized.includes("browser") || normalized.includes("target page")
      ? "BROWSER_CRASHED"
      : normalized.includes("timeout") || normalized.includes("navigation")
        ? "NAVIGATION_FAILED"
        : "UNEXPECTED_PAGE_STATE";

  return { code, message };
}
