"use client";

import { useParams } from "next/navigation";
import { CustomCall } from "./CustomCall";

// The call screen is a single responsive custom UI (call-object mode) for both
// desktop and mobile. No Daily Prebuilt iframe — see CustomCall.tsx.
export default function CallPage() {
  const params = useParams();
  const bookingId = params.id as string;
  return <CustomCall bookingId={bookingId} />;
}
