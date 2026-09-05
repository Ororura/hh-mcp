import type { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { emptyInputSchema, sessionOutputSchema } from "./schemas.js";
import { toMcpToolResult } from "./toolResult.js";

export function registerSessionStatusTool(server: McpServer, service: HhAutomationService): void {
  server.registerTool(
    "hh_session_status",
    {
      title: "HH session status",
      description: "Check whether the persistent HH.ru applicant session is authenticated. Never enters credentials.",
      inputSchema: emptyInputSchema,
      outputSchema: sessionOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => toMcpToolResult(await service.sessionStatus()),
  );
}
