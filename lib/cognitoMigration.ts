/**
 * Browser-side Cognito SRP fallback for users migrated from the legacy
 * productivity-app Postgres dump.
 *
 * Flow (paired with `convex/_admin/cognitoBridge.ts`):
 *   1. Normal Better Auth `signIn.email` fails for a migrated user
 *      because their `account.password` is the `MIGRATE:cognito:<email>`
 *      sentinel, which won't verify against any real password.
 *   2. The login screen calls `needsCognitoMigration({email})` to confirm.
 *   3. We run `authenticateAgainstCognito` here. The SRP handshake runs
 *      entirely in the browser against AWS Cognito; the password never
 *      leaves the device for that round trip.
 *   4. We hand the resulting Cognito-signed `id_token` (a JWT) plus the
 *      typed password to our Convex HTTP endpoint, which verifies the
 *      JWT's signature/issuer/audience/email and rehashes the password
 *      with Better Auth's scrypt config.
 *   5. The login screen then retries `signIn.email`, which now succeeds.
 *
 * This whole module gets deleted in Phase 6 cleanup once everyone has
 * logged in once.
 */

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { getExpoPublicConvexSiteUrl } from "./convexEnv";
import { convexPublicUrlForClient } from "./convexPublicUrl";

const REGION = process.env.EXPO_PUBLIC_COGNITO_REGION;
const USER_POOL_ID = process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
const APP_CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_APP_CLIENT_ID;
const CONVEX_SITE_URL = convexPublicUrlForClient(getExpoPublicConvexSiteUrl());

let cachedPool: CognitoUserPool | null = null;
function getPool(): CognitoUserPool {
  if (!USER_POOL_ID || !APP_CLIENT_ID || !REGION) {
    throw new Error(
      "Cognito client env vars missing (EXPO_PUBLIC_COGNITO_*).",
    );
  }
  if (!cachedPool) {
    cachedPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: APP_CLIENT_ID,
    });
  }
  return cachedPool;
}

/**
 * Performs the SRP handshake with Cognito. Resolves with the ID token
 * if the password is correct, rejects otherwise. Errors are surfaced
 * with their Cognito-provided message so the login UI can show a
 * meaningful failure (e.g. "Password attempts exceeded.").
 */
export function authenticateAgainstCognito(
  email: string,
  password: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: getPool() });
    const details = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    user.authenticateUser(details, {
      onSuccess: (session: CognitoUserSession) => {
        resolve(session.getIdToken().getJwtToken());
      },
      onFailure: (err: Error) => reject(err),
      // We don't ask for new passwords or MFA here — if the user is in
      // one of those states the bridge can't migrate them; surface the
      // challenge as an error so the UI can tell them to use the old
      // app or contact support.
      newPasswordRequired: () =>
        reject(new Error("Password reset required in Cognito; cannot migrate.")),
      mfaRequired: () =>
        reject(new Error("Account requires MFA; cannot migrate via this flow.")),
      totpRequired: () =>
        reject(new Error("Account requires TOTP; cannot migrate via this flow.")),
    });
  });
}

/**
 * Posts the Cognito ID token + plaintext password to the Convex bridge,
 * which re-hashes the password into the existing Better Auth `account`
 * row. After this resolves the caller should retry `signIn.email`.
 */
export async function rehashOnConvex(
  email: string,
  password: string,
  cognitoIdToken: string,
): Promise<void> {
  if (!CONVEX_SITE_URL) {
    throw new Error("EXPO_PUBLIC_CONVEX_SITE_URL is not set.");
  }
  const res = await fetch(`${CONVEX_SITE_URL}/cognito-migrate-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, cognitoIdToken }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(`Cognito migration bridge rejected: ${detail}`);
  }
}
