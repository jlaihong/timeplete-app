import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";

export function useAuth() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const [userStored, setUserStored] = useState(false);
  const storeInFlight = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !userStored && !storeInFlight.current) {
      storeInFlight.current = true;
      storeUser()
        .then(() => setUserStored(true))
        .catch((err) => {
          console.error("Failed to store user:", err);
          storeInFlight.current = false;
        });
    }
    if (!isAuthenticated) {
      setUserStored(false);
      storeInFlight.current = false;
    }
  }, [isAuthenticated, storeUser, userStored]);

  const profile = useQuery(
    api.users.getProfile,
    isAuthenticated && userStored ? {} : "skip"
  );

  const { data: session } = authClient.useSession();

  return {
    isAuthenticated: isAuthenticated && userStored,
    isLoading: isLoading || (isAuthenticated && !userStored),
    user: session?.user ?? null,
    profile: profile ?? null,
    isApproved: profile?.isApproved ?? true,
  };
}
