import { createRuntime } from "../runtime.js";

function readVacancyUrl(args: readonly string[]): string {
  const index = args.indexOf("--vacancy-url");
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) {
    throw new Error('Usage: npm run hh:smoke -- --vacancy-url "https://hh.ru/vacancy/<id>"');
  }
  return value;
}

const { service } = createRuntime();
try {
  const result = await service.inspectVacancy(readVacancyUrl(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "FAILED") process.exitCode = 1;
} finally {
  await service.close();
}
