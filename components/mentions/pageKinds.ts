import type { Ionicons } from "@expo/vector-icons";
import type { Doc } from "../../convex/_generated/dataModel";

export type PageKind = NonNullable<Doc<"pages">["kind"]>;

export const PAGE_KINDS: PageKind[] = ["person", "place", "other"];

export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  person: "Person",
  place: "Place",
  other: "Other",
};

export const PAGE_KIND_ICON: Record<PageKind, keyof typeof Ionicons.glyphMap> = {
  person: "person-outline",
  place: "location-outline",
  other: "document-text-outline",
};
