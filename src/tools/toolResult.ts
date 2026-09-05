import type { CallToolResult } from "@modelcontextprotocol/server";
import type { HhToolResult } from "../domain/results.js";

export function toMcpToolResult(result: HhToolResult): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: { ...result },
    ...(result.status === "FAILED" ? { isError: true } : {}),
  };
}
