import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect } from "react";
import { authClient } from "../lib/auth-client";

/**
 * Module-scope guard so the `api.users.store` mutation only fires
 * ONCE per authenticated session — not once per `useAuth()` caller.
 *
 * The hook is called from 30+ different components in this app
 * (everything that needs the profile / approval state). The previous
 * `useRef(false)` guard was per-component-instance, so every page
 * load fired a burst of duplicate `users:store` mutations (47 in
 * 11 s on the production logs). Each one reads ~12 KB to look up
 * the existing user row — adding up to hundreds of KB of read
 * bandwidth per app open even though the mutation writes nothing.
 *
 * Hoisting the guard to module scope makes the mutation a singleton
 * per session: the first `useAuth()` that observes `isAuthenticated`
 * kicks it off, every other caller sees the in-flight promise and
 * skips its own dispatch.
 */
let storeUserInflight: Promise<void> | null = null;
let storeUserCompletedForAuthEpoch = false;
let authEpoch = 0;

export function useAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated) {
      // Reset the singleton when the user signs out so the next sign-in
      // re-runs the upsert against the (potentially-different) account.
      if (storeUserCompletedForAuthEpoch || storeUserInflight) {
        authEpoch++;
        storeUserCompletedForAuthEpoch = false;
        storeUserInflight = null;
      }
      return;
    }
    if (storeUserCompletedForAuthEpoch || storeUserInflight) return;

    const epoch = authEpoch;
    storeUserInflight = storeUser()
      .then(() => {
        if (epoch === authEpoch) storeUserCompletedForAuthEpoch = true;
      })
      .catch((err) => {
        console.error("Failed to store user:", err);
      })
      .finally(() => {
        if (epoch === authEpoch) storeUserInflight = null;
      });
  }, [isAuthenticated, storeUser]);

  const profile = useQuery(
    api.users.getProfile,
    isAuthenticated ? {} : "skip",
  );

  const { data: session } = authClient.useSession();

  return {
    isAuthenticated,
    isLoading,
    user: session?.user ?? null,
    profile,
    /** False while Convex auth is resolving or `users` row / getProfile is not ready yet. */
    profileReady: profile != null,
    isApproved: profile?.isApproved ?? true,
  };
}
