import type { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { vacancyInputSchema, vacancyOutputSchema } from "./schemas.js";
import { toMcpToolResult } from "./toolResult.js";

export function registerInspectVacancyTool(server: McpServer, service: HhAutomationService): void {
  server.registerTool(
    "hh_inspect_vacancy",
    {
      title: "Inspect HH vacancy",
      description: "Open one HH.ru vacancy and classify its availability and application state without applying.",
      inputSchema: vacancyInputSchema,
      outputSchema: vacancyOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ vacancyUrl }) => toMcpToolResult(await service.inspectVacancy(vacancyUrl)),
  );
}
