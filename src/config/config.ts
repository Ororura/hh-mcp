import path from "node:path";
import { z } from "zod/v4";

const booleanString = z.enum(["true", "false"]).optional();

const envSchema = z.object({
  HH_BROWSER_PROFILE_DIR: z.string().min(1).optional(),
  HH_HEADLESS: booleanString,
  HH_TRACE: booleanString,
  HH_ARTIFACTS_DIR: z.string().min(1).optional(),
  HH_HISTORY_PATH: z.string().min(1).optional(),
});

export type HhConfig = {
  projectDir: string;
  browserProfileDir: string;
  headless: boolean;
  trace: boolean;
  artifactsDir: string;
  historyPath: string;
  baseUrl: string;
  timeouts: {
    navigation: number;
    element: number;
    applicationTransition: number;
    submitConfirmation: number;
  };
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  projectDir = process.cwd(),
): HhConfig {
  const parsed = envSchema.parse(env);
  const resolveFromProject = (value: string): string =>
    path.isAbsolute(value) ? value : path.resolve(projectDir, value);

  return {
    projectDir,
    browserProfileDir: resolveFromProject(
      parsed.HH_BROWSER_PROFILE_DIR ?? "data/hh-browser-profile",
    ),
    headless: parsed.HH_HEADLESS === undefined ? true : parsed.HH_HEADLESS === "true",
    trace: parsed.HH_TRACE === "true",
    artifactsDir: resolveFromProject(parsed.HH_ARTIFACTS_DIR ?? "artifacts"),
    historyPath: resolveFromProject(parsed.HH_HISTORY_PATH ?? "data/hh-history.sqlite"),
    baseUrl: "https://hh.ru",
    timeouts: {
      navigation: 15_000,
      element: 10_000,
      applicationTransition: 10_000,
      submitConfirmation: 10_000,
    },
  };
}
