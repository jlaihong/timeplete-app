import { Stack } from "expo-router";
import { stackHeaderChromeOptions } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";
import { androidStackHeaderOptions } from "../../../components/layout/androidStackHeader";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

export default function PagesLayout() {
  const isDesktop = useIsDesktop();
  return (
    <Stack
      screenOptions={{
        ...stackHeaderChromeOptions,
        ...androidStackHeaderOptions,
        headerShown: !isDesktop,
        headerLeft: () => <DrawerMenuButton />,
      }}
    />
  );
}
