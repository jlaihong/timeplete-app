import React, { useRef } from "react";
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { Colors } from "../../constants/colors";

interface ColourSwatchPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  size?: number;
  disabled?: boolean;
  /** Tooltip / accessibility hint shown on hover (web). Defaults to the hex value. */
  tooltip?: string;
}

/**
 * Faithful port of productivity-one's `app-colour-picker`:
 *
 *   <span class="cp-label">Color</span>
 *   <button class="cp-swatch" style="width:28px;height:28px;background:value">
 *     <span class="cp-checker" />
 *   </button>
 *   <input type="color" hidden />
 *
 * The swatch is a small **rounded rectangle** (border-radius 6px), not a
 * circle. Clicking it triggers the browser's native colour picker via the
 * hidden `<input type="color">`. There is no visible hex value text — only
 * a `title` attribute (web tooltip) showing the colour value.
 */
export function ColourSwatchPicker({
  value,
  onChange,
  label = "Color",
  size = 28,
  disabled = false,
  tooltip,
}: ColourSwatchPickerProps) {
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === "web" && nativeInputRef.current) {
      nativeInputRef.current.click();
    }
  };

  const computedTooltip = tooltip ?? value;

  return (
    <View style={styles.row}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={openPicker}
        disabled={disabled}
        // `title` provides the hover tooltip on web (parity with matTooltip).
        // @ts-expect-error - `title` is web-only and not on Pressable types.
        title={computedTooltip}
        style={[
          styles.swatch,
          {
            width: size,
            height: size,
            backgroundColor: value,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <View style={styles.checker} />
      </Pressable>

      {Platform.OS === "web" && (
        <input
          ref={nativeInputRef as any}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  swatch: {
    /* 6px rounded rectangle — matches `app-colour-picker .cp-swatch`. */
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.outline,
    overflow: "hidden",
    ...Platform.select({
      web: { cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)" } as any,
      default: {},
    }),
  },
  checker: { flex: 1 },
});
