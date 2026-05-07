import React, { type CSSProperties, type ReactElement } from "react";
import { StyleSheet, type ScrollViewProps } from "react-native";
import { TRACKING_HISTORY_SCROLL_DOM_CLASS } from "../../lib/webScrollbarStyles";

/**
 * Chrome (react-native-web): scrollable DOM must not use ScrollViewBase, which forces
 * `scrollbarWidth: 'none'` whenever either indicator flag is false, hiding the draggable thumb.
 *
 * Uses a plain `overflow: auto` div; scrollbar chrome is themed via `.timeplete-tracking-history-scroll-native`
 * plus `[data-tracking-history-scroll]` rules in `webScrollbarStyles.ts` (constant there must match attribute below).
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
    ...(out.minHeight === undefined ? { minHeight: 0 } : null),
    /**
     * Global RTL (`dir=rtl`) moves the vertical scrollbar to the **left** and can
     * lay out `flexDirection: "row"` table rows so the grid sits off-screen. This
     * scroller is a data table — always use LTR flow independent of locale.
     */
    direction: "ltr",
    minWidth: 0,
    boxSizing: "border-box",
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    // `stable` reserves gutter space; combined with RTL it produced empty panes for reviewers.
    scrollbarGutter: "auto",
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

export function TrackingHistoryScroller({
  style,
  contentContainerStyle,
  children,
}: ScrollViewProps): ReactElement {
  return (
    <div
      data-tracking-history-scroll="true"
      className={TRACKING_HISTORY_SCROLL_DOM_CLASS}
      role="region"
      aria-label="Tracking history list"
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
