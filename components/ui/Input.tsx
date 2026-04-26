/**
 * Input — Material 3 "filled" text field with a floating label.
 *
 * Mirrors productivity-one's `mat-form-field` (default `appearance="fill"`):
 *   - Filled background with rounded top corners.
 *   - Animated underline (1dp idle, 2dp accent on focus).
 *   - Label sits inside the field at the input baseline when empty &
 *     unfocused (acting as the placeholder), and animates up to the
 *     top in a smaller font when the field gains focus or has a value.
 *   - The native `placeholder` prop is suppressed at rest so it does
 *     not duplicate the label, and only revealed once the label has
 *     floated up — that's where short format hints (`HH:MM`,
 *     `YYYY-MM-DD`) belong.
 *
 * Backwards compatible with the old plain-label API: existing call
 * sites that pass `label`, `placeholder`, `error`, `containerStyle`,
 * `style`, and any standard `TextInput` prop continue to work.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  Platform,
  type StyleProp,
} from "react-native";
import { Colors } from "../../constants/colors";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /**
   * Optional helper / hint text rendered immediately below the field's
   * underline as part of the input's chrome (mirrors Material's
   * `<mat-hint>`). Suppressed when an `error` is present so the two
   * don't stack. Use this instead of a free-floating sibling `<Text>`
   * so the helper sits at a consistent, tight distance from the input
   * regardless of the surrounding container's `gap`.
   */
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const FIELD_HORIZONTAL_PADDING = 12;
const FIELD_MIN_HEIGHT = 56;

// Animation endpoints for the floating label.
const RESTING_TOP = 18; // vertically centered for a single-line 56dp field
const FLOATING_TOP = 6;
const RESTING_FONT = 16;
const FLOATING_FONT = 12;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    containerStyle,
    style,
    value,
    onFocus,
    onBlur,
    placeholder,
    multiline,
    editable = true,
    ...props
  },
  forwardedRef
) {
  const [focused, setFocused] = useState(false);

  const hasValue =
    value !== undefined && value !== null && String(value).length > 0;

  // Multiline fields keep the label permanently floated — there is no
  // sensible "placeholder occupying the input baseline" position when
  // the input grows vertically.
  const shouldFloat = focused || hasValue || !!multiline;

  const inputRef = useRef<TextInput>(null);
  // Expose the inner TextInput via the forwarded ref so callers can
  // call `.focus()`, `.blur()`, etc. — same surface as a plain
  // `TextInput`.
  useImperativeHandle(forwardedRef, () => inputRef.current as TextInput, []);
  const anim = useRef(new Animated.Value(shouldFloat ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: shouldFloat ? 1 : 0,
      duration: 150,
      // fontSize is animated, which is not supported by the native
      // driver — but label transitions are infrequent and small, so
      // this has no perceptible cost.
      useNativeDriver: false,
    }).start();
  }, [shouldFloat, anim]);

  const accent = error
    ? Colors.error
    : focused
      ? Colors.primary
      : Colors.outline;

  const labelColor = error
    ? Colors.error
    : focused
      ? Colors.primary
      : Colors.textSecondary;

  const animatedLabelStyle = {
    top: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [RESTING_TOP, FLOATING_TOP],
    }),
    fontSize: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [RESTING_FONT, FLOATING_FONT],
    }),
    color: labelColor,
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        // Tapping anywhere inside the filled area focuses the input —
        // matches Material's `mat-form-field` click behaviour.
        onPress={() => {
          if (editable) inputRef.current?.focus();
        }}
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          !editable && styles.fieldDisabled,
        ]}
      >
        {label ? (
          <Animated.Text
            // The label is purely decorative for hit-testing.
            pointerEvents="none"
            numberOfLines={1}
            style={[styles.label, animatedLabelStyle]}
          >
            {label}
          </Animated.Text>
        ) : null}
        {label ? (
          // Width-reserving ghost: the floating label is positioned
          // absolutely (so it can animate independently) and therefore
          // contributes 0 to the field's intrinsic width. Without this
          // ghost, a narrow input (e.g. a 2-digit number field) would
          // collapse the field, clipping a long label like
          // "Number of days per week". The ghost sits in normal flow at
          // its largest size with zero rendered height, which forces the
          // flex-column field to size at least to label width without
          // affecting the visible layout. Matches mat-form-field, which
          // always reserves space for its label.
          <Text
            // @ts-expect-error - aria-hidden is web-only and not on Text types.
            aria-hidden
            pointerEvents="none"
            style={styles.labelGhost}
          >
            {label}
          </Text>
        ) : null}

        <TextInput
          ref={inputRef}
          value={value}
          editable={editable}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          // When a label is present, the resting label IS the
          // placeholder (matches P1's `mat-form-field`). The OS
          // placeholder is only revealed once the label has lifted,
          // so short format hints (`HH:MM`, `e.g. 100`) appear after
          // focus instead of competing with the label.
          // When no label is given, the input behaves like a plain
          // text field and the placeholder is always visible.
          placeholder={label ? (shouldFloat ? placeholder : undefined) : placeholder}
          placeholderTextColor={Colors.textTertiary}
          multiline={multiline}
          style={[
            styles.input,
            label ? styles.inputWithLabel : null,
            multiline && styles.inputMultiline,
            style,
          ]}
          {...props}
        />

        <View
          style={[
            styles.underline,
            { backgroundColor: accent, height: focused || error ? 2 : 1 },
          ]}
        />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {helperText && !error ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  field: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: FIELD_HORIZONTAL_PADDING,
    minHeight: FIELD_MIN_HEIGHT,
    justifyContent: "flex-end",
    position: "relative",
    overflow: "hidden",
  },
  fieldMultiline: {
    minHeight: 96,
    paddingTop: 4,
    justifyContent: "flex-start",
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  label: {
    position: "absolute",
    left: FIELD_HORIZONTAL_PADDING,
    // `top` and `fontSize` are driven by the Animated.Value above.
    fontWeight: "400",
    // RN-Web honours these; native ignores them harmlessly.
    ...Platform.select({
      web: { transformOrigin: "left top" } as any,
      default: {},
    }),
  },
  labelGhost: {
    fontSize: RESTING_FONT,
    fontWeight: "400",
    // Collapse vertically so the ghost only contributes width.
    height: 0,
    lineHeight: 0,
    opacity: 0,
    overflow: "hidden",
  },
  input: {
    fontSize: 16,
    color: Colors.text,
    // Bottom padding leaves room for the underline; horizontal padding
    // is provided by the field wrapper so the input itself can sit
    // flush with the label.
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
    margin: 0,
    ...Platform.select({
      // Strip the default browser focus ring — the underline is the
      // focus indicator.
      web: { outlineStyle: "none" } as any,
      default: {},
    }),
  },
  inputWithLabel: {
    // Push the value below the floating label so they don't collide.
    paddingTop: 22,
  },
  inputMultiline: {
    paddingTop: 26,
    minHeight: 80,
    textAlignVertical: "top",
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  error: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
    marginLeft: FIELD_HORIZONTAL_PADDING,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
    marginLeft: FIELD_HORIZONTAL_PADDING,
  },
});
