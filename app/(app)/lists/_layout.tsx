import { Stack } from "expo-router";
import { stackHeaderChromeOptions } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

export default function ListsLayout() {
  const isDesktop = useIsDesktop();
  return (
    <Stack
      screenOptions={{
        ...stackHeaderChromeOptions,
        headerShown: !isDesktop,
        headerLeft: () => <DrawerMenuButton />,
      }}
    />
  );
}
