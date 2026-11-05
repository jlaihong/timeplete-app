import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { isAgentAction, normalizeKeyName, normalizeScopes } from "../lib/agentActions";
import {
  agentKeyEnvironment,
  agentKeyLabel,
  agentKeyStoreName,
  generateApiKey,
  hashApiKey,
} from "../lib/agentCredentials";

function currentEnvironment() {
  return agentKeyEnvironment(process.env.AGENT_KEY_ENV);
}

const MAX_ACTIVE_KEYS = 10;

export const environment = query({
  args: {},
  handler: async () => {
    const environment = currentEnvironment();
    return {
      environment,
      label: agentKeyLabel(environment),
      storeName: agentKeyStoreName(environment),
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes.filter(isAgentAction),
      environment: row.environment ?? null,
      revokedAt: row.revokedAt ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      createdAt: row._creationTime,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const name = normalizeKeyName(args.name);
    if (!name.ok) throw new Error(name.message);
    const scopes = normalizeScopes(args.scopes);
    if (!scopes.ok) throw new Error(scopes.message);

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    const active = existing.filter((row) => row.revokedAt === undefined).length;
    if (active >= MAX_ACTIVE_KEYS) {
      throw new Error(
        "You can have at most 10 active API keys. Revoke one first.",
      );
    }

    const environment = currentEnvironment();
    const { apiKey, keyPrefix } = generateApiKey(environment);
    const keyHash = await hashApiKey(apiKey);
    const keyId = await ctx.db.insert("apiKeys", {
      userId: user._id,
      name: name.value,
      keyPrefix,
      keyHash,
      scopes: scopes.value,
      environment,
    });

    return {
      keyId,
      apiKey,
      keyPrefix,
      name: name.value,
      scopes: scopes.value,
      environment,
      label: agentKeyLabel(environment),
      storeName: agentKeyStoreName(environment),
    };
  },
});

export const updateScopes = mutation({
  args: {
    id: v.id("apiKeys"),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const scopes = normalizeScopes(args.scopes);
    if (!scopes.ok) throw new Error(scopes.message);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) throw new Error("API key not found");
    if (row.revokedAt !== undefined) throw new Error("This API key is revoked.");
    await ctx.db.patch(args.id, { scopes: scopes.value });
    return { scopes: scopes.value };
  },
});

export const revoke = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) throw new Error("API key not found");
    if (row.revokedAt !== undefined) return null;
    await ctx.db.patch(args.id, { revokedAt: Date.now() });
    return null;
  },
});
