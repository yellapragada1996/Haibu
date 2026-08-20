-- Phase 5: continuous/proportional money — the creator's effective payout after
-- a proportional refund. Additive only.
ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "effective_payout_cents" integer;
