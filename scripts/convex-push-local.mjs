#!/usr/bin/env node
/**
 * Pushes Convex functions to the already-running local backend (no prompts,
 * does not restart the daemon). Reads `.convex/local/default/config.json`
 * written by Convex — in agent-flow worktrees you typically symlink `.convex`
 * to your main repo clone next to `.env.local`.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const configPath = ".convex/local/default/config.json";

if (!existsSync(configPath)) {
  console.error(
    `[convex-push-local] Missing ${configPath}.\n` +
      `  Symlink .convex to the directory from your main project (where Convex\n` +
      `  was configured), or run \`npx convex dev --configure\` once there.\n`,
  );
  process.exit(1);
}

const { ports, adminKey } = JSON.parse(readFileSync(configPath, "utf8"));
const url = `http://127.0.0.1:${ports.cloud}`;

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
  { stdio: "inherit", shell: false },
);

process.exit(r.status ?? 1);
