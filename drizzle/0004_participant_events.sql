-- Phase 4: participant presence tracking for the proportional session model.
-- Additive only — no drops, no destructive changes.

-- 1. Flag bookings whose creator partially delivered (needs admin review).
ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false NOT NULL;

-- 2. Log every Daily participant.joined / participant.left webhook.
CREATE TABLE IF NOT EXISTS "participant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_name" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"duration_seconds" double precision,
	"event_ts" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Idempotency: dedupe on (type, session_id) — Daily's recommended key.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_participant_events_session_type"
ON "participant_events" ("session_id", "event_type");

CREATE INDEX IF NOT EXISTS "idx_participant_events_room"
ON "participant_events" ("room_name");
