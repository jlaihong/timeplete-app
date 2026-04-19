import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

/**
 * CORS preflight + response helpers for the Cognito-fallback bridge.
 * The browser sign-in screen calls `POST /cognito-migrate-login` from
 * a different origin (Expo dev server / native), so we have to echo back
 * the explicit CORS headers ourselves; `authComponent.registerRoutes`
 * only handles its own routes.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

http.route({
  path: "/cognito-migrate-login",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { headers: corsHeaders })),
});

http.route({
  path: "/cognito-migrate-login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: { email?: unknown; password?: unknown; cognitoIdToken?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Body must be JSON" }, 400);
    }
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      typeof body.cognitoIdToken !== "string"
    ) {
      return jsonResponse(
        { error: "Required fields: email, password, cognitoIdToken" },
        400,
      );
    }

    try {
      await ctx.runAction(internal._admin.cognitoBridge.verifyAndRehash, {
        email: body.email,
        password: body.password,
        cognitoIdToken: body.cognitoIdToken,
      });
      return jsonResponse({ ok: true }, 200);
    } catch (e) {
      // Don't leak the underlying jose / mutation error message verbatim
      // (could expose JWKS URLs, etc); just say the verification failed.
      // The server-side console still has the full error for debugging.
      console.error("cognito-migrate-login failed:", e);
      return jsonResponse({ error: "Cognito verification failed" }, 401);
    }
  }),
});

export default http;
