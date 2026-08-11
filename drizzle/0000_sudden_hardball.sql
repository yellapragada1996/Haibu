CREATE TYPE "public"."booking_status" AS ENUM('reserved', 'confirmed', 'completed', 'expired', 'cancelled_fan', 'cancelled_creator', 'cancelled_admin', 'no_show_fan', 'no_show_creator');--> statement-breakpoint
CREATE TYPE "public"."cancel_actor" AS ENUM('fan', 'creator', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('casual_talk', 'asmr', 'music');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('charge', 'platform_fee', 'creator_payout', 'refund', 'chargeback', 'reserve_hold', 'reserve_release');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_avail_block_times" CHECK ("availability_blocks"."start_at" < "availability_blocks"."end_at")
);
--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_avail_day_of_week" CHECK ("availability_windows"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "chk_avail_window" CHECK ("availability_windows"."start_minute" < "availability_windows"."end_minute" AND "availability_windows"."start_minute" >= 0 AND "availability_windows"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_blocks_no_self" CHECK ("blocks"."blocker_id" != "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fan_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "booking_status" NOT NULL,
	"price_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"creator_payout_cents" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"daily_room_name" text,
	"daily_room_url" text,
	"fan_joined_at" timestamp with time zone,
	"creator_joined_at" timestamp with time zone,
	"reservation_expires_at" timestamp with time zone,
	"cancelled_by" "cancel_actor",
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_booking_times" CHECK ("bookings"."start_at" < "bookings"."end_at"),
	CONSTRAINT "chk_money_split" CHECK ("bookings"."creator_payout_cents" + "bookings"."platform_fee_cents" = "bookings"."price_cents")
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text,
	"category" "category" NOT NULL,
	"intro_video_url" text,
	"banner_url" text,
	"stripe_account_id" text,
	"stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
	"identity_verified" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"type" "ledger_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" "category" NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_offering_duration" CHECK ("offerings"."duration_minutes" IN (15, 30, 45, 60)),
	CONSTRAINT "chk_offering_price" CHECK ("offerings"."price_cents" BETWEEN 500 AND 50000)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"booking_id" uuid,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "chk_review_rating" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"timezone" text NOT NULL,
	"is_creator" boolean DEFAULT false NOT NULL,
	"role_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fan_id_users_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_availability_blocks_creator_range" ON "availability_blocks" USING btree ("creator_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "idx_availability_windows_creator_day" ON "availability_windows" USING btree ("creator_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_blocks_pair" ON "blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bookings_creator_start_active" ON "bookings" USING btree ("creator_id","start_at") WHERE "bookings"."status" IN ('reserved', 'confirmed', 'completed');--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bookings_stripe_pi" ON "bookings" USING btree ("stripe_payment_intent_id") WHERE "bookings"."stripe_payment_intent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_bookings_fan_status" ON "bookings" USING btree ("fan_id","status");--> statement-breakpoint
CREATE INDEX "idx_bookings_creator_schedule" ON "bookings" USING btree ("creator_id","start_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_daily_room" ON "bookings" USING btree ("daily_room_name");--> statement-breakpoint
CREATE INDEX "idx_bookings_reservation_expires" ON "bookings" USING btree ("reservation_expires_at") WHERE "bookings"."status" = 'reserved';--> statement-breakpoint
CREATE INDEX "idx_creator_profiles_published" ON "creator_profiles" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "idx_creator_profiles_category" ON "creator_profiles" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ledger_stripe_ref_type" ON "ledger_entries" USING btree ("stripe_reference","type") WHERE "ledger_entries"."stripe_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_ledger_booking_id" ON "ledger_entries" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_created_at" ON "ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_offerings_creator_active" ON "offerings" USING btree ("creator_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_offerings_category" ON "offerings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_reports_admin_queue" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_reports_reported_user" ON "reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_creator" ON "reviews" USING btree ("creator_id","created_at");