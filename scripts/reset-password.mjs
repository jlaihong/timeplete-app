#!/usr/bin/env node
/**
 * One-shot: hash a new password with Better Auth's scrypt and call
 * `_admin/import:rehashCognitoPassword` on the timeplete cloud deployment to
 * overwrite the `MIGRATE:cognito:<email>` sentinel.
 *
 * Usage (from the timeplete-app dir):
 *   node scripts/reset-password.mjs <email>
 * Prompts for the new password twice (input hidden). Runs against whatever
 * deployment CONVEX_DEPLOYMENT in .env.local points at.
 */
import { hashPassword } from "better-auth/crypto";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the app dir from this script's own location (scripts/ -> ..) so the
// script is portable across machines/checkouts instead of a hardcoded path.
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.setEncoding("utf8");
    let answer = "";
    function onData(ch) {
      ch = String(ch);
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(answer);
        } else if (c === "\u0003") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return reject(new Error("Aborted."));
        } else if (c === "\u007f" || c === "\b") {
          answer = answer.slice(0, -1);
        } else {
          answer += c;
        }
      }
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/reset-password.mjs <email>");
    process.exit(1);
  }

  const newPassword = await promptHidden(`New password for ${email}: `);
  if (!newPassword || newPassword.length < 6) {
    console.error("Password must be at least 6 chars.");
    process.exit(1);
  }
  const confirmPassword = await promptHidden("Confirm new password: ");
  if (confirmPassword !== newPassword) {
    console.error("Passwords don't match.");
    process.exit(1);
  }

  process.stdout.write("Hashing password (Better Auth scrypt)... ");
  const newPasswordHash = await hashPassword(newPassword);
  process.stdout.write("done\n");

  const args = JSON.stringify({ email, newPasswordHash });
  process.stdout.write("Calling Convex mutation via npx convex run...\n");
  const r = spawnSync(
    "npx",
    ["convex", "run", "--no-push", "_admin/import:rehashCognitoPassword", args],
    {
      cwd: APP_DIR,
      stdio: "inherit",
    },
  );
  if (r.status !== 0) {
    console.error(`convex run exited with status ${r.status}`);
    process.exit(r.status ?? 1);
  }
  console.log(`\nSuccess. You can now sign in to ${email} with the new password.`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
