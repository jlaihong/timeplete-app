import { Stack } from "expo-router";
import { stackHeaderChromeOptions } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

export default function ListsLayout() {
  const isDesktop = useIsDesktop();
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...stackHeaderChromeOptions,
        headerShown: !isDesktop,
        // The index is a tab root with nothing to go back to. It must not
        // define `headerLeft` at all: iOS draws an empty glass capsule for
        // a header item that renders nothing.
        headerLeft:
          route.name === "index" ? undefined : () => <DrawerMenuButton />,
      })}
    />
  );
}
