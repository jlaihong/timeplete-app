/**
 * A text field that understands mentions. Use it wherever people type
 * free text: typing "@" at the start of a word offers the user's pages,
 * and the chosen one becomes a link.
 *
 * It is a drop-in for a controlled `TextInput`: `value` and
 * `onChangeText` carry the *stored* text (with mention tokens, see
 * `lib/mentions.ts`), while the field itself shows "@Name".
 *
 * A text field can only draw its text in one colour, so on the web the
 * coloured links are drawn by a copy of the text laid exactly over the
 * field, and the field's own letters are made transparent. Phones show
 * the names uncoloured while editing.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputKeyPressEventData,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { AutoGrowTextInput } from "../ui/AutoGrowTextInput";
import {
  applyTextChange,
  findMentionQuery,
  insertMention,
  matchPages,
  mentionSegments,
  parseMentions,
  sanitizePageName,
  serializeMentions,
  type MentionDoc,
} from "../../lib/mentions";
import { rememberCreatedPage, usePages } from "../../hooks/usePages";
import { openPage } from "../../lib/openPage";
import { mentionStyles } from "./MentionText";
import { PAGE_KIND_ICON } from "./pageKinds";
import { MentionPickerPortal, type PickerAnchor } from "./MentionPickerPortal";

const isWeb = Platform.OS === "web";
const useIsoLayoutEffect =
  isWeb && typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface MentionTextInputProps
  extends Omit<TextInputProps, "value" | "onChangeText"> {
  /** Stored text, mention tokens included. */
  value: string;
  onChangeText: (stored: string) => void;
  /** Grow with the text instead of scrolling (multiline). */
  autoGrow?: boolean;
  /** Layout of the field within its parent (flex, margins). */
  containerStyle?: StyleProp<ViewStyle>;
}

type Option =
  | { kind: "page"; page: Doc<"pages"> }
  | { kind: "create"; name: string };

/** The text-shaping parts of a field's style, for the copy laid over it. */
const MIRRORED: (keyof TextStyle)[] = [
  "fontSize",
  "lineHeight",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "textAlign",
  "padding",
  "paddingHorizontal",
  "paddingVertical",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "borderWidth",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
];

/** Screen position of the character at `offset` in the copy of the text. */
function rectOfCharacter(root: HTMLElement, offset: number): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (offset < seen + length) {
      const range = document.createRange();
      range.setStart(node, offset - seen);
      range.setEnd(node, offset - seen + 1);
      return range.getClientRects()[0] ?? range.getBoundingClientRect();
    }
    seen += length;
  }
  return null;
}

