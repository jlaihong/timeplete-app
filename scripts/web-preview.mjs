/**
 * Starts Expo web with Metro on an ephemeral localhost port, writes the port to
 * `.agent-flow/preview-port` for agent-flow Review links, and avoids ports used
 * by agent-flow itself (3210, 3211, 5173, 6790, 6791).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_FLOW_PORTS = new Set([3210, 3211, 5173, 6790, 6791]);

function pickPort() {
  return new Promise((resolve, reject) => {
    const listen = () => {
      const s = createServer();
      s.once("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        const port = typeof addr === "object" && addr ? addr.port : null;
        s.close(() => {
          if (port != null && AGENT_FLOW_PORTS.has(port)) listen();
          else if (port != null) resolve(port);
          else reject(new Error("Could not allocate preview port"));
        });
      });
    };
    listen();
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = await pickPort();
mkdirSync(join(root, ".agent-flow"), { recursive: true });
writeFileSync(join(root, ".agent-flow/preview-port"), `${port}\n`, "utf8");

const child = spawn(
  "npx",
  [
    "expo",
    "start",
    "--web",
    "--clear",
    "--host",
    "localhost",
    "--port",
    String(port),
  ],
  { cwd: root, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
