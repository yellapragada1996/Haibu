import { describe, it, expect } from "vitest";
import { bookingLabel, bookingBadgeVariant } from "./status";

describe("bookingLabel (haibu-booking-status-reference.md §6)", () => {
  it("renders the neutral transient states identically for both roles", () => {
    expect(bookingLabel("reserved", {}, "guest")).toBe("Processing");
    expect(bookingLabel("reserved", {}, "creator")).toBe("Processing");
    expect(bookingLabel("confirmed", {}, "guest")).toBe("Confirmed");
    expect(bookingLabel("confirmed", {}, "creator")).toBe("Confirmed");
    expect(bookingLabel("completed", {}, "guest")).toBe("Completed");
    expect(bookingLabel("completed", {}, "creator")).toBe("Completed");
  });

  it("cancelled_fan is first-person for the guest, third-person for the creator", () => {
    expect(bookingLabel("cancelled_fan", {}, "guest")).toBe("You cancelled");
    expect(bookingLabel("cancelled_fan", {}, "creator")).toBe("Guest cancelled");
  });

  it("cancelled_creator splits on cancelled_by", () => {
    expect(
      bookingLabel("cancelled_creator", { cancelled_by: "creator" }, "guest"),
    ).toBe("Creator cancelled");
    expect(
      bookingLabel("cancelled_creator", { cancelled_by: "creator" }, "creator"),
    ).toBe("You cancelled");
    expect(
      bookingLabel("cancelled_creator", { cancelled_by: "system" }, "guest"),
    ).toBe("Session didn't happen");
    expect(
      bookingLabel("cancelled_creator", { cancelled_by: "system" }, "creator"),
    ).toBe("Session didn't happen");
  });

  it("cancelled_admin is neutral on both sides (refund is a separate fact)", () => {
    expect(bookingLabel("cancelled_admin", {}, "guest")).toBe("Cancelled by Haibu");
    expect(bookingLabel("cancelled_admin", {}, "creator")).toBe("Cancelled by Haibu");
  });

  it("no-show labels are first-person for the actor, factual for the other side", () => {
    expect(bookingLabel("no_show_fan", {}, "guest")).toBe("You missed this");
    expect(bookingLabel("no_show_fan", {}, "creator")).toBe("Guest didn't join");
    expect(bookingLabel("no_show_creator", {}, "guest")).toBe("Creator didn't join");
    expect(bookingLabel("no_show_creator", {}, "creator")).toBe("You missed this");
  });

  it("expired reads as neutral, not a real past session", () => {
    expect(bookingLabel("expired", {}, "guest")).toBe("Not completed");
    expect(bookingLabel("expired", {}, "creator")).toBe("Not completed");
  });

  it("needs_review overlays only the creator — the guest always sees their real status", () => {
    expect(bookingLabel("no_show_fan", { needs_review: true }, "creator")).toBe(
      "Under review",
    );
    expect(bookingLabel("no_show_fan", { needs_review: true }, "guest")).toBe(
      "You missed this",
    );
  });

  it("falls back to the raw status for unknown values", () => {
    expect(bookingLabel("bogus", {}, "guest")).toBe("bogus");
  });
});

describe("bookingBadgeVariant", () => {
  it("maps statuses to badge colors", () => {
    expect(bookingBadgeVariant("completed")).toBe("completed");
    expect(bookingBadgeVariant("confirmed")).toBe("confirmed");
    expect(bookingBadgeVariant("reserved")).toBe("pending");
    expect(bookingBadgeVariant("cancelled_fan")).toBe("cancelled");
    expect(bookingBadgeVariant("no_show_fan")).toBe("cancelled");
    expect(bookingBadgeVariant("expired")).toBe("cancelled");
  });
});
