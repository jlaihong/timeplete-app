import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";

export function useAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const storeStarted = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !storeStarted.current) {
      storeStarted.current = true;
      storeUser().catch((err) => {
        console.error("Failed to store user:", err);
        storeStarted.current = false;
      });
    }
    if (!isAuthenticated) {
      storeStarted.current = false;
    }
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
