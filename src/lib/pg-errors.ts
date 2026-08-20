// Postgres error-code detection.
//
// Drizzle 0.45 (node-postgres driver) wraps driver errors: the SQLSTATE lives
// at `error.cause.code` while the top-level `error.code` is undefined. Code
// that only checks `error.code === "23505"` never matches, so genuine unique
// violations were mislabeled (e.g. a slot-taken conflict surfaced as
// "invalid_slot" instead of "slot_taken"). Always check both levels.
export function isPgErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; cause?: unknown };
  if (e.code === code) return true;
  if (e.cause && typeof e.cause === "object") {
    return (e.cause as { code?: unknown }).code === code;
  }
  return false;
}
