import { Platform } from "react-native";
import { authClient } from "./auth-client";

/**
 * After email OTP verification, Better Auth returns a session token but the
 * Convex client may not be authenticated yet when we navigate. Bootstrap the
 * session explicitly (same pattern as ConvexBetterAuthProvider's OTT handler),
 * then poll until Better Auth reports an active session.
 */
export async function establishAuthSessionFromToken(
  token: string,
): Promise<boolean> {
  await authClient.getSession({
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  if (Platform.OS === "web") {
    (
      authClient as typeof authClient & {
        crossDomain?: { updateSession: () => void };
      }
    ).crossDomain?.updateSession?.();
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const { data } = await authClient.getSession();
    if (data?.session) {
      await authClient.convex.token();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}
