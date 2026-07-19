import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { PublicEntry } from "../lib/publicEntry";

/** Root URL — unauthenticated web visitors see the landing page. */
export default function Index() {
  const auth = useAuth();
  return <PublicEntry auth={auth} mode="root" />;
}
