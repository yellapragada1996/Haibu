export const REVIEW_WINDOW_MS = 7 * 86400000;

export const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  casual_talk: "How was the conversation? What made it memorable?",
  asmr: "How did the session feel? What stood out?",
  music: "How was the lesson? What would you tell someone considering booking?",
};

export const CATEGORY_TAGS: Record<string, string[]> = {
  asmr: [
    "Incredibly relaxing",
    "Great voice",
    "Felt personal",
    "Very creative",
    "Perfect pacing",
    "Helped me sleep",
  ],
  casual_talk: [
    "Great conversationalist",
    "Easy to talk to",
    "Made me laugh",
    "Very genuine",
    "Interesting topics",
    "Good listener",
  ],
  music: [
    "Clear explanations",
    "Patient teacher",
    "Pushed me to improve",
    "Good energy",
    "Well prepared",
    "Fun session",
  ],
};

export function tagsForCategory(category: string): string[] {
  return CATEGORY_TAGS[category] ?? [];
}

export function placeholderForCategory(category: string): string {
  return (
    CATEGORY_PLACEHOLDERS[category] ??
    "How was the session? What stood out?"
  );
}
