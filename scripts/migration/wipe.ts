/**
 * Destructive companion to `load.ts`: empties a cloud deployment so a
 * migration (re)load can start from a clean slate.
 *
 * Deletes, in batches via `convex/_admin/wipe.ts`:
 *   - every app table (tasks, timeWindows, trackables, users, ...)
 *   - Better Auth user/session/account/verification rows, so re-imported
 *     users go back through the Cognito-fallback first-login flow
 *
 * Supports the cloud dev deployment (`.env.local`'s CONVEX_DEPLOYMENT)
 * and prod, both via `npx convex run` using the logged-in CLI. Take a
 * snapshot first:
 *
 *   npx convex export --path ~/convex-backups/dev-$(date +%F).zip
 *   npx convex export --prod --path ~/convex-backups/prod-$(date +%F).zip
 *
 * Run via:
 *   npx tsx scripts/migration/wipe.ts --dev
 *   npx tsx scripts/migration/wipe.ts --prod
 */
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "..");

const TARGET: "dev" | "prod" = (() => {
  const wantsDev = process.argv.includes("--dev");
  const wantsProd = process.argv.includes("--prod");
  if (wantsDev === wantsProd) {
    throw new Error("Pass exactly one of --dev / --prod.");
  }
  return wantsProd ? "prod" : "dev";
})();

const APP_TABLES = [
  "tags",
  "lists",
  "listSections",
  "tasks",
  "taskTags",
  "taskDays",
  "userTaskDayOrder",
  "taskListOrdering",
  "rootTaskOrdering",
  "timeWindows",
  "taskTimers",
  "pendingTimerReviews",
  "trackables",
  "trackableDays",
  "trackableDaySeconds",
  "trackerEntries",
  "listTrackableLinks",
  "reviewQuestions",
  "reviewAnswers",
  "taskComments",
  "recurringTasks",
  "deletedRecurringOccurrences",
  "recurringEvents",
  "deletedRecurringEventOccurrences",
  "trackableShares",
  "listShares",
  "pendingListInvites",
  "pushTokens",
  "users",
];

const AUTH_MODELS = ["session", "account", "verification", "user"];

function runConvex(fn: string, args: Record<string, unknown>): unknown {
  const cliArgs = [
    "convex",
    "run",
    fn,
    JSON.stringify(args),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
  ];
  if (TARGET === "prod") cliArgs.push("--prod");
  const out = execFileSync("npx", cliArgs, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = out.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines.slice(i).join("\n").trim();
    if (!candidate) break;
    try {
      return JSON.parse(candidate);
    } catch {
      // keep scanning
    }
  }
  return null;
}

async function confirm(): Promise<void> {
  if (process.env.MIGRATION_CONFIRM === "yes") return;
  const label =
    TARGET === "prod"
      ? "PROD deployment (npx convex run --prod)"
      : "cloud DEV deployment (CONVEX_DEPLOYMENT in .env.local)";
  const exportHint =
    TARGET === "prod"
      ? "npx convex export --prod --path ~/convex-backups/prod.zip"
      : "npx convex export --path ~/convex-backups/dev.zip";
  console.log("");
  console.log("================================================================");
  console.log(`  ABOUT TO DELETE ALL DATA on the ${label}`);
  console.log("");
  console.log("  App tables AND Better Auth users/sessions/accounts.");
  console.log("  Make sure you exported a snapshot first:");
  console.log(`    ${exportHint}`);
  console.log("================================================================");
  console.log("");
  // Prod demands the scarier confirmation phrase.
  const phrase = TARGET === "prod" ? "wipe prod" : "wipe";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) =>
    rl.question(
      `Type \`${phrase}\` to proceed, anything else to abort: `,
      (a) => {
        rl.close();
        resolve(a.trim().toLowerCase());
      },
    ),
  );
  if (answer !== phrase) {
    console.log("Aborted.");
    process.exit(1);
  }
}

async function main() {
  await confirm();

  console.log("\nRow counts before wipe:");
  console.log(JSON.stringify(runConvex("_admin/wipe:countAll", {}), null, 2));

  for (const table of APP_TABLES) {
    let total = 0;
    for (;;) {
      const res = runConvex("_admin/wipe:wipeTable", { table }) as {
        deleted: number;
        done: boolean;
      };
      total += res.deleted;
      if (res.done) break;
    }
    console.log(`  ${table}: deleted ${total}`);
  }

  for (const model of AUTH_MODELS) {
    let total = 0;
    for (;;) {
      const res = runConvex("_admin/wipe:wipeAuthModel", { model }) as {
        deleted: number;
        done: boolean;
      };
      total += res.deleted;
      if (res.done) break;
    }
    console.log(`  betterAuth.${model}: deleted ${total}`);
  }

  console.log("\nRow counts after wipe:");
  console.log(JSON.stringify(runConvex("_admin/wipe:countAll", {}), null, 2));
  console.log("\nWipe complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
