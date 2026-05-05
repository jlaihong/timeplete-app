import { ScrollView, type ScrollViewProps } from "react-native";

/** Native parity for `ListDialog` body scrolling (see `.web.tsx` for themed scrollbar chrome). */
export function ListDialogScrollView(props: ScrollViewProps) {
  return (
    <ScrollView
      {...props}
      showsVerticalScrollIndicator={
        props.showsVerticalScrollIndicator ?? true
      }
    />
  );
}
