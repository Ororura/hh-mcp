import type { TechnicalError } from "./errors.js";
import type { ResumeContent, ResumeSummary } from "./resume.js";
import type {
  ApplicationContextStatus,
  ApplicationStatus,
  SessionStatus,
  VacancyStatus,
} from "./statuses.js";

export type VacancySummary = {
  id: string;
  title?: string;
  employer?: string;
  url: string;
  description?: string;
  keySkills?: string[];
};

export type ApplicationDetails = {
  canApply?: boolean;
  alreadyApplied?: boolean;
  questionnaireLikely?: boolean;
  coverLetterFieldFound?: boolean;
  coverLetterFilled?: boolean;
  questionnaireRequired?: boolean;
  selectedResume?: ResumeSummary;
  availableResumes?: ResumeSummary[];
};

export type BaseToolResult = {
  status: string;
  vacancy?: VacancySummary;
  resume?: ResumeContent;
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
export type ApplicationContextResult = BaseToolResult & { status: ApplicationContextStatus };
export type ApplicationResult = BaseToolResult & { status: ApplicationStatus };
export type HhToolResult =
  | SessionStatusResult
  | InspectVacancyResult
  | ApplicationContextResult
  | ApplicationResult;

export function busyResult(): HhToolResult {
  return { status: "BUSY", message: "Another HH browser flow is already active" };
}
