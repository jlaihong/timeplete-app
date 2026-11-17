import React from "react";
import { Platform } from "react-native";
import { Header, getHeaderTitle } from "@react-navigation/elements";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";

/**
 * The same JavaScript-drawn header the bottom tabs use, for a native stack.
 *
 * Android's native stack header always pads itself by the display cutout,
 * whatever inset the app provides. While the timer bar is showing, the app
 * layout hands the screens a top inset of 0 (the bar already sits under the
 * status bar), and the native header ignored that: Lists and Pages showed a
 * blank status-bar-tall strip between the timer bar and the title. This
 * header reads the inset from `SafeAreaInsetsContext`, so it follows the
 * handoff the way the tab headers do.
 */
function JsStackHeader({ options, route, back }: NativeStackHeaderProps) {
  const { headerLeft, headerRight } = options;
  return (
    <Header
      title={getHeaderTitle(options, route.name)}
      back={back}
      headerTintColor={options.headerTintColor}
      headerStyle={options.headerStyle}
      headerTitleStyle={options.headerTitleStyle}
      headerTitleAlign={options.headerTitleAlign}
      headerShadowVisible={options.headerShadowVisible}
      headerLeft={
        headerLeft
          ? ({ tintColor, canGoBack, label, href }) =>
              headerLeft({ tintColor, canGoBack: !!canGoBack, label, href })
          : undefined
      }
      headerRight={
        headerRight
          ? ({ tintColor, canGoBack }) =>
              headerRight({ tintColor, canGoBack: !!canGoBack })
          : undefined
      }
    />
  );
}

/**
 * Spread into a `Stack`'s `screenOptions`. Only Android needs it; iOS and
 * web keep their own header.
 */
export const androidStackHeaderOptions =
  Platform.OS === "android"
    ? { header: (props: NativeStackHeaderProps) => <JsStackHeader {...props} /> }
    : {};
