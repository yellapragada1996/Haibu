import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  bookings as bookingsTable,
  offerings,
  creatorProfiles,
  users,
  reviews,
  blocks,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { CancelSection } from "./CancelSection";
import { JoinSection } from "./JoinSection";
import { ReviewSection } from "./ReviewSection";
import { ReportSection } from "./ReportSection";
import { BlockSection } from "./BlockSection";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { REVIEW_WINDOW_MS } from "@/lib/review-tags";
import { Avatar } from "@/components/ui/Avatar";
import { bookingBadgeVariant, bookingLabel } from "@/lib/status";

const fanUser = alias(users, "fanUser");

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Reject non-UUID ids cleanly (invalid UUIDs would 500 at the DB).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [booking] = await db
    .select({
      id: bookingsTable.id,
      fan_id: bookingsTable.fan_id,
      creator_user_id: creatorProfiles.user_id,
      status: bookingsTable.status,
      cancelled_by: bookingsTable.cancelled_by,
      needs_review: bookingsTable.needs_review,
      effective_payout_cents: bookingsTable.effective_payout_cents,
      created_at: bookingsTable.created_at,
      start_at: bookingsTable.start_at,
      end_at: bookingsTable.end_at,
      price_cents: bookingsTable.price_cents,
      stripe_fee_cents: bookingsTable.stripe_fee_cents,
      daily_room_url: bookingsTable.daily_room_url,
      creator_name: users.display_name,
      creator_avatar: users.avatar_url,
      offering_title: offerings.title,
      offering_duration: offerings.duration_minutes,
      offering_category: offerings.category,
      fan_name: fanUser.display_name,
      fan_avatar: fanUser.avatar_url,
    })
    .from(bookingsTable)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, bookingsTable.creator_id))
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .innerJoin(fanUser, eq(fanUser.id, bookingsTable.fan_id))
    .innerJoin(offerings, eq(offerings.id, bookingsTable.offering_id))
    .where(eq(bookingsTable.id, id));

  // Viewer's timezone — session times render in the viewer's local zone,
  // not the server's (same fix as dashboard / creator bookings).
  const [viewerTz] = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, user.id));
  const tz = viewerTz?.tz ?? undefined;

  if (!booking || (booking.fan_id !== user.id && booking.creator_user_id !== user.id)) notFound();

  const isFan = user.id === booking.fan_id;
  // The point of this card is "who am I about to spend this session with":
  // fans see the creator; creators see the fan.
  const otherName = isFan ? booking.creator_name : booking.fan_name;
  const otherAvatar = isFan ? booking.creator_avatar : booking.fan_avatar;
  const otherLabel = isFan ? "Creator" : "Guest";
  const otherUserId = isFan ? booking.creator_user_id : booking.fan_id;

  // Review state: only the guest reviews, only once, only after completion,
  // within the 7-day window.
  const [existingReview] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.booking_id, id), eq(reviews.reviewer_role, "guest")));
  const withinWindow =
    booking.end_at != null &&
    Date.now() <= new Date(booking.end_at).getTime() + REVIEW_WINDOW_MS;
  const showReview =
    isFan && booking.status === "completed" && !existingReview && withinWindow;
  const reviewExpired =
    isFan && booking.status === "completed" && !existingReview && !withinWindow;

  // Block state: has THIS user already blocked the other party?
  const [existingBlock] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        eq(blocks.blocker_id, user.id),
        eq(blocks.blocked_id, otherUserId),
      ),
    );

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(tz ? { timeZone: tz } : {}),
    });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(tz ? { timeZone: tz } : {}),
    });

  const startDate = booking.start_at ? new Date(booking.start_at) : null;
  const endDate = booking.end_at ? new Date(booking.end_at) : null;
  const isPastEnd = endDate ? endDate < new Date() : false;

  const detail = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm text-white">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-semibold text-white">
        {booking.status === "completed"
          ? "Completed session"
          : booking.status === "confirmed"
            ? booking.start_at! > new Date()
              ? "Upcoming session"
              : isPastEnd
                ? "Session ended"
                : "Session in progress"
            : "Your Session"}
      </h1>

      <Card className="mt-6 space-y-3 p-6">
        {/* Role-aware "who am I meeting" block: fans see the creator,
            creators see the fan — with name + photo. */}
        <div className="flex items-center gap-3 pb-2">
          <Avatar src={otherAvatar} name={otherName} size={44} />
          <div>
            <p className="text-xs text-text-secondary">{otherLabel}</p>
            <p className="text-base font-semibold text-white">{otherName}</p>
          </div>
        </div>
        <div className="border-t border-border-subtle pt-3 space-y-3">
          {detail("Session", booking.offering_title)}
          {detail("Duration", `${booking.offering_duration} minutes`)}
          {detail(
            "Time",
            startDate
              ? `${fmtDate(startDate)} · ${fmtTime(startDate)} – ${endDate ? fmtTime(endDate) : ""}`
              : "—",
          )}
          {detail("Price", `$${(booking.price_cents / 100).toFixed(2)}`)}
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-sm text-text-secondary">Status</span>
            <Badge
              variant={bookingBadgeVariant(booking.status)}
              label={bookingLabel(
                booking.status,
                {
                  cancelled_by: booking.cancelled_by,
                  needs_review: booking.needs_review,
                  effective_payout_cents: booking.effective_payout_cents,
                  isPastEnd,
                },
                isFan ? "guest" : "creator",
              )}
            />
          </div>
        </div>

        {booking.status === "confirmed" && !isPastEnd && (
          <>
            <JoinSection
              bookingId={booking.id}
              startAt={booking.start_at!.toISOString()}
              endAt={booking.end_at!.toISOString()}
            />
            <p className="pt-2 text-xs text-text-secondary">
              Your join link appears here 5 minutes before the session starts.
            </p>
            {booking.start_at! > new Date() && (
              <div className="pt-3">
                <AddToCalendarButton
                  title={`${booking.offering_title} with ${booking.creator_name}`}
                  startAt={booking.start_at!.toISOString()}
                  endAt={booking.end_at!.toISOString()}
                  description={`1:1 live video session with ${booking.creator_name} on Haibu.`}
                />
              </div>
            )}
          </>
        )}

        {booking.status === "confirmed" && isPastEnd && (
          <p className="pt-3 text-sm text-text-secondary">
            This session has ended and is being processed.
          </p>
        )}

        {booking.status === "confirmed" && booking.start_at! > new Date() && (
          <CancelSection
            bookingId={booking.id}
            startAt={booking.start_at!.toISOString()}
            createdAt={
              booking.created_at ? new Date(booking.created_at).toISOString() : null
            }
            priceCents={booking.price_cents}
            stripeFeeCents={booking.stripe_fee_cents ?? 0}
            role={isFan ? "fan" : "creator"}
          />
        )}
      </Card>

      {showReview && (
        <ReviewSection
          bookingId={booking.id}
          creatorName={booking.creator_name}
          category={booking.offering_category}
        />
      )}
      {existingReview && (
        <Card className="mt-6">
          <p className="text-sm font-medium text-live">Reviewed ✓</p>
        </Card>
      )}
      {reviewExpired && (
        <Card className="mt-6">
          <p className="text-sm text-text-tertiary">Review period expired</p>
        </Card>
      )}

      {/* Report/Block only AFTER the session — nothing to report before it. */}
      {booking.status === "completed" && (
        <Card className="mt-6 space-y-3">
          <p className="text-xs font-medium text-text-tertiary">Need help?</p>
          <div className="flex flex-wrap items-center gap-2">
            <ReportSection bookingId={booking.id} targetName={otherName} />
            <BlockSection
              bookingId={booking.id}
              targetName={otherName}
              alreadyBlocked={!!existingBlock}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
