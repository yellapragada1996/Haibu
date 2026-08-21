// ---------------------------------------------------------------------------
// Booking status → user-facing label/variant, as a pure function of
// (status, facts, viewer-role). This is the single source of truth for the
// badge text — see haibu-booking-status-reference.md §6. Never derive a label
// from the Upcoming/Past view, and never render `cancelled_creator` without
// checking `cancelled_by`.
// ---------------------------------------------------------------------------

export type BookingViewer = "guest" | "creator";

export type BookingFacts = {
  cancelled_by?: string | null;
  needs_review?: boolean | null;
};

const LABELS: Record<string, { guest: string; creator: string }> = {
  reserved: { guest: "Processing", creator: "Processing" },
  confirmed: { guest: "Confirmed", creator: "Confirmed" },
  completed: { guest: "Completed", creator: "Completed" },
  expired: { guest: "Not completed", creator: "Not completed" },
  cancelled_fan: { guest: "You cancelled", creator: "Guest cancelled" },
  cancelled_creator: {
    guest: "Creator cancelled",
    creator: "You cancelled",
  },
  cancelled_admin: { guest: "Cancelled by Haibu", creator: "Cancelled by Haibu" },
  no_show_fan: { guest: "You missed this", creator: "Guest didn't join" },
  no_show_creator: { guest: "Creator didn't join", creator: "You missed this" },
};

export function bookingLabel(
  status: string,
  facts: BookingFacts = {},
  viewer: BookingViewer = "guest",
): string {
  // needs_review overlays the underlying status for the creator only — the
  // guest always sees their real status regardless of review state.
  if (facts.needs_review && viewer === "creator") {
    return "Under review";
  }
  // cancelled_creator + system = mutual no-show (deliberately neutral).
  if (status === "cancelled_creator" && facts.cancelled_by === "system") {
    return "Session didn't happen";
  }
  const entry = LABELS[status];
  if (!entry) return status;
  return viewer === "creator" ? entry.creator : entry.guest;
}

export function bookingBadgeVariant(
  status: string,
): "live" | "confirmed" | "pending" | "cancelled" | "completed" | "error" {
  switch (status) {
    case "completed":
      return "completed";
    case "confirmed":
      return "confirmed";
    case "reserved":
      return "pending";
    default:
      return "cancelled";
  }
}
