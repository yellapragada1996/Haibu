import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { handleBookingConfirmed, sweepExpiredReservations, evaluateSession, sweepPendingEvaluations, sweepEligiblePayouts, publishGuestReview } from "@/lib/inngest-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [handleBookingConfirmed, sweepExpiredReservations, evaluateSession, sweepPendingEvaluations, sweepEligiblePayouts, publishGuestReview],
});
