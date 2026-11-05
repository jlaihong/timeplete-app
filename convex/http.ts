import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { hashApiKey } from "../lib/agentCredentials";

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

const agentCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function agentJson(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...agentCorsHeaders },
  });
}

function readBearerApiKey(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  if (!token || !token.startsWith("tp_") || token.length < 20) return null;
  return token;
}

async function runAgentCall(
  ctx: ActionCtx,
  request: Request,
  kind: "discover" | "run",
) {
  const apiKey = readBearerApiKey(request);
  if (!apiKey) {
    return agentJson(
      { ok: false, error: { code: "unauthorized", message: "Invalid API key." } },
      401,
    );
  }
  const keyHash = await hashApiKey(apiKey);

  try {
    if (kind === "discover") {
      const outcome = await ctx.runMutation(internal.agentApi.discover, { keyHash });
      return agentJson(outcome.body, outcome.status);
    }

    let body: { action?: unknown; input?: unknown };
    let parseError: string | null = null;
    try {
      body = await request.json();
    } catch {
      body = {};
      parseError = "Body must be JSON.";
    }
    if (!parseError && (!body || typeof body !== "object" || Array.isArray(body))) {
      parseError = "Body must be a JSON object.";
    }
    const action =
      !parseError && typeof body.action === "string" ? body.action.trim() : "";
    if (!parseError && action === "") parseError = "action is required.";

    if (parseError) {
      const auth = await ctx.runMutation(internal.agentApi.discover, { keyHash });
      if (auth.status !== 200) return agentJson(auth.body, auth.status);
      return agentJson(
        { ok: false, error: { code: "bad_input", message: parseError } },
        400,
      );
    }

    const outcome = await ctx.runMutation(internal.agentApi.run, {
      keyHash,
      action,
      input: body.input === undefined ? {} : body.input,
    });
    return agentJson(outcome.body, outcome.status);
  } catch (error) {
    console.error("agent api failed", error);
    return agentJson(
      {
        ok: false,
        error: { code: "internal", message: "Something went wrong." },
      },
      500,
    );
  }
}

http.route({
  path: "/api/agent",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: agentCorsHeaders })),
});

http.route({
  path: "/api/agent",
  method: "GET",
  handler: httpAction(async (ctx, request) => runAgentCall(ctx, request, "discover")),
});

http.route({
  path: "/api/agent",
  method: "POST",
  handler: httpAction(async (ctx, request) => runAgentCall(ctx, request, "run")),
});

export default http;
