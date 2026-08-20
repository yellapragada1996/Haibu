import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  doublePrecision,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const bookingStatusEnum = pgEnum("booking_status", [
  "reserved",
  "confirmed",
  "completed",
  "expired",
  "cancelled_fan",
  "cancelled_creator",
  "cancelled_admin",
  "no_show_fan",
  "no_show_creator",
]);

export const ledgerTypeEnum = pgEnum("ledger_type", [
  "charge",
  "platform_fee",
  "creator_payout",
  "refund",
  "chargeback",
  "reserve_hold",
  "reserve_release",
]);

export const cancelActorEnum = pgEnum("cancel_actor", [
  "fan",
  "creator",
  "admin",
  "system",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "reviewed",
  "actioned",
  "dismissed",
]);

// ---------------------------------------------------------------------------
// 0b. categories  (reference table — a category is a data row, not an enum)
// ---------------------------------------------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  slug: text("slug").unique().notNull(),
  display_label: text("display_label").notNull(),
  sort_order: integer("sort_order").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const categoryTags = pgTable(
  "category_tags",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    category_slug: text("category_slug")
      .notNull()
      .references(() => categories.slug, { onDelete: "cascade" }),
    tag_label: text("tag_label").notNull(),
    sort_order: integer("sort_order").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_category_tags_slug").on(table.category_slug, table.sort_order),
  ],
);

// ---------------------------------------------------------------------------
// 1. users
// ---------------------------------------------------------------------------
// id is set by the Supabase auth.user hook — it references auth.users.id.
// No default; the value is supplied by the on_auth_user_created trigger.
//
// GDPR / account-deletion note (v1.1+):
// Once a user has bookings, they cannot be hard-deleted because bookings,
// ledger_entries, and reviews all RESTRICT cascading deletes. The correct
// solution is an anonymization flow (null PII, keep the row + financial trail).
// Do NOT build a DELETE path that cascades into money / moderation data.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(),
  email: text("email").unique().notNull(),
  display_name: text("display_name").notNull(),
  avatar_url: text("avatar_url"),
  timezone: text("timezone").notNull(),
  is_creator: boolean("is_creator").default(false).notNull(),
  timezone_confirmed: boolean("timezone_confirmed").default(false).notNull(),
  role_admin: boolean("role_admin").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// 2. creator_profiles
// ---------------------------------------------------------------------------

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    user_id: uuid("user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .unique()
      .notNull(),
    slug: text("slug").unique(),
    bio: text("bio"),
    category: text("category")
      .notNull()
      .references(() => categories.slug, { onDelete: "restrict" }),
    intro_video_url: text("intro_video_url"),
    banner_url: text("banner_url"),
    stripe_account_id: text("stripe_account_id"),
    stripe_onboarding_complete: boolean("stripe_onboarding_complete")
      .default(false)
      .notNull(),
    identity_verified: boolean("identity_verified")
      .default(false)
      .notNull(),
    is_published: boolean("is_published").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_creator_profiles_published").on(table.is_published),
    index("idx_creator_profiles_category").on(table.category),
  ],
);

// ---------------------------------------------------------------------------
// 3. offerings
// ---------------------------------------------------------------------------

export const offerings = pgTable(
  "offerings",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "restrict" })
      .notNull(),
    title: text("title").notNull(),
    category: text("category")
      .notNull()
      .references(() => categories.slug, { onDelete: "restrict" }),
    duration_minutes: integer("duration_minutes").notNull(),
    price_cents: integer("price_cents").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "chk_offering_duration",
      sql`${table.duration_minutes} IN (15, 30, 45, 60)`,
    ),
    check(
      "chk_offering_price",
      sql`${table.price_cents} BETWEEN 500 AND 50000`,
    ),
    index("idx_offerings_creator_active").on(
      table.creator_id,
      table.is_active,
    ),
    index("idx_offerings_category").on(table.category),
  ],
);

