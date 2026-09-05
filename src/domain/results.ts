import type { TechnicalError } from "./errors.js";
import type { ApplicationStatus, SessionStatus, VacancyStatus } from "./statuses.js";

export type VacancySummary = {
  id: string;
  title?: string;
  employer?: string;
  url: string;
};

export type ApplicationDetails = {
  canApply?: boolean;
  alreadyApplied?: boolean;
  questionnaireLikely?: boolean;
  coverLetterFieldFound?: boolean;
  questionnaireRequired?: boolean;
};

export type BaseToolResult = {
  status: string;
  vacancy?: VacancySummary;
  application?: ApplicationDetails;
  externalUrl?: string;
  message?: string;
  artifactPath?: string;
  tracePath?: string;
  error?: TechnicalError;
};

export type FailedResult = BaseToolResult & {
  status: "FAILED";
  error: TechnicalError;
};

export type SessionStatusResult = BaseToolResult & { status: SessionStatus };
export type InspectVacancyResult = BaseToolResult & { status: VacancyStatus };
export type ApplicationResult = BaseToolResult & { status: ApplicationStatus };
export type HhToolResult = SessionStatusResult | InspectVacancyResult | ApplicationResult;

export function busyResult(): HhToolResult {
  return { status: "BUSY", message: "Another HH browser flow is already active" };
}
