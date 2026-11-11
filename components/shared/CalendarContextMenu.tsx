import { Platform, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";
import { isWeb } from "./CalendarViewShared";
import { calendarViewStyles as styles } from "./CalendarViewStyles";

/* ────────────────────────────────────────────────────────────────────────
 *  CalendarContextMenu — right-click dropdown on calendar
 *
 *  Content varies by `state.kind`:
 *    - "event" → Edit, delete this event, and (for a series) delete this
 *      and following instances
 *    - "empty" → Create event at this time
 *
 *  Rendered with `position: fixed` (web) so it floats above the
 *  scrollable timeline and isn't clipped. The menu is dismissed by
 *  the document-level pointerdown / keydown listeners in
 *  `CalendarView` — see `data-calendar-context-menu` on the wrapper.
 * ──────────────────────────────────────────────────────────────────────── */
export type CalendarContextMenuKind =
  | { kind: "event"; x: number; y: number; eventId: Id<"timeWindows"> }
  | { kind: "empty"; x: number; y: number; startMinutes: number };

export function CalendarContextMenu({
  state,
  onDelete,
  onDeleteFollowing,
  onEdit,
  onCreate,
}: {
  state: CalendarContextMenuKind;
  onDelete: () => void;
  /** Set for a recurring instance. Omits the following-instances item. */
  onDeleteFollowing?: () => void;
  onEdit: () => void;
  onCreate: () => void;
}) {
  // Approximate menu size so we can clamp position to the viewport.
  // Real measurement would need a layout pass; this is close enough
  // and avoids a flicker at the wrong position on first paint.
  const itemCount = state.kind === "empty" ? 1 : onDeleteFollowing ? 3 : 2;
  const APPROX_W = onDeleteFollowing ? 360 : 220;
  const APPROX_H = itemCount * 40 + 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const left = vw ? Math.min(state.x, vw - APPROX_W - 8) : state.x;
  const top = vh ? Math.min(state.y, vh - APPROX_H - 8) : state.y;

  return (
    <View
      style={[
        styles.contextMenu,
        { left, top } as any,
        Platform.OS === "web" ? ({ position: "fixed" } as any) : null,
      ]}
      // Marker so the document-level pointerdown listener knows clicks
      // within the menu shouldn't dismiss it before the item's onPress.
      ref={(node: any) => {
        if (!isWeb) return;
        const el = (node as HTMLElement | null) ?? null;
        if (el) el.setAttribute("data-calendar-context-menu", "1");
      }}
    >
      {state.kind === "event" ? (
        <>
          <TouchableOpacity
            style={styles.contextMenuItem}
            onPress={onEdit}
            accessibilityLabel="Edit event"
          >
            <Ionicons name="create-outline" size={16} color={Colors.text} />
            <Text style={[styles.contextMenuItemText, { color: Colors.text }]}>
              Edit
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.contextMenuItem}
            onPress={onDelete}
            accessibilityLabel={
              onDeleteFollowing ? "Delete this instance" : "Delete time window"
            }
          >
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={[styles.contextMenuItemText, { color: Colors.error }]}>
              {onDeleteFollowing ? "Delete this instance" : "Delete"}
            </Text>
          </TouchableOpacity>
          {onDeleteFollowing ? (
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={onDeleteFollowing}
              accessibilityLabel="Delete this and following instances"
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={[styles.contextMenuItemText, { color: Colors.error }]}>
                Delete this and following instances
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <TouchableOpacity
          style={styles.contextMenuItem}
          onPress={onCreate}
          accessibilityLabel="Create event at this time"
        >
          <Ionicons name="add" size={16} color={Colors.primary} />
          <Text style={[styles.contextMenuItemText, { color: Colors.text }]}>
            Create event at this time
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
