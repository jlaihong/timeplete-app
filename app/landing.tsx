import React from "react";
import { useAuth } from "../hooks/useAuth";
import { PublicEntry } from "../lib/publicEntry";

/** Marketing landing page for unauthenticated web visitors. */
export default function LandingRoute() {
  const auth = useAuth();
  return <PublicEntry auth={auth} mode="landing" />;
}
