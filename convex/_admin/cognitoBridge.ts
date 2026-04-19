/**
 * Server side of the Cognito-fallback login bridge.
 *
 * The browser proves the user knows their old Cognito password by running
 * the SRP handshake against AWS Cognito and obtaining a Cognito-signed
 * `id_token` (a JWT). It then POSTs to `/cognito-migrate-login` with
 * `{email, password, cognitoIdToken}`. This action verifies the JWT
 * against Cognito's JWKS, then hashes the plaintext password with Better
 * Auth's scrypt configuration and overwrites the
 * `MIGRATE:cognito:<email>` sentinel that the migration loader wrote.
 *
 * After this returns 200 the client retries the normal Better Auth
 * `signIn.email` flow, which now succeeds because the credential
 * account holds a real hash matching the typed password.
 *
 * Phase 6 cleanup: this entire file goes away once every migrated user
 * has logged in once. The `MIGRATE:cognito:` sentinel is the canary —
 * if no account in the BA `account` table starts with it any more, this
 * code is dead and safe to delete alongside `_admin/import.ts`.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { hashPassword } from "better-auth/crypto";

const region = process.env.COGNITO_REGION;
const poolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_APP_CLIENT_ID;

const issuer =
  region && poolId ? `https://cognito-idp.${region}.amazonaws.com/${poolId}` : null;

/**
 * Module-scope JWKS cache. `createRemoteJWKSet` keeps the fetched keys
 * in this closure across invocations within the same isolate, so we
 * don't hit Cognito on every login attempt. Lazily constructed because
 * `process.env` may not be populated at module load on cold start.
 */
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!issuer) {
    throw new Error(
      "Cognito env vars not configured (COGNITO_REGION, COGNITO_USER_POOL_ID).",
    );
  }
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(
      new URL(`${issuer}/.well-known/jwks.json`),
    );
  }
  return cachedJwks;
}

export const verifyAndRehash = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    cognitoIdToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    if (!clientId || !issuer) {
      throw new Error(
        "Cognito env vars not configured (COGNITO_APP_CLIENT_ID).",
      );
    }
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Missing email");
    if (!args.password) throw new Error("Missing password");
    if (!args.cognitoIdToken) throw new Error("Missing cognitoIdToken");

    // Signature, expiry, issuer, audience all enforced by jose.
    const { payload } = await jwtVerify(args.cognitoIdToken, getJwks(), {
      issuer,
      audience: clientId,
    });

    // Cognito issues both `id` and `access` tokens from the same pool;
    // only `id` tokens carry the verified `email` claim. Reject anything
    // else outright instead of silently trusting it.
    if (payload.token_use !== "id") {
      throw new Error("Token is not an id token");
    }

    const tokenEmail =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : null;
    if (tokenEmail !== normalizedEmail) {
      throw new Error("Token email does not match request email");
    }

    // Belt-and-braces: only honour Cognito users with a verified email.
    // Users with `email_verified === false` could be impersonations
    // (Cognito allows sign-up before verification on some pool configs).
    if (payload.email_verified !== true && payload.email_verified !== "true") {
      throw new Error("Cognito email is not verified");
    }

    // hashPassword uses crypto.getRandomValues + @noble/hashes scrypt,
    // both available in Convex's V8 isolate — no `"use node"` required.
    const newHash = await hashPassword(args.password);

    await ctx.runMutation(internal._admin.import.rehashCognitoPassword, {
      email: normalizedEmail,
      newPasswordHash: newHash,
    });
  },
});
