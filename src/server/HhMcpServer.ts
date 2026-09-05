import { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { registerInspectVacancyTool } from "../tools/inspectVacancyTool.js";
import { registerPrepareApplicationTool } from "../tools/prepareApplicationTool.js";
import { registerSessionStatusTool } from "../tools/sessionStatusTool.js";
import { registerSubmitApplicationTool } from "../tools/submitApplicationTool.js";

const instructions =
  "HH execution layer only. hh_submit_application creates a real job application and is the only destructive tool. " +
  "Use hh_prepare_application for a safe dry-run first. Never treat a click, FAILED result, CAPTCHA, questionnaire, or unknown UI as a successful submission. " +
  "This server does not score vacancies, analyze resumes, choose APPLY/SKIP, or generate cover letters.";

export function createHhMcpServer(service: HhAutomationService): McpServer {
  const server = new McpServer(
    { name: "hh-mcp", version: "0.1.0" },
    { instructions },
  );
  registerSessionStatusTool(server, service);
  registerInspectVacancyTool(server, service);
  registerPrepareApplicationTool(server, service);
  registerSubmitApplicationTool(server, service);
  return server;
}