export const MentionTextInput = forwardRef<TextInput, MentionTextInputProps>(
  function MentionTextInput(
    {
      value,
      onChangeText,
      autoGrow = false,
      containerStyle,
      style,
      onFocus,
      onBlur,
      onKeyPress,
      onSelectionChange,
      ...props
    },
    forwardedRef,
  ) {
    const inputRef = useRef<TextInput | null>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current as TextInput, []);
    const mirrorRef = useRef<Text | null>(null);
    const wrapperRef = useRef<View | null>(null);

    const { pages, nameFor } = usePages();
    const createPage = useMutation(api.pages.create);

    const doc = useMemo(() => parseMentions(value, nameFor), [value, nameFor]);
    const docRef = useRef(doc);
    docRef.current = doc;

    const [focused, setFocused] = useState(false);
    const [caret, setCaret] = useState<number | null>(null);
    const caretRef = useRef(caret);
    caretRef.current = caret;
    /** The "@" whose picker was closed with Escape. */
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [anchor, setAnchor] = useState<PickerAnchor | null>(null);
    /** Where to put the caret once the next text has been drawn. */
    const pendingCaret = useRef<number | null>(null);
    const [forcedSelection, setForcedSelection] = useState<
      { start: number; end: number } | undefined
    >(undefined);

    const emit = (next: MentionDoc) => onChangeText(serializeMentions(next));

    const readCaret = (): number | null => {
      if (!isWeb) return caretRef.current;
      const node = inputRef.current as unknown as HTMLTextAreaElement | null;
      return node && typeof node.selectionStart === "number"
        ? node.selectionStart
        : caretRef.current;
    };

    /* ── What is being typed after an "@" ─────────────────────────────── */
    const found =
      focused && caret != null
        ? findMentionQuery(doc.text, caret, doc.mentions)
        : null;
    const options = useMemo<Option[]>(() => {
      if (!found) return [];
      const matches = matchPages(pages, found.query);
      const name = sanitizePageName(found.query);
      const exact = pages.some(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      const out: Option[] = matches.map((page) => ({ kind: "page", page }));
      // A name is one word while it is being invented: past the first
      // space the "@" only stays live if it still matches a page.
      if (name && !exact && !name.includes(" ")) {
        out.push({ kind: "create", name });
      }
      return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [found?.query, found?.start, pages]);
    const query =
      found && found.start !== dismissedAt && (options.length > 0 || !found.query)
        ? found
        : null;
    const open = query !== null;
    const queryStart = query?.start ?? null;

    useEffect(() => setActiveIndex(0), [query?.query, queryStart]);
    useEffect(() => {
      if (!found && dismissedAt !== null) setDismissedAt(null);
    }, [found, dismissedAt]);

    /* ── Where the picker goes (web) ──────────────────────────────────── */
    const measure = useCallback(() => {
      if (!isWeb || queryStart === null) return;
      const mirror = mirrorRef.current as unknown as HTMLElement | null;
      const rect =
        (mirror && rectOfCharacter(mirror, queryStart)) ??
        (wrapperRef.current as unknown as HTMLElement | null)
          ?.getBoundingClientRect() ??
        null;
      if (rect) setAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
    }, [queryStart]);

    useIsoLayoutEffect(() => {
      if (!isWeb) return;
      if (queryStart === null) {
        setAnchor(null);
        return;
      }
      measure();
      window.addEventListener("scroll", measure, true);
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("scroll", measure, true);
        window.removeEventListener("resize", measure);
      };
    }, [queryStart, measure, doc.text]);

    /* ── Editing ──────────────────────────────────────────────────────── */
    const handleChangeText = (text: string) => {
      const next = applyTextChange(docRef.current, text);
      docRef.current = next;
      emit(next);
      if (isWeb) setCaret(readCaret());
    };

    useIsoLayoutEffect(() => {
      const target = pendingCaret.current;
      if (target === null) return;
      pendingCaret.current = null;
      if (isWeb) {
        const node = inputRef.current as unknown as HTMLTextAreaElement | null;
        node?.setSelectionRange?.(target, target);
      } else {
        setForcedSelection({ start: target, end: target });
      }
    }, [doc.text]);

    const choose = async (option: Option) => {
      let page: { id: string; name: string };
      if (option.kind === "page") {
        page = { id: option.page._id, name: option.page.name };
      } else {
        try {
          const id = await createPage({ name: option.name });
          rememberCreatedPage(id, option.name);
          page = { id, name: option.name };
        } catch (e) {
          console.error("[mentions] could not create the page:", e);
          return;
        }
      }
      // Typing may have carried on while the page was being created.
      const current = docRef.current;
      const at = readCaret() ?? current.text.length;
      const live = findMentionQuery(current.text, at, current.mentions);
      if (!live) return;
      const result = insertMention(current, live.start, at, page);
      pendingCaret.current = result.caret;
      docRef.current = result.doc;
      setCaret(result.caret);
      emit(result.doc);
    };

    const handleKeyPress = (
      e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    ) => {
      if (open && isWeb) {
        const key = e.nativeEvent.key;
        const stop = () => {
          e.preventDefault();
          e.stopPropagation();
        };
        if (key === "ArrowDown" || key === "ArrowUp") {
          stop();
          const count = Math.max(1, options.length);
          setActiveIndex(
            (i) => (i + (key === "ArrowDown" ? 1 : count - 1)) % count,
          );
          return;
        }
        if ((key === "Enter" || key === "Tab") && options[activeIndex]) {
          stop();
          void choose(options[activeIndex]);
          return;
        }
        if (key === "Escape") {
          stop();
          setDismissedAt(queryStart);
          return;
        }
      }
      onKeyPress?.(e);
    };

    const handleSelectionChange = (
      e: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
    ) => {
      const { start, end } = e.nativeEvent.selection;
      setCaret(start === end ? start : null);
      if (forcedSelection) setForcedSelection(undefined);
      onSelectionChange?.(e);
    };

    /* ── Drawing ──────────────────────────────────────────────────────── */
    const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
    const hasLinks = doc.mentions.length > 0;
    const mirrorStyle = useMemo(() => {
      const out: Record<string, unknown> = {};
      for (const key of MIRRORED) {
        if (flat[key] !== undefined) out[key] = flat[key];
      }
      return out as TextStyle;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [style]);

    const Field = autoGrow ? AutoGrowTextInput : TextInput;
    const showMirror = isWeb;

    return (
      <View ref={wrapperRef} style={[styles.wrapper, containerStyle]}>
        <Field
          ref={inputRef}
          {...props}
          value={doc.text}
          onChangeText={handleChangeText}
          onKeyPress={handleKeyPress}
          onSelectionChange={handleSelectionChange}
          selection={forcedSelection}
          onFocus={(e) => {
            setFocused(true);
            if (isWeb) setCaret(readCaret());
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            style,
            showMirror && hasLinks
              ? ({
                  color: "transparent",
                  caretColor: flat.color ?? Colors.text,
                } as TextStyle)
              : null,
          ]}
        />

        {showMirror ? (
          <View
            style={[styles.mirror, !hasLinks && styles.mirrorHidden]}
            pointerEvents="box-none"
            aria-hidden
          >
            <Text
              ref={mirrorRef}
              style={[
                styles.mirrorText,
                mirrorStyle,
                { color: flat.color ?? Colors.text },
              ]}
            >
              {mentionSegments(doc).map((s, i) =>
                s.pageId ? (
                  <Text
                    key={i}
                    style={[mentionStyles.link, styles.mirrorLink]}
                    onPress={(e) =>
                      openPage(
                        s.pageId!,
                        (e as unknown as { nativeEvent?: MouseEvent })
                          .nativeEvent,
                      )
                    }
                  >
                    {s.text}
                  </Text>
                ) : (
                  s.text
                ),
              )}
            </Text>
          </View>
        ) : null}

        {open ? (
          <MentionPickerPortal anchor={anchor}>
            <View style={styles.picker} accessibilityRole="menu">
              {options.length === 0 ? (
                <Text style={styles.hint}>Type a name to link a page</Text>
              ) : (
                options.map((option, i) => {
                  const active = i === activeIndex;
                  return (
                    <Pressable
                      key={option.kind === "page" ? option.page._id : "create"}
                      onPress={() => void choose(option)}
                      onHoverIn={() => setActiveIndex(i)}
                      accessibilityRole="menuitem"
                      style={[styles.option, active && styles.optionActive]}
                    >
                      <Ionicons
                        name={
                          option.kind === "create"
                            ? "add"
                            : PAGE_KIND_ICON[option.page.kind ?? "other"]
                        }
                        size={16}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.optionText} numberOfLines={1}>
                        {option.kind === "create"
                          ? `Create “${option.name}”`
                          : option.page.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </MentionPickerPortal>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrapper: { alignSelf: "stretch" },
  mirror: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  mirrorHidden: { opacity: 0 },
  // Clicks pass through to the field, except on a link.
  mirrorText: {
    borderColor: "transparent",
    ...(isWeb ? ({ pointerEvents: "none" } as object) : null),
  },
  mirrorLink: isWeb
    ? ({ pointerEvents: "auto", cursor: "pointer" } as object)
    : {},

  picker: {
    padding: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.45)" } as object,
      default: { elevation: 8 },
    }),
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  optionActive: { backgroundColor: Colors.surfaceContainerHigh },
  optionText: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  hint: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: FontSize.body,
    color: Colors.textTertiary,
  },
});
