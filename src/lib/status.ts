const STATUS_LABELS: Record<string, string> = {
  reserved: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  expired: "Expired",
  cancelled_fan: "Cancelled by you",
  cancelled_creator: "Cancelled by creator",
  cancelled_admin: "Cancelled by admin",
  no_show_fan: "You did not join",
  no_show_creator: "Creator did not join",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
