import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { formatYYYYMMDDtoDDMMM } from "../../lib/dates";
import {
  formatTrackerDialogDuration,
  type TrackerDetailsHistoryRow,
} from "../../lib/editDialogAttributedHistory";
import { TrackingHistoryScroller } from "./TrackingHistoryScroller";
import { useIsDesktop } from "../../hooks/useIsDesktop";

export interface TrackingHistoryTableProps {
  rows: TrackerDetailsHistoryRow[];
  showValueColumn: boolean;
  showTimeColumns: boolean;
  /** Called after user confirms deletion in `TrackingHistoryTable`. */
  onDeleteRow: (row: TrackerDetailsHistoryRow) => void;
  footer?: React.ReactNode;
}

/**
 * Tracking history — desktop table + mobile stacked-card layout.
 *
 * The desktop layout is a 6/7-column grid mirroring productivity-one's
 * mat-table. On a phone (~375–414px wide) the fixed columns alone are
 * ~330px, leaving virtually no room for Comments, so we swap to a
 * two-line stacked card on mobile: meta chips (date + duration + start +
 * value) on the top row, comments below.
 */
export function TrackingHistoryTable({
  rows,
  showValueColumn,
  showTimeColumns,
  onDeleteRow,
  footer,
}: TrackingHistoryTableProps) {
  const isDesktop = useIsDesktop();
  return (
    <View style={styles.trackerTabWrap}>
      <TrackingHistoryScroller
        style={styles.scroll}
        // `contentContainerStyle` is what fixes Android scroll inside a
        // deeply-nested `flex:1` chain (dialogBody → historyTabPane →
        // trackerTabWrap → ScrollView). Without an explicit content
        // container, RN Android can't compute a scrollable content region
        // and pinch/scroll gestures are eaten by the outer surface.
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        showsHorizontalScrollIndicator
      >
        {isDesktop ? (
          <View style={styles.trackerTable}>
            <View style={[styles.trackerDataRow, styles.trackerHeadRowBg]}>
              <View style={styles.trackerIconCol} />
              <Text
                style={[styles.cellHead, styles.trackerDateCol]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                Date
              </Text>
              {showValueColumn ? (
                <Text
                  style={[styles.cellHead, styles.trackerMiniCol]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                >
                  Value
                </Text>
              ) : null}
              {showTimeColumns ? (
                <>
                  <Text
                    style={[styles.cellHead, styles.trackerDurCol]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                  >
                    Duration
                  </Text>
                  <Text
                    style={[styles.cellHead, styles.trackerMiniCol]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                  >
                    Start
                  </Text>
                </>
              ) : null}
              <Text
                style={[styles.cellHead, styles.trackerCommentsHeader]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                Comments
              </Text>
              <View style={styles.trackerDeleteCol} />
            </View>

            {rows.map((row, i) => (
              <View
                key={`${row.source}-${row.id}`}
                style={[
                  styles.trackerDataRow,
                  i % 2 === 1 ? styles.rowZebra : null,
                ]}
              >
                <View style={styles.trackerIconCol}>
                  <Ionicons
                    name={
                      row.source === "tracker_entry"
                        ? "reader-outline"
                        : "calendar-outline"
                    }
                    size={16}
                    color={Colors.textSecondary}
                    accessibilityLabel={
                      row.source === "tracker_entry"
                        ? "Manual entry"
                        : "Calendar event"
                    }
                  />
                </View>

                <Text
                  style={[styles.cellBody, styles.trackerDateCol]}
                  numberOfLines={2}
                >
                  {row.source === "tracker_entry"
                    ? formatYYYYMMDDtoDDMMM(row.dayYYYYMMDD)
                    : formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD)}
                </Text>

                {showValueColumn ? (
                  <Text
                    style={[styles.cellBody, styles.trackerMiniCol]}
                    numberOfLines={2}
                  >
                    {row.source === "tracker_entry"
                      ? row.countValue == null
                        ? "-"
                        : String(row.countValue)
                      : row.syntheticCount == null
                        ? "-"
                        : String(row.syntheticCount)}
                  </Text>
                ) : null}

                {showTimeColumns ? (
                  <>
                    <Text
                      style={[styles.cellBody, styles.trackerDurCol]}
                      numberOfLines={2}
                    >
                      {formatTrackerDialogDuration(row.durationSeconds)}
                    </Text>
                    <Text
                      style={[styles.cellBody, styles.trackerMiniCol]}
                      numberOfLines={2}
                    >
                      {row.startTimeHHMM?.trim() || "-"}
                    </Text>
                  </>
                ) : null}

                <View style={styles.trackerCommentsCol}>
                  <Text style={styles.cellBody} numberOfLines={4}>
                    {row.source === "tracker_entry"
                      ? row.comments?.trim()
                        ? row.comments.trim()
                        : "-"
                      : row.commentsUnified.trim()
                        ? row.commentsUnified
                        : "-"}
                  </Text>
                </View>

                <View style={styles.trackerDeleteCol}>
                  <Pressable
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Delete tracking row"
                    onPress={() => onDeleteRow(row)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={Colors.text}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.mobileList}>
            {rows.map((row) => (
              <MobileTrackingRow
                key={`${row.source}-${row.id}`}
                row={row}
                showValueColumn={showValueColumn}
                showTimeColumns={showTimeColumns}
                onDeleteRow={onDeleteRow}
              />
            ))}
          </View>
        )}
      </TrackingHistoryScroller>
      {footer}
    </View>
  );
}

/** Mobile "card row" — one entry rendered as a two-line block. */
function MobileTrackingRow({
  row,
  showValueColumn,
  showTimeColumns,
  onDeleteRow,
}: {
  row: TrackerDetailsHistoryRow;
  showValueColumn: boolean;
  showTimeColumns: boolean;
  onDeleteRow: (row: TrackerDetailsHistoryRow) => void;
}) {
  const dateLabel =
    row.source === "tracker_entry"
      ? formatYYYYMMDDtoDDMMM(row.dayYYYYMMDD)
      : formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD);

  const valueLabel = !showValueColumn
    ? null
    : row.source === "tracker_entry"
      ? row.countValue == null
        ? null
        : String(row.countValue)
      : row.syntheticCount == null
        ? null
        : String(row.syntheticCount);

  const durationLabel =
    showTimeColumns && (row.durationSeconds ?? 0) > 0
      ? formatTrackerDialogDuration(row.durationSeconds ?? 0)
      : null;
  const startTimeLabel =
    showTimeColumns && row.startTimeHHMM?.trim()
      ? row.startTimeHHMM.trim()
      : null;

  const commentsText =
    row.source === "tracker_entry"
      ? row.comments?.trim() ?? ""
      : row.commentsUnified.trim();

  return (
    <View style={styles.mobileCard}>
      <View style={styles.mobileTopRow}>
        <Ionicons
          name={
            row.source === "tracker_entry"
              ? "reader-outline"
              : "calendar-outline"
          }
          size={16}
          color={Colors.textSecondary}
          accessibilityLabel={
            row.source === "tracker_entry" ? "Manual entry" : "Calendar event"
          }
          style={styles.mobileLeadIcon}
        />
        <Text style={styles.mobileDate} numberOfLines={1}>
          {dateLabel}
        </Text>
        <View style={styles.mobileChipsWrap}>
          {durationLabel ? (
            <View style={styles.mobileChip}>
              <Ionicons
                name="time-outline"
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.mobileChipText}>
                {durationLabel}
                {startTimeLabel ? ` · ${startTimeLabel}` : ""}
              </Text>
            </View>
          ) : startTimeLabel ? (
            <View style={styles.mobileChip}>
              <Ionicons
                name="time-outline"
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.mobileChipText}>{startTimeLabel}</Text>
            </View>
          ) : null}
          {valueLabel != null ? (
            <View style={styles.mobileChip}>
              <Text style={styles.mobileChipText}>{valueLabel}</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete tracking row"
          onPress={() => onDeleteRow(row)}
          style={styles.mobileDeleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.text} />
        </Pressable>
      </View>
      {commentsText ? (
        <Text style={styles.mobileComments} numberOfLines={3}>
          {commentsText}
        </Text>
      ) : null}
    </View>
  );
}

/** Empty / loading placeholders — matches prior `EditTrackableHistoryTab` spacing. */
export function TrackingHistoryPlaceholder({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  // `flexGrow: 1` lets the content fill the ScrollView when the table is
  // short (so borders reach the bottom); with content taller than the
  // ScrollView, it scrolls normally. `paddingBottom` prevents the last
  // row's delete icon from being clipped by rounded card corners.
  scrollContent: { flexGrow: 1, paddingBottom: 12 },
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary, textAlign: "center" },
  trackerTabWrap: {
    gap: 0,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    marginTop: 8,
    paddingHorizontal: 0,
    alignSelf: "stretch",
    width: "100%",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({ direction: "ltr" } as ViewStyle)
      : ({} as ViewStyle)),
  },
  trackerTable: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({ direction: "ltr" } as ViewStyle)
      : ({} as ViewStyle)),
  },
  trackerDataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    columnGap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  trackerHeadRowBg: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  cellHead: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    paddingVertical: 8,
    paddingHorizontal: 2,
    ...(Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as TextStyle) : {}),
  },
  cellBody: {
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  trackerIconCol: {
    width: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  trackerDeleteCol: {
    width: 36,
    minWidth: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    marginLeft: 2,
  },
  trackerDateCol: {
    width: 72,
    flexShrink: 0,
    minWidth: 0,
  },
  trackerMiniCol: {
    width: 44,
    flexShrink: 0,
    minWidth: 0,
    textAlign: "center" as const,
  },
  trackerDurCol: {
    width: 64,
    flexShrink: 0,
    minWidth: 64,
  },
  trackerCommentsCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 2,
  },
  trackerCommentsHeader: {
    flex: 1,
    flexShrink: 1,
    minWidth: 72,
    marginRight: 2,
  },
  rowZebra: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  // ─── Mobile stacked-card styles ─────────────────────────────────
  mobileList: {
    width: "100%",
    alignSelf: "stretch",
  },
  mobileCard: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    gap: 6,
  },
  mobileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileLeadIcon: {
    flexShrink: 0,
  },
  mobileDate: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    flexShrink: 0,
  },
  mobileChipsWrap: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  mobileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  mobileChipText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: "500",
  },
  mobileDeleteBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    flexShrink: 0,
    marginLeft: 2,
  },
  mobileComments: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingLeft: 24,
  },
});
