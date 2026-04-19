import { Stack } from "expo-router";
import { Colors } from "../../../constants/colors";

export default function EditTrackableLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surfaceContainer },
        headerTintColor: Colors.text,
      }}
    />
  );
}
