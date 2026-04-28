import { Stack } from "expo-router";
import { Colors } from "../../../constants/colors";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";

export default function ListsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surfaceContainer },
        headerTintColor: Colors.text,
        headerLeft: () => <DrawerMenuButton />,
      }}
    />
  );
}
