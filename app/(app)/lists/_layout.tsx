import { Stack } from "expo-router";
import { Colors, stackHeaderChromeOptions } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";

export default function ListsLayout() {
  return (
    <Stack
      screenOptions={{
        ...stackHeaderChromeOptions,
        headerLeft: () => <DrawerMenuButton />,
      }}
    />
  );
}
