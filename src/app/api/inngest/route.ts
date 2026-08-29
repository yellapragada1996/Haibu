import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { handleBookingConfirmed, handleBookingReminder, sweepExpiredReservations, evaluateSession, sweepPendingEvaluations, sweepEligiblePayouts } from "@/lib/inngest-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [handleBookingConfirmed, handleBookingReminder, sweepExpiredReservations, evaluateSession, sweepPendingEvaluations, sweepEligiblePayouts],
});
