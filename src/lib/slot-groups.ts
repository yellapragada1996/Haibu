export type TimeOfDayGroup = "morning" | "afternoon" | "evening";

const GROUP_ORDER: TimeOfDayGroup[] = ["morning", "afternoon", "evening"];

function getTimeOfDay(iso: string): TimeOfDayGroup {
  const hour = new Date(iso).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function groupSlotsByTimeOfDay<T extends { start_at: string }>(
  slots: T[],
): { group: TimeOfDayGroup; slots: T[] }[] {
  const buckets = new Map<TimeOfDayGroup, T[]>();
  for (const s of slots) {
    const g = getTimeOfDay(s.start_at);
    const arr = buckets.get(g);
    if (arr) arr.push(s);
    else buckets.set(g, [s]);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({
    group: g,
    slots: buckets.get(g)!,
  }));
}
