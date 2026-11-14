import { FontSize, Radius } from "../../theme/tokens";
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
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { DialogMaxHeightContext } from "./useDialogKeyboardShift";

import { DialogOverlay, type DialogOverlayProps } from "./DialogOverlay";

export { DialogOverlay, type DialogOverlayProps };

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
  // Native `DialogOverlay` provides a pixel height cap (keyboard-aware, and
  // required because the overlay's anchor wrappers break the percentage
  // `maxHeight` in `cardMobile`/`cardDesktop` — percentages can't resolve
  // against a content-sized parent). Undefined on web.
  //
  // Applied LAST and merged with any caller `maxHeight` via `min` so a
  // dialog's own (smaller) cap survives while the keyboard cap still wins
  // when the keyboard shrinks the available space below it.
  const contextMax = React.useContext(DialogMaxHeightContext);
  const flat = StyleSheet.flatten(style);
  const callerMax = flat?.maxHeight;
  const callerHeight = flat?.height;
  const effectiveMax =
    contextMax != null
      ? typeof callerMax === "number"
        ? Math.min(contextMax, callerMax)
        : contextMax
      : undefined;
  // A caller-fixed pixel height must be clamped to the cap explicitly:
  // relying on `height` + `maxHeight` together collapses the card on
  // Android Fabric when the keyboard cap kicks in (seen with
  // EditTrackableDialog), while a single resolved height works.
  const clampedHeight =
    effectiveMax != null && typeof callerHeight === "number"
      ? Math.min(callerHeight, effectiveMax)
      : undefined;
  return (
    <View
      style={[
        styles.cardBase,
        isDesktop
          ? [styles.cardDesktop, { width: desktopWidth }, desktopHeight ? { height: desktopHeight } : null]
          : styles.cardMobile,
        style,
        effectiveMax != null ? { maxHeight: effectiveMax } : null,
        clampedHeight != null ? { height: clampedHeight } : null,
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
  /** One quiet line under the title, e.g. what the dialog is about to log. */
  subtitle?: string;
  /** Colour dot before the title, for a dialog about one list or trackable. */
  colour?: string;
}

/**
 * Surface every dialog card shares, for the few dialogs that keep their own
 * card component (they carry keyboard handling `DialogCard` doesn't).
 */
export const dialogSurfaceStyle = {
  backgroundColor: Colors.surfaceContainerHigh,
  borderRadius: Radius.lg,
  padding: 24,
} as const;

/**
 * Phones show every form dialog as a sheet anchored to the bottom edge
 * (near the thumb, and above the keyboard); wider screens centre it.
 * Spread `align` onto `DialogOverlay` and `cardStyle` LAST onto the card.
 */
export function usePhoneSheet(): {
  isPhone: boolean;
  align: "bottom" | "center";
  cardStyle: ViewStyle | null;
} {
  const { width } = useWindowDimensions();
  const isPhone = width < 768;
  return {
    isPhone,
    align: isPhone ? "bottom" : "center",
    cardStyle: isPhone ? phoneSheetCardStyle : null,
  };
}

/**
 * `DialogOverlay` that follows `usePhoneSheet`: bottom-anchored on a
 * phone, centred otherwise. Pair with `usePhoneSheet().cardStyle` on the
 * card inside it.
 */
export function SheetOverlay(props: Omit<DialogOverlayProps, "align">) {
  const { align } = usePhoneSheet();
  return <DialogOverlay {...props} align={align} />;
}

const phoneSheetCardStyle: ViewStyle = {
  width: "100%",
  maxWidth: "100%",
  alignSelf: "stretch",
  borderRadius: 0,
  borderTopLeftRadius: Radius.xl,
  borderTopRightRadius: Radius.xl,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  paddingHorizontal: 20,
  paddingTop: 20,
  paddingBottom: 20,
};

export function DialogHeader({
  title,
  onClose,
  headerActions,
  subtitle,
  colour,
}: DialogHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.headerTitleRow}>
          {colour ? (
            <View style={[styles.headerDot, { backgroundColor: colour }]} />
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
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

export interface DialogMenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Shown in the error colour, e.g. Delete. */
  destructive?: boolean;
}

/**
 * "More actions" menu for a dialog header. Holds the occasional and
 * destructive actions (archive, delete, …) with their names spelled out,
 * so the footer is left for Cancel and Save and nothing irreversible sits
 * one stray click from the primary button.
 */
export function DialogMenu({ items }: { items: DialogMenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  if (items.length === 0) return null;
  return (
    <View style={styles.menuAnchor}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="More actions"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
      </Pressable>
      {open ? (
        <>
          {/* Click-away catcher: anywhere else in the card closes the menu. */}
          <Pressable
            style={styles.menuCatcher}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close menu"
          />
          <View style={styles.menu} accessibilityRole="menu">
            {items.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                style={(state) => [
                  styles.menuItem,
                  ((state as { hovered?: boolean }).hovered ||
                    state.pressed) &&
                    styles.menuItemHover,
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.destructive ? Colors.error : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.menuItemText,
                    item.destructive && { color: Colors.error },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
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
    borderRadius: Radius.lg,
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
    minHeight: 32,
    // Above the body, so the header's menu can drop over it.
    zIndex: 10,
    flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2, paddingRight: 4 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.title,
    lineHeight: 28,
    fontWeight: "600",
    color: Colors.text,
  },
  headerSubtitle: { fontSize: FontSize.body, color: Colors.textSecondary },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  menuAnchor: { position: "relative" },
  menuCatcher: {
    position: "absolute",
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    ...Platform.select({
      web: { cursor: "default" } as any,
      default: {},
    }),
  },
  menu: {
    position: "absolute",
    top: 36,
    right: 0,
    minWidth: 200,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.45)" } as any,
      default: { elevation: 8 },
    }),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  menuItemHover: { backgroundColor: Colors.surfaceContainerHigh },
  menuItemText: { fontSize: FontSize.body, color: Colors.text },
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
