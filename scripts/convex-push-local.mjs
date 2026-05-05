#!/usr/bin/env node
/**
 * Pushes Convex functions to the already-running local backend (no prompts,
 * does not restart the daemon).
 *
 * 1. Preferred: `.convex/local/default/config.json` (from `npx convex dev`).
 * 2. Worktree fallback (no `.convex`): `EXPO_PUBLIC_CONVEX_URL` or `CONVEX_URL`
 *    from `.env.local`, plus admin key via `CONVEX_DEPLOY_ADMIN_KEY` in env
 *    or `.env.local`.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configRel = ".convex/local/default/config.json";
const configPath = join(root, configRel);

function parseDotEnv(path) {
  /** @type {Record<string, string>} */
  const env = {};
  if (!existsSync(path)) return env;
  const text = readFileSync(path, "utf8");
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

/** @returns {{ url: string, adminKey: string }} */
function resolvePushTarget() {
  if (existsSync(configPath)) {
    const { ports, adminKey } = JSON.parse(readFileSync(configPath, "utf8"));
    const cloud = ports?.cloud;
    if (typeof cloud !== "number" || !adminKey) {
      console.error(`[convex-push-local] Invalid ${configRel} (missing ports.cloud or adminKey).`);
      process.exit(1);
    }
    return { url: `http://127.0.0.1:${cloud}`, adminKey };
  }

  const envLocal = parseDotEnv(join(root, ".env.local"));
  const url =
    process.env.CONVEX_CLOUD_URL?.trim() ||
    envLocal.EXPO_PUBLIC_CONVEX_URL?.trim() ||
    envLocal.CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim();

  const adminKey =
    process.env.CONVEX_DEPLOY_ADMIN_KEY?.trim() ||
    envLocal.CONVEX_DEPLOY_ADMIN_KEY?.trim();

  if (!url || !adminKey) {
    console.error(`[convex-push-local] Missing push target:\n`);
    console.error(`  • Either add ${configRel} (Convex writes this when configured), or`);
    console.error(
      `  • Set EXPO_PUBLIC_CONVEX_URL (or CONVEX_URL) in .env.local and set CONVEX_DEPLOY_ADMIN_KEY\n` +
        `    in the environment or .env.local (from the Convex local config adminKey field).\n`,
    );
    process.exit(1);
  }

  return { url: url.replace(/\/+$/, ""), adminKey };
}

const { url, adminKey } = resolvePushTarget();

const r = spawnSync(
  "npx",
  [
    "convex",
    "deploy",
    "--url",
    url,
    "--admin-key",
    adminKey,
    "--typecheck",
    "disable",
    "--check-build-environment",
    "disable",
  ],
  { cwd: root, stdio: "inherit", shell: false },
);

process.exit(r.status ?? 1);
