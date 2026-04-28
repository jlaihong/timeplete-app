/**
 * Ensures Convex URLs exist when `.env.local` is missing (e.g. Cursor web
 * preview / agents that bundle without gitignored env files). Values are also
 * exposed via `expo.extra` for runtime fallback in `lib/convexEnv.ts`.
 */
const fs = require("fs");
const path = require("path");

function parseEnvLocal() {
  /** @type {Record<string, string>} */
  const env = {};
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return env;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function convexPorts() {
  try {
    const configPath = path.join(__dirname, ".convex/local/default/config.json");
    const j = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return j.ports || { cloud: 3212, site: 3213 };
  } catch {
    return { cloud: 3212, site: 3213 };
  }
}

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require("./app.json");
  const envLocal = parseEnvLocal();
  const ports = convexPorts();

  const convexUrl =
    envLocal.EXPO_PUBLIC_CONVEX_URL ||
    process.env.EXPO_PUBLIC_CONVEX_URL ||
    `http://127.0.0.1:${ports.cloud}`;
  const convexSiteUrl =
    envLocal.EXPO_PUBLIC_CONVEX_SITE_URL ||
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL ||
    `http://127.0.0.1:${ports.site}`;

  return {
    expo: {
      ...appJson.expo,
      extra: {
        ...(appJson.expo.extra || {}),
        EXPO_PUBLIC_CONVEX_URL: convexUrl,
        EXPO_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
      },
    },
  };
};
