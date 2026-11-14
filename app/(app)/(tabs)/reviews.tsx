import React from "react";
import { useLocalSearchParams } from "expo-router";
import { ReviewPanel } from "../../../components/shared/ReviewPanel";

/**
 * `?frequency=DAILY&day=20261113` opens that review, which is how a page's
 * "mentioned in" list links back to the text.
 */
export default function ReviewsScreen() {
  const { frequency, day } = useLocalSearchParams<{
    frequency?: string;
    day?: string;
  }>();
  return <ReviewPanel targetFrequency={frequency} targetDay={day} />;
}
