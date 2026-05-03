import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import {
  convex,
  crossDomain,
} from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { v } from "convex/values";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "") || s;
}

/** Same dev server as `localhost` vs `127.0.0.1` — browsers send different `Origin`; CORS must allow both. */
function localWebOriginVariants(primary: string): string[] {
  const normalized = stripTrailingSlash(primary.trim());
  const variants = new Set<string>([normalized]);
  try {
    const u = new URL(normalized);
    const altHost =
      u.hostname === "localhost"
        ? "127.0.0.1"
        : u.hostname === "127.0.0.1"
          ? "localhost"
          : null;
    if (altHost) {
      u.hostname = altHost;
      variants.add(stripTrailingSlash(`${u.origin}${u.pathname}`));
    }
  } catch {
    /* keep primary only */
  }
  return [...variants];
}

/**
 * In dev we want any `http://localhost:<port>` (or 127.0.0.1 / [::1]) to be
 * trusted, because the agent-flow worktree workflow spins up an Expo dev
 * server on a fresh, unpredictable port for every task. Hard-coding a port
 * list (8081–8085, 19000–19006) used to work but breaks as soon as an agent
 * picks something else.
 *
 * The CORS layer (`convex-helpers/server/cors.js`, used internally by
 * `authComponent.registerRoutes(..., { cors: true })`) only does exact-string
 * origin matching, so a wildcard string like `http://localhost:*` does NOT
 * help — instead we hand Better Auth a function that, given the live request,
 * echoes the request's own `Origin` back when it's a loopback dev origin.
 * Better Auth then forwards that to corsRouter as an "allowed origin", which
 * makes it write the matching `Access-Control-Allow-Origin` header.
 */
function isLoopbackDevOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1" ||
      u.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

const siteUrlRaw = process.env.SITE_URL?.trim();
if (!siteUrlRaw) {
  throw new Error(
    "Convex env SITE_URL is not set. For Expo Web, set it to your dev origin (e.g. npx convex env set SITE_URL http://localhost:8081).",
  );
}
const siteUrl = stripTrailingSlash(siteUrlRaw);

/**
 * Convex Cloud dev often uses SITE_URL=http://localhost:<metro-default> while agent-flow /
 * previews run Expo Web on arbitrary loopback ports. We still need to mirror those live
 * `Origin`s into trusted origins (see `trustedOrigins` handler below).
 *
 * Narrow trigger: SITE_URL itself is plain HTTP + loopback host (classic local Expo dev).
 */
function siteUrlIndicatesLoopbackHttpDev(u: URL): boolean {
  if (u.protocol !== "http:") return false;
  const h =
    u.hostname === "[::1]" ? "::1" : u.hostname.replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1"
  );
}

let loopbackSiteUrlDev = false;
try {
  loopbackSiteUrlDev = siteUrlIndicatesLoopbackHttpDev(new URL(siteUrl));
} catch {
  loopbackSiteUrlDev = false;
}
const staticTrustedOrigins = [
  ...localWebOriginVariants(siteUrl),
  "timeplete://",
];

/**
 * `true` ↔ the deployment is running locally for development. Convex's local
 * backend sets `CONVEX_CLOUD_URL` to a `127.0.0.1` URL; production deployments
 * have a `*.convex.cloud` URL. We deliberately do NOT widen trustedOrigins on
 * production, even though the function is request-scoped — defense in depth.
 */
const isLocalDevDeployment = (() => {
  const cloud = process.env.CONVEX_CLOUD_URL ?? "";
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[?::1\]?)(:|\/|$)/.test(cloud);
})();

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    trustedOrigins: (request: Request | undefined) => {
      const origins = [...staticTrustedOrigins];
      // Better Auth calls this with `undefined` during init (no live request yet)
      // and again per-request via corsRouter / origin-check middleware.
      const allowEphemeralLoopbackOrigin =
        isLocalDevDeployment || loopbackSiteUrlDev;

      if (allowEphemeralLoopbackOrigin && request) {
        const reqOrigin = request.headers.get("origin");
        if (reqOrigin && isLoopbackDevOrigin(reqOrigin)) {
          origins.push(reqOrigin);
        }
      }
      return origins;
    },
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      expo(),
      convex({ authConfig }),
      crossDomain({ siteUrl }),
    ],
  } satisfies BetterAuthOptions);
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

/**
 * Public probe used by the sign-in screen to decide whether to fall
 * back to the Cognito SRP bridge after a normal `signIn.email` failure.
 *
 * Returns `true` iff there is a Better Auth `credential` account for
 * `email` whose `password` is still the `MIGRATE:cognito:<email>` sentinel
 * written by `_admin.import.importUser`. In that state the user has never
 * logged in to Timeplete and we need to verify their old Cognito password
 * once before swapping the sentinel for a real scrypt hash.
 *
 * Side-channel disclosure note: this leaks "an account for `email` exists
 * in mid-migration state". That is the same disclosure level Better Auth
 * already provides via its sign-up "user already exists" error, so it is
 * acceptable. After Phase 6 cleanup nobody is ever in that state and this
 * query is removed alongside `_admin/`.
 */
export const needsCognitoMigration = query({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) return false;

    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: normalizedEmail }],
    })) as { _id: string } | null;
    if (!user) return false;

    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: user._id },
        { field: "providerId", value: "credential" },
      ],
    })) as { password?: string | null } | null;
    if (!account) return false;

    return (
      typeof account.password === "string" &&
      account.password.startsWith("MIGRATE:cognito:")
    );
  },
});
