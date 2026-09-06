import type { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { applicationInputSchema, prepareApplicationOutputSchema } from "./schemas.js";
import { toMcpToolResult } from "./toolResult.js";

export function registerPrepareApplicationTool(server: McpServer, service: HhAutomationService): void {
  server.registerTool(
    "hh_prepare_application",
    {
      title: "Prepare HH application (dry run)",
      description:
        "Safely inspect an HH.ru application form, select the requested resume, and fill a cover letter without final submission. State-changing network requests are blocked.",
      inputSchema: applicationInputSchema,
      outputSchema: prepareApplicationOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ vacancyUrl, coverLetter, resume }) =>
      toMcpToolResult(await service.prepareApplication(vacancyUrl, coverLetter, resume)),
  );
}
