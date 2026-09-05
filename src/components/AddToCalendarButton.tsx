"use client";

// Add-to-calendar: generates a small iCalendar (.ics) file from the session
// and downloads it. Opens in the OS calendar app on mobile; imports into
// Google/Outlook/Apple Calendar on desktop. No third-party dependency.
export function AddToCalendarButton({
  title,
  startAt,
  endAt,
  description,
}: {
  title: string;
  startAt: string;
  endAt: string;
  description?: string | null;
}) {
  const add = () => {
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Haibu//Session//EN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@haibu`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(new Date(startAt))}`,
      `DTEND:${fmt(new Date(endAt))}`,
      `SUMMARY:${title.replace(/,/g, "\\,")}`,
      `DESCRIPTION:${(description ?? "").replace(/\n/g, "\\n").replace(/,/g, "\\,")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "haibu-session.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={add}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-pill bg-bg-card-hover px-4 text-[13px] font-semibold text-text-primary transition-colors hover:bg-bg-card-hover/80"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      Add to calendar
    </button>
  );
}
