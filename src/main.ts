import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createRuntime, stderrLogger } from "./runtime.js";
import { createHhMcpServer } from "./server/HhMcpServer.js";

const { service } = createRuntime();
const handle = serveStdio(() => createHhMcpServer(service), {
  onerror: (error) => stderrLogger.error(`[HH] MCP transport error: ${error.message}`),
});

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await handle.close().catch(() => undefined);
  await service.close().catch((error: unknown) => {
    stderrLogger.error(`[HH] Shutdown error: ${String(error)}`);
  });
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.stdin.once("end", () => void shutdown());
