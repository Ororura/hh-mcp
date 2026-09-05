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
        "Safely inspect and fill an HH.ru application form without final submission. State-changing network requests are blocked.",
      inputSchema: applicationInputSchema,
      outputSchema: prepareApplicationOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ vacancyUrl, coverLetter }) =>
      toMcpToolResult(await service.prepareApplication(vacancyUrl, coverLetter)),
  );
}
