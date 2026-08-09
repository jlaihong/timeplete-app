/**
 * AutoGrowTextInput — multiline text field whose height tracks its
 * content, matching productivity-one's `cdkTextareaAutosize` answer
 * fields.
 *
 * A plain RN `TextInput` keeps whatever height its style gives it and
 * scrolls internally once the text overflows, which hides earlier lines
 * of a long answer. This grows instead, so the whole answer stays
 * visible and the surrounding scroll view does the scrolling.
 *
 * `minHeight` in the passed style is respected as the collapsed height
 * (the equivalent of `cdkAutosizeMinRows`); growth is unbounded unless
 * the caller sets `maxHeight`.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
  type TextStyle,
} from "react-native";

const isWeb = Platform.OS === "web";

// Measurement has to happen before paint or the field visibly jumps a
// frame behind the text; `useLayoutEffect` warns during SSR, which
// Expo Router's static web export runs.
const useMeasureEffect =
  isWeb && typeof window === "undefined" ? useEffect : useLayoutEffect;

function borderHeightOf(style: TextStyle | undefined): number {
  if (!style) return 0;
  const all = typeof style.borderWidth === "number" ? style.borderWidth : 0;
  const top =
    typeof style.borderTopWidth === "number" ? style.borderTopWidth : all;
  const bottom =
    typeof style.borderBottomWidth === "number"
      ? style.borderBottomWidth
      : all;
  return top + bottom;
}

export const AutoGrowTextInput = forwardRef<TextInput, TextInputProps>(
  function AutoGrowTextInput(
    { style, value, onChangeText, onContentSizeChange, onLayout, ...props },
    forwardedRef
  ) {
    const inputRef = useRef<TextInput | null>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current as TextInput, []);

    const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
    const minHeight =
      typeof flattened?.minHeight === "number" ? flattened.minHeight : 0;
    // Both platforms size the box border-box, but the reported content
    // height covers padding only — without this the last line is clipped
    // by the border.
    const borderHeight = borderHeightOf(flattened);

    /** Web: measure the underlying `<textarea>` directly. */
    const resizeWeb = useCallback(() => {
      const node = inputRef.current as unknown as HTMLTextAreaElement | null;
      if (!node || typeof node.scrollHeight !== "number") return;
      // `scrollHeight` never reports less than the current box, so the
      // field could grow but never shrink without collapsing it first.
      node.style.height = "auto";
      const borders = node.offsetHeight - node.clientHeight;
      node.style.height = `${node.scrollHeight + borders}px`;
    }, []);

    useMeasureEffect(() => {
      if (isWeb) resizeWeb();
    }, [value, resizeWeb]);

    /** Native: RN reports the laid-out text height. */
    const [contentHeight, setContentHeight] = useState(0);

    const handleContentSizeChange = (
      e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>
    ) => {
      if (!isWeb) {
        setContentHeight(Math.ceil(e.nativeEvent.contentSize.height));
      }
      onContentSizeChange?.(e);
    };

    const handleLayout = (e: LayoutChangeEvent) => {
      // A width change re-wraps the text, so the height is stale.
      if (isWeb) resizeWeb();
      onLayout?.(e);
    };

    const nativeHeight =
      !isWeb && contentHeight > 0
        ? Math.max(minHeight, contentHeight + borderHeight)
        : undefined;

    return (
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => {
          // Resize from the raw input rather than waiting for the
          // controlled value to round-trip through the parent.
          if (isWeb) resizeWeb();
          onChangeText?.(text);
        }}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        multiline
        textAlignVertical="top"
        style={[
          style,
          // The box is always exactly as tall as its content, so a
          // scrollbar would only ever flicker during resize.
          isWeb ? ({ overflow: "hidden" } as TextStyle) : null,
          nativeHeight != null ? { height: nativeHeight } : null,
        ]}
        {...props}
      />
    );
  }
);
