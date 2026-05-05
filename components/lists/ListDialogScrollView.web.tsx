import React, { type CSSProperties, type ReactElement } from "react";
import { StyleSheet, type ScrollViewProps } from "react-native";
import {
  LIST_DIALOG_SCROLL_ATTR_NAME,
  LIST_DIALOG_SCROLL_DOM_CLASS,
} from "../../lib/webScrollbarStyles";

/**
 * Chrome (react-native-web): avoids ScrollView hiding the scrollbar thumb when
 * indicators are disabled; scrollbar is themed alongside tracking history &
 * `[data-*]` selectors in `webScrollbarStyles.ts`.
 */
function stripRnTransformArrays(
  flat: Record<string, unknown>,
  out: CSSProperties,
): void {
  if (Array.isArray(flat.transform)) {
    delete (out as { transform?: unknown }).transform;
  }
}

function domOuterStyle(scrollViewStyle: ScrollViewProps["style"]): CSSProperties {
  const flat = StyleSheet.flatten(scrollViewStyle ?? {}) as Record<string, unknown>;
  const out = { ...(flat as CSSProperties) };
  stripRnTransformArrays(flat, out);
  return {
    ...out,
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  } as CSSProperties;
}

function domInnerStyle(
  contentContainerStyle: ScrollViewProps["contentContainerStyle"],
): CSSProperties | undefined {
  if (contentContainerStyle == null) return undefined;
  const flat = StyleSheet.flatten(
    contentContainerStyle ?? {},
  ) as Record<string, unknown>;
  const out = { ...(flat as CSSProperties) };
  stripRnTransformArrays(flat, out);
  return out;
}

export function ListDialogScrollView({
  style,
  contentContainerStyle,
  children,
}: ScrollViewProps): ReactElement {
  return (
    <div
      {...{ [LIST_DIALOG_SCROLL_ATTR_NAME]: "true" }}
      className={LIST_DIALOG_SCROLL_DOM_CLASS}
      role="region"
      aria-label="List dialog form"
      tabIndex={0}
      style={domOuterStyle(style)}
    >
      {contentContainerStyle != null ? (
        <div style={domInnerStyle(contentContainerStyle)}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
