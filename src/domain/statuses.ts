export const sessionStatuses = [
  "AUTHENTICATED",
  "AUTH_REQUIRED",
  "CAPTCHA_REQUIRED",
  "BUSY",
  "FAILED",
] as const;

export type SessionStatus = (typeof sessionStatuses)[number];

export const vacancyStatuses = [
  "AVAILABLE",
  "ALREADY_APPLIED",
  "VACANCY_CLOSED",
  "AUTH_REQUIRED",
  "CAPTCHA_REQUIRED",
  "EXTERNAL_APPLICATION",
  "UNSUPPORTED_FLOW",
  "BUSY",
  "FAILED",
] as const;

export type VacancyStatus = (typeof vacancyStatuses)[number];

export const prepareApplicationStatuses = [
  "READY_TO_SUBMIT",
  "ALREADY_APPLIED",
  "VACANCY_CLOSED",
  "AUTH_REQUIRED",
  "QUESTIONNAIRE_REQUIRED",
  "CAPTCHA_REQUIRED",
  "EXTERNAL_APPLICATION",
  "RESUME_NOT_FOUND",
  "MISSING_REQUIRED_COVER_LETTER",
  "UNSUPPORTED_FLOW",
  "BUSY",
  "FAILED",
] as const;

export const submitApplicationStatuses = [
  "SUBMITTED",
  "ALREADY_APPLIED",
  "VACANCY_CLOSED",
  "AUTH_REQUIRED",
  "QUESTIONNAIRE_REQUIRED",
  "CAPTCHA_REQUIRED",
  "EXTERNAL_APPLICATION",
  "RESUME_NOT_FOUND",
  "MISSING_REQUIRED_COVER_LETTER",
  "UNSUPPORTED_FLOW",
  "BUSY",
  "FAILED",
] as const;

export const applicationStatuses = [
  ...prepareApplicationStatuses,
  "SUBMITTED",
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export type ToolStatus = SessionStatus | VacancyStatus | ApplicationStatus;

export const diagnosticStatuses = new Set<ToolStatus>([
  "CAPTCHA_REQUIRED",
  "QUESTIONNAIRE_REQUIRED",
  "UNSUPPORTED_FLOW",
  "FAILED",
]);