// ---------------------------------------------------------------------------
// 4. availability_windows
// ---------------------------------------------------------------------------

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "cascade" })
      .notNull(),
    day_of_week: integer("day_of_week").notNull(),
    start_minute: integer("start_minute").notNull(),
    end_minute: integer("end_minute").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "chk_avail_day_of_week",
      sql`${table.day_of_week} BETWEEN 0 AND 6`,
    ),
    check(
      "chk_avail_window",
      sql`${table.start_minute} < ${table.end_minute} AND ${table.start_minute} >= 0 AND ${table.end_minute} <= 1440`,
    ),
    index("idx_availability_windows_creator_day").on(
      table.creator_id,
      table.day_of_week,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5. availability_blocks
// ---------------------------------------------------------------------------

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "cascade" })
      .notNull(),
    start_at: timestamp("start_at", { withTimezone: true }).notNull(),
    end_at: timestamp("end_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "chk_avail_block_times",
      sql`${table.start_at} < ${table.end_at}`,
    ),
    index("idx_availability_blocks_creator_range").on(
      table.creator_id,
      table.start_at,
      table.end_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5b. availability_date_overrides
// ---------------------------------------------------------------------------

export const availabilityDateOverrides = pgTable(
  "availability_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    start_minute: integer("start_minute").notNull(),
    end_minute: integer("end_minute").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "chk_date_override_times",
      sql`${table.start_minute} < ${table.end_minute} AND ${table.start_minute} >= 0 AND ${table.end_minute} <= 1440`,
    ),
    index("idx_date_overrides_creator_date").on(
      table.creator_id,
      table.date,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 6. bookings
// ---------------------------------------------------------------------------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    fan_id: uuid("fan_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "restrict" })
      .notNull(),
    offering_id: uuid("offering_id")
      .references(() => offerings.id, { onDelete: "restrict" })
      .notNull(),
    start_at: timestamp("start_at", { withTimezone: true }).notNull(),
    end_at: timestamp("end_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull(),
    price_cents: integer("price_cents").notNull(),
    platform_fee_cents: integer("platform_fee_cents").notNull(),
    creator_payout_cents: integer("creator_payout_cents").notNull(),
    // Phase 5 — the creator's actual payout after a proportional refund. NULL
    // means "no adjustment" (sweep pays creator_payout_cents in full).
    effective_payout_cents: integer("effective_payout_cents"),
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    daily_room_name: text("daily_room_name"),
    daily_room_url: text("daily_room_url"),
    fan_joined_at: timestamp("fan_joined_at", { withTimezone: true }),
    creator_joined_at: timestamp("creator_joined_at", { withTimezone: true }),
    reservation_expires_at: timestamp("reservation_expires_at", {
      withTimezone: true,
    }),
    payout_eligible_at: timestamp("payout_eligible_at", {
      withTimezone: true,
    }),
    // Phase 4 — set true when the creator partially delivered (present, but
    // missed more than the grace window). The payout sweep skips these until an
    // admin resolves them.
    needs_review: boolean("needs_review").default(false).notNull(),
    cancelled_by: cancelActorEnum("cancelled_by"),
    cancel_reason: text("cancel_reason"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Double-booking defense: only one active booking per creator per start time.
    uniqueIndex("idx_bookings_creator_start_active")
      .on(table.creator_id, table.start_at)
      .where(
        sql`${table.status} IN ('reserved', 'confirmed', 'completed')`,
      ),
    // Webhook idempotency: one booking per Stripe PaymentIntent.
    uniqueIndex("idx_bookings_stripe_pi")
      .on(table.stripe_payment_intent_id)
      .where(sql`${table.stripe_payment_intent_id} IS NOT NULL`),
    // Data integrity.
    check(
      "chk_booking_times",
      sql`${table.start_at} < ${table.end_at}`,
    ),
    check(
      "chk_money_split",
      sql`${table.creator_payout_cents} + ${table.platform_fee_cents} = ${table.price_cents}`,
    ),
    // Query indexes.
    index("idx_bookings_fan_status").on(table.fan_id, table.status),
    index("idx_bookings_creator_schedule").on(
      table.creator_id,
      table.start_at,
    ),
    index("idx_bookings_daily_room").on(table.daily_room_name),
    index("idx_bookings_reservation_expires")
      .on(table.reservation_expires_at)
      .where(sql`${table.status} = 'reserved'`),
  ],
);

// ---------------------------------------------------------------------------
// 7. ledger_entries  (append-only — never mutate a row)
// ---------------------------------------------------------------------------

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    booking_id: uuid("booking_id").references(() => bookings.id, {
      onDelete: "restrict",
    }),
    type: ledgerTypeEnum("type").notNull(),
    amount_cents: integer("amount_cents").notNull(),
    currency: text("currency").default("usd").notNull(),
    stripe_reference: text("stripe_reference"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Webhook idempotency: one ledger row per Stripe reference + type.
    uniqueIndex("idx_ledger_stripe_ref_type")
      .on(table.stripe_reference, table.type)
      .where(sql`${table.stripe_reference} IS NOT NULL`),
    index("idx_ledger_booking_id").on(table.booking_id),
    index("idx_ledger_created_at").on(table.created_at),
  ],
);

// ---------------------------------------------------------------------------
// 8. reviews
// ---------------------------------------------------------------------------

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    booking_id: uuid("booking_id")
      .references(() => bookings.id, { onDelete: "restrict" })
      .notNull(),
    creator_id: uuid("creator_id")
      .references(() => creatorProfiles.id, { onDelete: "restrict" })
      .notNull(),
    // NULL for creator reviews (thumbs, not stars).
    rating: integer("rating"),
    text: text("text"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    is_public: boolean("is_public").default(false).notNull(),
    published_at: timestamp("published_at", { withTimezone: true }),
    reviewer_role: text("reviewer_role").default("guest").notNull(),
    creator_sentiment: text("creator_sentiment"),
    creator_private_note: text("creator_private_note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("chk_review_rating", sql`${table.rating} BETWEEN 1 AND 5`),
    uniqueIndex("reviews_booking_role_unique").on(
      table.booking_id,
      table.reviewer_role,
    ),
    index("idx_reviews_creator").on(table.creator_id, table.created_at),
  ],
);

// ---------------------------------------------------------------------------
// 9. reports
// ---------------------------------------------------------------------------

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    reporter_id: uuid("reporter_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    reported_user_id: uuid("reported_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    booking_id: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").default("open").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_reports_admin_queue").on(table.status, table.created_at),
    index("idx_reports_reported_user").on(table.reported_user_id),
  ],
);

