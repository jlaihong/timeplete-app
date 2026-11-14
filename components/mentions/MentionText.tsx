import React, { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { mentionSegments, parseMentions } from "../../lib/mentions";
import { usePages } from "../../hooks/usePages";
import { openPage } from "../../lib/openPage";

/**
 * Stored text drawn for reading: mentions show the page's current name
 * and open the page when pressed.
 */
export function MentionText({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { nameFor } = usePages();
  const segments = useMemo(
    () => mentionSegments(parseMentions(text, nameFor)),
    [text, nameFor],
  );
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((s, i) =>
        s.pageId ? (
          <Text
            key={i}
            style={mentionStyles.link}
            accessibilityRole="link"
            onPress={(e) =>
              openPage(
                s.pageId!,
                (e as unknown as { nativeEvent?: MouseEvent }).nativeEvent,
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
  );
}

export const mentionStyles = StyleSheet.create({
  // Colour only: a mention must take exactly the room its letters do, so
  // the same style can sit over a text field without shifting the lines.
  link: { color: Colors.primary },
});
