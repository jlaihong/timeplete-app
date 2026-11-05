/**
 * API key minting and hashing. The raw key is shown once at creation
 * and is never stored. Callers persist `hashApiKey(apiKey)` only.
 */

export async function hashApiKey(apiKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(apiKey),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type AgentKeyEnvironment = "local" | "production";

/** Anything other than the exact value `production` is the localhost backend. */
export function agentKeyEnvironment(
  raw: string | undefined,
): AgentKeyEnvironment {
  return raw === "production" ? "production" : "local";
}

export function agentKeyTokenPrefix(environment: AgentKeyEnvironment): string {
  return environment === "production" ? "tp_prod_" : "tp_local_";
}

export function agentKeyLabel(environment: AgentKeyEnvironment): string {
  return environment === "production" ? "Production" : "Localhost";
}

/** Keychain item name. Localhost and production stay in separate entries. */
export function agentKeyStoreName(environment: AgentKeyEnvironment): string {
  return environment === "production"
    ? "timeplete-agent-production"
    : "timeplete-agent-localhost";
}

export function generateApiKey(environment: AgentKeyEnvironment): {
  apiKey: string;
  keyPrefix: string;
} {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const tokenPrefix = agentKeyTokenPrefix(environment);
  const apiKey = `${tokenPrefix}${body}`;
  return { apiKey, keyPrefix: `${tokenPrefix}${body.slice(0, 4)}` };
}