// ---------------------------------------------------------------------------
// 10. blocks
// ---------------------------------------------------------------------------

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    blocker_id: uuid("blocker_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    blocked_id: uuid("blocked_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_blocks_pair").on(table.blocker_id, table.blocked_id),
    check(
      "chk_blocks_no_self",
      sql`${table.blocker_id} != ${table.blocked_id}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 11. admin_actions  (append-only audit log for admin writes)
// ---------------------------------------------------------------------------

export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    admin_id: uuid("admin_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    action: text("action").notNull(),
    booking_id: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    target_user_id: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    details: text("details"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_admin_actions_booking").on(table.booking_id),
    index("idx_admin_actions_created").on(table.created_at),
  ],
);

// ---------------------------------------------------------------------------
// 12. participant_events  (append-only presence log — Phase 4)
// ---------------------------------------------------------------------------
// One row per Daily webhook (participant.joined / participant.left). `session_id`
// is Daily's per-join id: a participant who leaves and rejoins gets a new one.
// The unique (session_id, event_type) index is the idempotency key — Daily may
// deliver duplicates (roughly, and with a different event `id`), so dedupe on
// type + session_id as Daily recommends.

export const participantEvents = pgTable(
  "participant_events",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    room_name: text("room_name").notNull(),
    // "fan:<uuid>" or "creator:<uuid>" (matches the meeting token's user_id).
    user_id: text("user_id").notNull(),
    session_id: text("session_id").notNull(),
    // "joined" | "left"
    event_type: text("event_type").notNull(),
    // Event time (payload.joined_at), NOT webhook send time.
    joined_at: timestamp("joined_at", { withTimezone: true }).notNull(),
    // payload.duration (seconds), present on left events only.
    duration_seconds: doublePrecision("duration_seconds"),
    event_ts: timestamp("event_ts", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_participant_events_session_type").on(
      table.session_id,
      table.event_type,
    ),
    index("idx_participant_events_room").on(table.room_name),
  ],
);
