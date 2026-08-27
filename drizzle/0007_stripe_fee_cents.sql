-- Add stripe_fee_cents column to bookings (nullable for backward compat)
ALTER TABLE bookings ADD COLUMN stripe_fee_cents integer;

-- Update check constraint to include stripe fee
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_money_split;
ALTER TABLE bookings ADD CONSTRAINT chk_money_split
  CHECK (creator_payout_cents + platform_fee_cents + COALESCE(stripe_fee_cents, 0) = price_cents);
