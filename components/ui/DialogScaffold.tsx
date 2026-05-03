import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

interface DialogOverlayProps {
  children: React.ReactNode;
  onBackdropPress: () => void;
  align?: "center" | "bottom";
  zIndex?: number;
}

export function DialogOverlay({
  children,
  onBackdropPress,
  align = "center",
  zIndex = 1000,
}: DialogOverlayProps) {
  return (
    <Pressable
      style={[
        styles.overlay,
        align === "center" ? styles.overlayCenter : styles.overlayBottom,
        { zIndex },
      ]}
      onPress={onBackdropPress}
    >
      <Pressable onPress={(e) => e.stopPropagation?.()}>{children}</Pressable>
    </Pressable>
  );
}

interface DialogCardProps {
  children: React.ReactNode;
  desktopWidth?: number;
  desktopHeight?: number;
  style?: StyleProp<ViewStyle>;
}

export function DialogCard({
  children,
  desktopWidth = 520,
  desktopHeight,
  style,
}: DialogCardProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  return (
    <View
      style={[
        styles.cardBase,
        isDesktop
          ? [styles.cardDesktop, { width: desktopWidth }, desktopHeight ? { height: desktopHeight } : null]
          : styles.cardMobile,
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface DialogHeaderProps {
  title: string;
  onClose: () => void;
  /** Productivity-one-style icon actions before the close button (e.g. archive, delete). */
  headerActions?: React.ReactNode;
}

export function DialogHeader({
  title,
  onClose,
  headerActions,
}: DialogHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.headerRight}>
        {headerActions}
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Close dialog"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={20} color={Colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    ...Platform.select({
      web: { position: "fixed" as any },
      default: {},
    }),
  },
  overlayCenter: { justifyContent: "center", alignItems: "center" },
  overlayBottom: { justifyContent: "flex-end" },
  cardBase: {
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 32,
        elevation: 12,
      },
    }),
  },
  cardDesktop: {
    maxWidth: "94%",
    maxHeight: "90%",
    borderRadius: 12,
    padding: 24,
  },
  cardMobile: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: "600",
    color: Colors.text,
    paddingRight: 4,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    flexShrink: 0,
  },
});
