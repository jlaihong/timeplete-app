import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getExpoPublicConvexSiteUrl } from "./convexEnv";
import { convexPublicUrlForClient } from "./convexPublicUrl";

const convexSiteUrl = convexPublicUrlForClient(getExpoPublicConvexSiteUrl());
if (!convexSiteUrl) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_SITE_URL is missing. Run `npx convex dev` once (writes .env.local), restart Expo, or rely on app.config.js defaults for local ports.",
  );
}

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [
    convexClient(),
    ...(Platform.OS === "web"
      ? [crossDomainClient()]
      : [
          expoClient({
            scheme: Constants.expoConfig?.scheme as string,
            storagePrefix: Constants.expoConfig?.scheme as string,
            storage: SecureStore,
          }),
        ]),
  ],
});
