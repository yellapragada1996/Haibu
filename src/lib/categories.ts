export const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "casual_talk", label: "Casual Talk" },
  { key: "asmr", label: "ASMR" },
  { key: "music", label: "Music" },
] as const;

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
