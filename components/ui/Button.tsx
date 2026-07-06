import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Colors } from "../../constants/colors";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
/**
 * `default` — full-width standalone screen buttons (login, forms, etc).
 * `small`  — compact footer buttons for dialogs / sheets / popovers where
 *            the default 12x20 + 16pt sizing crowds a narrow surface.
 */
type ButtonSize = "default" | "small";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "default",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const buttonStyle = [
    styles.base,
    styles[variant],
    size === "small" && styles.baseSmall,
    disabled && styles.disabled,
    style,
  ];
  const labelStyle = [
    styles.text,
    styles[`${variant}Text` as keyof typeof styles],
    size === "small" && styles.textSmall,
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? Colors.onPrimary : Colors.primary}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={labelStyle}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  // Compact footer button for dialogs / sheets — smaller padding + radius
  // so a Cancel/Save pair doesn't dominate a narrow mobile modal.
  baseSmall: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.surfaceContainerHigh },
  outline: {
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  ghost: { backgroundColor: Colors.transparent },
  danger: { backgroundColor: Colors.errorContainer },
  disabled: { opacity: 0.5 },
  text: { fontSize: 16, fontWeight: "600" },
  textSmall: { fontSize: 14 },
  primaryText: { color: Colors.onPrimary } as TextStyle,
  secondaryText: { color: Colors.text } as TextStyle,
  outlineText: { color: Colors.text } as TextStyle,
  ghostText: { color: Colors.primary } as TextStyle,
  dangerText: { color: Colors.error } as TextStyle,
  disabledText: { opacity: 0.5 },
});
