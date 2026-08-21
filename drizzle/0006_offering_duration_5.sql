-- Lower the minimum offering duration from 15 to 5 minutes.
-- Existing rows are unaffected (they were already 15/30/45/60).
ALTER TABLE "offerings" DROP CONSTRAINT "chk_offering_duration";
ALTER TABLE "offerings" ADD CONSTRAINT "chk_offering_duration" CHECK ("duration_minutes" IN (5, 15, 30, 45, 60));
