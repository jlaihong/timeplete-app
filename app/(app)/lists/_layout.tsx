import { Stack } from "expo-router";
import { Colors } from "../../../constants/colors";

export default function ListsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surfaceContainer },
        headerTintColor: Colors.text,
      }}
    />
  );
}
