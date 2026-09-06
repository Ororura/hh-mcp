import { z } from "zod/v4";
import {
  applicationContextStatuses,
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
export const resumeSelectionInputSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    title: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine(({ id, title }) => Boolean(id || title), "Expected resume.id or resume.title");
export const applicationInputSchema = z
  .object({
    vacancyUrl,
    coverLetter: z.string().optional().describe("Cover letter text supplied by the caller"),
    resume: resumeSelectionInputSchema
      .optional()
      .describe("Resume to select by stable HH ID and/or exact title before submission"),
  })
  .strict();
export const applicationContextInputSchema = z
  .object({
    vacancyUrl,
    resumeTitle: z.string().trim().min(1).max(500),
  })
  .strict();

const vacancySchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  employer: z.string().optional(),
  url: z.string(),
  description: z.string().optional(),
  keySkills: z.array(z.string()).optional(),
});

const resumeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
});

const resumeContentSchema = resumeSummarySchema.extend({
  url: z.string(),
  position: z.string().optional(),
  experience: z.string().optional(),
  skills: z.string().optional(),
  education: z.string().optional(),
  about: z.string().optional(),
});

const applicationDetailsSchema = z.object({
  canApply: z.boolean().optional(),
  alreadyApplied: z.boolean().optional(),
  questionnaireLikely: z.boolean().optional(),
  coverLetterFieldFound: z.boolean().optional(),
  coverLetterFilled: z.boolean().optional(),
  questionnaireRequired: z.boolean().optional(),
  selectedResume: resumeSummarySchema.optional(),
  availableResumes: z.array(resumeSummarySchema).optional(),
});

const technicalErrorSchema = z.object({
  code: z.enum(technicalErrorCodes),
  message: z.string(),
});

function resultSchema<T extends readonly [string, ...string[]]>(statuses: T) {
  return z.object({
    status: z.enum(statuses),
    vacancy: vacancySchema.optional(),
    resume: resumeContentSchema.optional(),
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
export const applicationContextOutputSchema = resultSchema(applicationContextStatuses);
export const prepareApplicationOutputSchema = resultSchema(prepareApplicationStatuses);
export const submitApplicationOutputSchema = resultSchema(submitApplicationStatuses);
