import type { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import {
  applicationContextInputSchema,
  applicationContextOutputSchema,
} from "./schemas.js";
import { toMcpToolResult } from "./toolResult.js";

export function registerApplicationContextTool(
  server: McpServer,
  service: HhAutomationService,
): void {
  server.registerTool(
    "hh_get_application_context",
    {
      title: "Get HH application context",
      description:
        "Read an HH.ru vacancy description and the exact named resume sections needed by an external agent to draft a factual cover letter. Does not open the application form or submit anything.",
      inputSchema: applicationContextInputSchema,
      outputSchema: applicationContextOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ vacancyUrl, resumeTitle }) =>
      toMcpToolResult(await service.getApplicationContext(vacancyUrl, resumeTitle)),
  );
}
