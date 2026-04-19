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

const siteUrl = process.env.SITE_URL!;

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    trustedOrigins: [siteUrl, "timeplete://"],
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
