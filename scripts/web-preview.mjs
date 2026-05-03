/**
 * Starts Expo web with Metro on an ephemeral localhost port, writes the port to
 * `.agent-flow/preview-port` for agent-flow Review links, and avoids ports used
 * by agent-flow itself (3210, 3211, 5173, 6790, 6791).
 *
 * If `EXPO_PUBLIC_CONVEX_SITE_URL` points at local loopback and nothing is
 * listening (e.g. only Expo was started for review), runs `npx convex dev` first
 * so Better Auth login does not fail with "Failed to fetch".
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function parseEnvLocal() {
  /** @type {Record<string, string>} */
  const env = {};
  const envPath = join(root, ".env.local");
  if (!existsSync(envPath)) return env;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function convexPorts() {
  try {
    const configPath = join(root, ".convex/local/default/config.json");
    const j = JSON.parse(readFileSync(configPath, "utf8"));
    return j.ports || { cloud: 3212, site: 3213 };
  } catch {
    return { cloud: 3212, site: 3213 };
  }
}

function getConvexSiteUrl() {
  const envLocal = parseEnvLocal();
  const ports = convexPorts();
  return (
    envLocal.EXPO_PUBLIC_CONVEX_SITE_URL?.trim() ||
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim() ||
    `http://127.0.0.1:${ports.site}`
  );
}

/** Only auto-start `convex dev` when the configured URL is local (not cloud). */
function shouldAutoStartLocalConvex(siteUrl) {
  try {
    const u = new URL(siteUrl);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

function probeUrlsFor(siteUrl) {
  const base = siteUrl.trim().replace(/\/+$/, "");
  const urls = [`${base}/`];
  if (base.includes("127.0.0.1")) {
    urls.push(`${base.replace(/127\.0\.0\.1/g, "localhost")}/`);
  }
  return urls;
}

async function isConvexSiteReachable(siteUrl) {
  for (const url of probeUrlsFor(siteUrl)) {
    try {
      await fetch(url, { method: "GET", signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function waitForConvexSite(siteUrl, proc, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode != null) {
      throw new Error("`npx convex dev` exited before the Convex site came up.");
    }
    if (await isConvexSiteReachable(siteUrl)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out waiting for Convex site at ${siteUrl}. Is the port free and Convex configured?`,
  );
}

const port = await pickPort();
mkdirSync(join(root, ".agent-flow"), { recursive: true });
writeFileSync(join(root, ".agent-flow/preview-port"), `${port}\n`, "utf8");

const siteUrl = getConvexSiteUrl();
let convexProc = null;

if (!(await isConvexSiteReachable(siteUrl))) {
  if (!shouldAutoStartLocalConvex(siteUrl)) {
    console.error(
      `[web:preview] Cannot reach Convex site URL (check network / deployment): ${siteUrl}`,
    );
    process.exit(1);
  }
  console.warn("[web:preview] Local Convex site not reachable; starting `npx convex dev`…");
  convexProc = spawn("npx", ["convex", "dev"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  try {
    await waitForConvexSite(siteUrl, convexProc, 120_000);
  } catch (err) {
    if (convexProc && !convexProc.killed) convexProc.kill("SIGTERM");
    console.error(`[web:preview] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function stopConvexIfStarted() {
  if (convexProc && !convexProc.killed) convexProc.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stopConvexIfStarted();
  process.exit(130);
});
process.on("SIGTERM", stopConvexIfStarted);

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
  stopConvexIfStarted();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
