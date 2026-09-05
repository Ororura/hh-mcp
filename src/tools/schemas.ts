import { z } from "zod/v4";
import {
  prepareApplicationStatuses,
  sessionStatuses,
  submitApplicationStatuses,
  vacancyStatuses,
} from "../domain/statuses.js";
import { technicalErrorCodes } from "../domain/errors.js";

const vacancyUrl = z
  .url()
  .refine((rawUrl) => {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "hh.ru" || url.hostname.endsWith(".hh.ru")) &&
      /^\/vacancy\/\d+\/?$/.test(url.pathname)
    );
  }, "Expected an HTTPS HH.ru URL matching /vacancy/<numeric-id>");

export const emptyInputSchema = z.object({}).strict();
export const vacancyInputSchema = z.object({ vacancyUrl }).strict();
export const applicationInputSchema = z
  .object({
    vacancyUrl,
    coverLetter: z.string().optional().describe("Cover letter text supplied by the caller"),
  })
  .strict();

const vacancySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  employer: z.string().optional(),
  url: z.string(),
});

const applicationDetailsSchema = z.object({
  canApply: z.boolean().optional(),
  alreadyApplied: z.boolean().optional(),
  questionnaireLikely: z.boolean().optional(),
  coverLetterFieldFound: z.boolean().optional(),
  questionnaireRequired: z.boolean().optional(),
});

const technicalErrorSchema = z.object({
  code: z.enum(technicalErrorCodes),
  message: z.string(),
});

function resultSchema<T extends readonly [string, ...string[]]>(statuses: T) {
  return z.object({
    status: z.enum(statuses),
    vacancy: vacancySchema.optional(),
    application: applicationDetailsSchema.optional(),
    externalUrl: z.string().optional(),
    message: z.string().optional(),
    artifactPath: z.string().optional(),
    tracePath: z.string().optional(),
    error: technicalErrorSchema.optional(),
  });
}

export const sessionOutputSchema = resultSchema(sessionStatuses);
export const vacancyOutputSchema = resultSchema(vacancyStatuses);
export const prepareApplicationOutputSchema = resultSchema(prepareApplicationStatuses);
export const submitApplicationOutputSchema = resultSchema(submitApplicationStatuses);
