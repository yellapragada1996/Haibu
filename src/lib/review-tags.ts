export const REVIEW_WINDOW_MS = 7 * 86400000;

export const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  casual_talk: "How was the conversation? What made it memorable?",
  asmr: "How did the session feel? What stood out?",
  music: "How was the lesson? What would you tell someone considering booking?",
};

export function placeholderForCategory(category: string): string {
  return (
    CATEGORY_PLACEHOLDERS[category] ??
    "How was the session? What stood out?"
  );
}
