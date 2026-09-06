import { McpServer } from "@modelcontextprotocol/server";
import type { HhAutomationService } from "../application/HhAutomationService.js";
import { registerApplicationContextTool } from "../tools/applicationContextTool.js";
import { registerInspectVacancyTool } from "../tools/inspectVacancyTool.js";
import { registerPrepareApplicationTool } from "../tools/prepareApplicationTool.js";
import { registerSessionStatusTool } from "../tools/sessionStatusTool.js";
import { registerSubmitApplicationTool } from "../tools/submitApplicationTool.js";

const instructions =
  "HH execution layer only. hh_submit_application creates a real job application and is the only destructive tool. " +
  "Use hh_prepare_application for a safe dry-run first. Never treat a click, FAILED result, CAPTCHA, questionnaire, or unknown UI as a successful submission. " +
  "hh_get_application_context exposes factual vacancy and resume text for an external agent; this server does not score vacancies, analyze resume fit, choose APPLY/SKIP, generate cover letters, or answer employer questions.";

export function createHhMcpServer(service: HhAutomationService): McpServer {
  const server = new McpServer(
    { name: "hh-mcp", version: "0.1.0" },
    { instructions },
  );
  registerSessionStatusTool(server, service);
  registerInspectVacancyTool(server, service);
  registerApplicationContextTool(server, service);
  registerPrepareApplicationTool(server, service);
  registerSubmitApplicationTool(server, service);
  return server;
}
