/**
 * Ensures Convex URLs exist when `.env.local` is missing (e.g. Cursor web
 * preview / agents that bundle without gitignored env files). Values are also
 * exposed via `expo.extra` for runtime fallback in `lib/convexEnv.ts`.
 *
 * When env points at loopback but the ports are stale (Convex picked a fresh
 * pair like 3210/3211 vs an old 3212/3213 `.env`), we probe for an open TCP
 * pair before Metro bundles — fixes Better Auth/WebSocket "Failed to fetch".
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function isLoopbackHostname(hostname) {
  const h =
    hostname === "[::1]" ? "::1" : hostname.replace(/^\[|\]$/g, "");
  return (
    h === "localhost" || h === "127.0.0.1" || h === "::1"
  );
}

/**
 * @param {string | undefined} cloudUrl
 * @param {string | undefined} siteUrl
 * @returns {[number, number] | null}
 */
function parseLoopbackPortPair(cloudUrl, siteUrl) {
  if (!cloudUrl || !siteUrl) return null;
  try {
    const c = new URL(cloudUrl.trim());
    const s = new URL(siteUrl.trim());
    if (!(c.protocol === "http:" || c.protocol === "https:")) return null;
    if (!(s.protocol === "http:" || s.protocol === "https:")) return null;
    if (
      !isLoopbackHostname(c.hostname) ||
      !isLoopbackHostname(s.hostname)
    ) {
      return null;
    }
    const cp = Number(c.port);
    const sp = Number(s.port);
    if (!Number.isFinite(cp) || !Number.isFinite(sp)) return null;
    return [cp, sp];
  } catch {
    return null;
  }
}

/** @returns {[number, number] | null} */
function readConvexPortsFromConfigFile() {
  try {
    const configPath = path.join(
      __dirname,
      ".convex/local/default/config.json",
    );
    const j = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const cloud = Number(j?.ports?.cloud);
    const site = Number(j?.ports?.site);
    if (!Number.isFinite(cloud) || !Number.isFinite(site)) return null;
    return [cloud, site];
  } catch {
    return null;
  }
}

/** @returns {{ cloud: number, site: number }} */
function convexPortsFallbackOnly() {
  const filePair = readConvexPortsFromConfigFile();
  if (filePair)
    return { cloud: filePair[0], site: filePair[1] };
  return { cloud: 3212, site: 3213 };
}

/**
 * @param {number} port
 * @param {{ timeoutMs?: number, host?: string }} [opts]
 */
function tcpListeningSync(port, opts = {}) {
  const ms = opts.timeoutMs ?? 120;
  const host = opts.host ?? "127.0.0.1";
  const p = Number(port);
  if (!Number.isFinite(p) || p < 1 || p > 65535) return false;

  const src = `
    try {
      const net = require("net");
      const s = net.createConnection({ port: ${p}, host: ${JSON.stringify(
        host,
      )} }, () => { process.stdout.write("ok"); process.exit(0); });
      s.setTimeout(${Math.floor(ms)});
      s.on("timeout", () => process.exit(1));
      s.on("error", () => process.exit(1));
    } catch (_) { process.exit(1); }
  `
    .replace(/\s+/g, " ")
    .trim();

  const r = spawnSync(process.execPath, ["-e", src], {
    encoding: "utf8",
    timeout: Math.floor(ms + 250),
    windowsHide: true,
    shell: false,
  });

  return r.stdout === "ok" && r.status === 0;
}

/** @type {ReadonlySet<string>} */
const BUILTIN_LOOPBACK_CONVEX_PAIRS = new Set([
  "3210,3211",
  "3212,3213",
]);

/** @param {[number, number]} pair */
function loopbackConvexPairOpens(pair) {
  const [c, s] = pair;
  return tcpListeningSync(c) && tcpListeningSync(s);
}

/**
 * Convex dev often ends up on 3210/3211 (one toolchain) vs 3212/3213 (README
 * examples). README-copied `.env.local` tuples should not win probing when
 * *both* port pairs accidentally accept TCP (stale/other processes) — trial
 * the common live pairs before trusting env literals.
 *
 * Truly custom `[cloud, site]` from `.env` is still honoured after CLI
 * `.convex/.../config.json` because it won't match builtins.
 *
 * @param {string | undefined} mergedCloud
 * @param {string | undefined} mergedSite
 * @returns {{ convexUrl: string, convexSiteUrl: string } | null}
 */
function resolveDiscoveredLoopbackConvexUrls(mergedCloud, mergedSite) {
  try {
    if (!mergedCloud?.trim?.() || !mergedSite?.trim?.()) return null;
    const c = new URL(mergedCloud.trim());
    const s = new URL(mergedSite.trim());
    if (
      !isLoopbackHostname(c.hostname) ||
      !isLoopbackHostname(s.hostname)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  /** @type {Array<[number, number]>} */
  const pairs = [];
  const seen = new Set();

  function push(pair) {
    const [a, b] = pair;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    const k = `${a},${b}`;
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push([a, b]);
  }

  const fromFile = readConvexPortsFromConfigFile();
  const envPair = parseLoopbackPortPair(
    mergedCloud?.trim?.(),
    mergedSite?.trim?.(),
  );
  const envKey = envPair && `${envPair[0]},${envPair[1]}`;
  const envIsBuiltin =
    envPair && envKey !== undefined && BUILTIN_LOOPBACK_CONVEX_PAIRS.has(envKey);

  if (fromFile) push(fromFile);
  if (envPair && !envIsBuiltin) push(envPair);
  push([3210, 3211]);
  push([3212, 3213]);

  for (const pair of pairs) {
    if (!loopbackConvexPairOpens(pair)) continue;
    const [cloudP, siteP] = pair;
    return {
      convexUrl: `http://127.0.0.1:${cloudP}`,
      convexSiteUrl: `http://127.0.0.1:${siteP}`,
    };
  }
  return null;
}

/** @type {import('@expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require("./app.json");
  const envLocal = parseEnvLocal();

  const mergedCloud =
    (envLocal.EXPO_PUBLIC_CONVEX_URL || process.env.EXPO_PUBLIC_CONVEX_URL || "").trim();

  const mergedSite = (
    envLocal.EXPO_PUBLIC_CONVEX_SITE_URL ||
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL ||
    ""
  ).trim();

  const ports = convexPortsFallbackOnly();

  const discovered = resolveDiscoveredLoopbackConvexUrls(
    mergedCloud || undefined,
    mergedSite || undefined,
  );

  const convexUrl =
    discovered?.convexUrl ||
    mergedCloud ||
    `http://127.0.0.1:${ports.cloud}`;
  const convexSiteUrl =
    discovered?.convexSiteUrl ||
    mergedSite ||
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
