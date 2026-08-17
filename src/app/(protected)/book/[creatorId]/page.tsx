"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { reserveSlot } from "@/app/(protected)/actions/booking";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_APPEARANCE } from "@/lib/stripe-theme";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

interface TimeSlot {
  start_at: string;
  end_at: string;
}

interface Offering {
  id: string;
  title: string;
  duration_minutes: number;
  price_cents: number;
}

function CheckoutForm({
  clientSecret,
  bookingId,
  offeringTitle,
  priceCents,
  durationMinutes,
  slotTime,
  onBack,
}: {
  clientSecret: string;
  bookingId: string;
  offeringTitle: string;
  priceCents: number;
  durationMinutes: number;
  slotTime: string;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const router = useRouter();

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    // Must call elements.submit() before stripe.confirmPayment()
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your card details");
      setLoading(false);
      return;
    }

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: window.location.origin + "/bookings/" + bookingId,
      },
      redirect: "if_required",
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed");
      setLoading(false);
    } else if (bookingId) {
      router.push("/bookings/" + bookingId);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-live">
          Slot reserved — pay now
        </p>
        <button
          onClick={onBack}
          className="text-xs text-text-secondary hover:text-white"
        >
          Cancel
        </button>
      </div>

      {/* Payment summary */}
      <div className="rounded-xl bg-bg-card p-4 mb-4 space-y-1">
        <p className="text-sm font-medium text-white">{offeringTitle}</p>
        <p className="text-xs text-text-secondary">
          {new Date(slotTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
          {new Date(slotTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ·{" "}
          {durationMinutes} min · ${(priceCents / 100).toFixed(2)}
        </p>
      </div>

      <PaymentElement
        onChange={(e) => setCardComplete(e.complete)}
      />
      {error && (
        <p className="mt-3 rounded-xl bg-bg-card p-3 text-sm text-error">
          {error}
        </p>
      )}
      <button
        onClick={handlePay}
        disabled={!stripe || loading || !cardComplete}
        className="mt-4 w-full rounded-xl bg-primary px-6 py-3 font-medium text-on-primary transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Processing..." : `Pay $${(priceCents / 100).toFixed(2)}`}
      </button>
    </div>
  );
}

export default function BookPage() {
  const params = useParams();
  const creatorId = params.creatorId as string;
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<Offering | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [autoReserving, setAutoReserving] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [reservedSlot, setReservedSlot] = useState<TimeSlot | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pillCanLeft, setPillCanLeft] = useState(false);
  const [pillCanRight, setPillCanRight] = useState(false);
  const pillRowRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  console.log("[BookPage] selectedOffering:", selectedOffering?.title ?? "null", "| clientSecret:", !!clientSecret);

  useEffect(() => {
    fetch(`/api/creator/${creatorId}/offerings`)
      .then((r) => r.json())
      .then((data) => {
        setOfferings((data.offerings || []) as Offering[]);
      })
      .catch(() => setOfferings([]));
  }, [creatorId]);

  // Pre-select the offering if ?offering= param is present (from creator profile "Book" button)
  useEffect(() => {
    if (offerings.length === 0) return;
    const offeringParam = new URLSearchParams(window.location.search).get("offering");
    if (offeringParam) {
      const target = offerings.find((o) => o.id === offeringParam);
      if (target && !selectedOffering) {
        handleSelectOffering(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings]);

  const fetchSlots = useCallback(
    async (offering: Offering) => {
      const now = new Date();
      // Request the full window; the API clamps to the 30-day booking cap.
      const monthOut = new Date(now.getTime() + 30 * 86400000);
      const url = `/api/availability?creator_id=${creatorId}&offering_id=${offering.id}&from=${now.toISOString()}&to=${monthOut.toISOString()}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const list = (data.slots || []) as TimeSlot[];
        setSlots(list);
        if (list.length > 0) {
          setSelectedDate(list[0].start_at.slice(0, 10));
        }
      } catch {
        setSlots([]);
        setSelectedDate(null);
      }
    },
    [creatorId],
  );

  // Group slots by local date for the pill row
  const datePills: string[] = [];
  for (const s of slots) {
    const d = new Date(s.start_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!datePills.includes(key)) datePills.push(key);
  }

  // Pill-row scroll arrows: reveal on hover, per-direction visibility
  const PILL_SCROLL_STEP = 320;

  const updatePillScrollState = useCallback(() => {
    const el = pillRowRef.current;
    if (!el) return;
    setPillCanLeft(el.scrollLeft > 4);
    setPillCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updatePillScrollState();
  }, [slots, updatePillScrollState]);

  const scrollPillRow = (dir: 1 | -1) => {
    const el = pillRowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * PILL_SCROLL_STEP, behavior: "smooth" });
  };

  const slotsForSelectedDate = selectedDate
    ? slots.filter((s) => {
        const d = new Date(s.start_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return key === selectedDate;
      })
    : [];

  const handleSelectOffering = (offering: Offering) => {
    setSelectedOffering(offering);
    setClientSecret(null);
    setBookingId(null);
    setSelectedDate(null);
    fetchSlots(offering);
  };

  const handleReserveSlot = async (slot: TimeSlot) => {
    if (!selectedOffering) return;
    setLoading(true);
    setError(null);
    const result = await reserveSlot(selectedOffering.id, slot.start_at);
    if ("error" in result) {
      if (result.error === "slot_taken") {
        setError("Slot just taken. Try another.");
        fetchSlots(selectedOffering);
      } else if (result.error === "blocked") {
        setError("You can't book a session with this creator.");
      } else {
        setError("Something went wrong.");
      }
      setLoading(false);
    } else {
      setClientSecret(result.clientSecret);
      setBookingId(result.bookingId);
      setReservedSlot(slot);
      setLoading(false);
    }
    setAutoReserving(false);
  };

  const handleCancelPayment = () => {
    setClientSecret(null);
    setBookingId(null);
    setReservedSlot(null);
  };

  // Auto-reserve the slot if ?slot= is present (from the public slot picker),
  // so a guest lands directly on payment after authenticating — the selection
  // carries through without re-picking. Runs once.
  const autoReservedRef = useRef(false);
  useEffect(() => {
    if (slots.length === 0 || autoReservedRef.current || !selectedOffering) return;
    const slotParam = new URLSearchParams(window.location.search).get("slot");
    if (!slotParam) return;
    const target = slots.find((s) => s.start_at === slotParam);
    if (target) {
      const d = new Date(target.start_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      setSelectedDate(key);
      autoReservedRef.current = true;
      setAutoReserving(true);
      void handleReserveSlot(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, selectedOffering]);

  const fmtSlot = (s: TimeSlot) =>
    new Date(s.start_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="mx-auto max-w-lg px-6 py-8" key={creatorId}>
      <h1 className="text-xl font-semibold text-white">Book a Session</h1>

      {!selectedOffering && offerings.length > 0 && (
        <div className="mt-6 space-y-2">
          {offerings.map((o) => (
            <button
              key={o.id}
              onClick={() => handleSelectOffering(o)}
              className={`w-full rounded-xl p-4 text-left transition ${
                "bg-bg-card hover:bg-bg-card-hover"
              }`}
            >
              <p className="font-medium text-white">{o.title}</p>
              <p className="text-sm text-text-secondary">
                {o.duration_minutes} min · ${(o.price_cents / 100).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedOffering && !clientSecret && autoReserving && (
        <div className="mt-6 py-16 text-center">
          <p className="text-sm text-text-secondary">Reserving your slot…</p>
        </div>
      )}

      {selectedOffering && !clientSecret && !autoReserving && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-white">{selectedOffering.title}</p>
              <p className="text-xs text-text-secondary">
                {selectedOffering.duration_minutes} min · ${(selectedOffering.price_cents / 100).toFixed(2)}
              </p>
            </div>
            <button
              onClick={() => setSelectedOffering(null)}
              className="text-xs text-text-secondary hover:text-white"
            >
              Change
            </button>
          </div>
          <h2 className="mb-3 text-sm font-medium text-text-secondary">
            Available times
          </h2>
          {slots.length === 0 && (
            <p className="text-sm text-text-secondary">No available slots in the next 30 days.</p>
          )}
          {datePills.length > 0 && (
            <div className="relative group">
              <div
                ref={pillRowRef}
                onScroll={updatePillScrollState}
                className="flex gap-2 overflow-x-auto pb-3 horizontal-scroll scroll-smooth"
              >
                {datePills.map((dateKey) => {
                  const d = new Date(dateKey + "T00:00:00");
                  const label = d.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });
                  const active = dateKey === selectedDate;
                  return (
                    <button
                      key={dateKey}
                      onClick={() => setSelectedDate(dateKey)}
                      className={`inline-flex items-center h-9 px-4 rounded-pill text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? "bg-primary text-on-primary"
                          : "bg-bg-card-hover text-text-secondary hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {pillCanLeft && (
                <>
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 bg-linear-to-r from-bg-base from-30% to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    onClick={() => scrollPillRow(-1)}
                    aria-label="Scroll dates left"
                    className="absolute left-0 top-[18px] -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-pill bg-bg-card border border-border-subtle text-text-secondary hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg z-10"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M6.5 1L2.5 5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              )}
              {pillCanRight && (
                <>
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-bg-base from-30% to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    onClick={() => scrollPillRow(1)}
                    aria-label="Scroll dates right"
                    className="absolute right-0 top-[18px] -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-pill bg-bg-card border border-border-subtle text-text-secondary hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-lg z-10"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3.5 1L7.5 5l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {slotsForSelectedDate.map((s) => (
              <button
                key={s.start_at}
                onClick={() => handleReserveSlot(s)}
                disabled={loading}
                className="rounded-xl bg-bg-card px-3 py-2 text-sm text-white transition hover:bg-bg-card-hover disabled:opacity-50"
              >
                {fmtSlot(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && !clientSecret && (
        <p className="mt-4 rounded-xl bg-bg-card p-3 text-sm text-error">{error}</p>
      )}

      {clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: STRIPE_APPEARANCE,
          }}
        >
          <CheckoutForm
            clientSecret={clientSecret}
            bookingId={bookingId!}
            offeringTitle={selectedOffering?.title ?? ""}
            priceCents={selectedOffering?.price_cents ?? 0}
            durationMinutes={selectedOffering?.duration_minutes ?? 0}
            slotTime={reservedSlot?.start_at ?? ""}
            onBack={handleCancelPayment}
          />
        </Elements>
      )}
    </div>
  );
}
