/**
 * Default Expo Metro config, plus a cache key that is unique per checkout.
 *
 * Metro's transform cache lives in a shared temp directory and is keyed by
 * file content, not by absolute path. The app config (`expo.extra`: Convex
 * URLs, workspace label) is inlined into `expo-constants` at transform time,
 * so two worktrees of this repo would otherwise serve each other's cached
 * copy — e.g. a worktree's web app silently talking to another worktree's
 * local Convex backend. Keying the cache on the checkout path and the
 * resolved `extra` keeps each workspace on its own config, and also picks up
 * `.env.local` / `.workspace-label` edits on the next server start.
 */
const crypto = require("crypto");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

let extra = {};
try {
  extra = require("./app.config.js")().expo.extra ?? {};
} catch {
  /* fall back to path-only keying */
}

config.cacheVersion = crypto
  .createHash("sha1")
  .update(String(config.cacheVersion ?? ""))
  .update(__dirname)
  .update(JSON.stringify(extra))
  .digest("hex");

module.exports = config;
