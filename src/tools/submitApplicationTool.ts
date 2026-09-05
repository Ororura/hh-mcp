import type { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { applicationInputSchema, submitApplicationOutputSchema } from "./schemas.js";
import { toMcpToolResult } from "./toolResult.js";

export function registerSubmitApplicationTool(server: McpServer, service: HhAutomationService): void {
  server.registerTool(
    "hh_submit_application",
    {
      title: "Submit HH application",
      description:
        "DESTRUCTIVE: submits a real application to an HH.ru vacancy on behalf of the authenticated user. Call only after explicit approval.",
      inputSchema: applicationInputSchema,
      outputSchema: submitApplicationOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ vacancyUrl, coverLetter }) =>
      toMcpToolResult(await service.submitApplication(vacancyUrl, coverLetter)),
  );
}
