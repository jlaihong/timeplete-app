import { Stack } from "expo-router";
import { stackHeaderChromeOptions } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DesktopBrandedHeaderTitle } from "../../../components/layout/DesktopBrandedHeaderTitle";

export default function ListsLayout() {
  const isDesktop = useIsDesktop();
  return (
    <Stack
      screenOptions={{
        ...stackHeaderChromeOptions,
        headerLeft: () => <DrawerMenuButton />,
        ...(isDesktop
          ? {
              headerTitleAlign: "left",
              headerTitle: (props) => (
                <DesktopBrandedHeaderTitle
                  subtitle={
                    typeof props.children === "string"
                      ? props.children
                      : undefined
                  }
                />
              ),
            }
          : {}),
      }}
    />
  );
}
