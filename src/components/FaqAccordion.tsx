"use client";

import { useState } from "react";

// FAQ copy is fixed per spec — do not reword.
const FAQ_ITEMS = [
  {
    id: "what-is-haibu",
    question: "What is Haibu?",
    answer:
      "Haibu is a place to book a live, one-on-one video session with a creator you follow. Pick a time, pay securely, and join a real video call together.",
  },
  {
    id: "cancel",
    question: "Can I cancel if my plans change?",
    answer:
      "Yes. Cancel more than 24 hours before your session for a full refund. Cancel between 24 hours and 2 hours before, and you'll get half back. Within 2 hours, the booking is locked in, since the creator has already set aside that time for you.",
  },
  {
    id: "refund-guarantee",
    question: "How does the refund guarantee work?",
    answer:
      "Every session on Haibu is protected. If a creator can't make it or has to leave early, you're automatically refunded for the time you didn't get. No need to ask.",
  },
  {
    id: "payment-secure",
    question: "Is my payment secure?",
    answer:
      "Yes. Payments are handled through Stripe, the same payment processor used by major platforms worldwide. Haibu never sees or stores your card details.",
  },
  {
    id: "timing",
    question: "How does session timing work?",
    answer:
      "Your session runs for the exact length you booked, starting at the scheduled time. We recommend joining a couple of minutes early so you don't miss any of your time together.",
  },
  {
    id: "during-call",
    question: "What happens during the call?",
    answer:
      "You'll have a real one-on-one video call with the creator for the length of time you booked. Nothing is recorded, and what you do together depends on the session type you chose.",
  },
];

// Single-open accordion (WAI-ARIA accordion pattern). One question open at a
// time; all collapsed by default. Semantic <button> triggers, aria-expanded,
// aria-controls + aria-labelledby region panels, keyboard operable, 44px
// targets, visible focus ring, and a reduced-motion-safe expand animation.
export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="mb-4 mt-6" aria-label="Frequently asked questions">
      <h2 className="mb-2.5 text-lg font-semibold text-white">FAQ</h2>
      <div>
        {FAQ_ITEMS.map((item) => {
          const open = openId === item.id;
          const questionId = `faq-q-${item.id}`;
          const answerId = `faq-a-${item.id}`;
          return (
            <div
              key={item.id}
              className="border-t border-border-subtle first:border-t-0"
            >
              <h3>
                <button
                  type="button"
                  id={questionId}
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span>{item.question}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`shrink-0 text-text-tertiary transition-transform duration-200 motion-reduce:transition-none ${
                      open ? "rotate-180 text-white" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </h3>
              <div
                id={answerId}
                role="region"
                aria-labelledby={questionId}
                aria-hidden={!open}
                className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-3.5 pr-6 text-sm leading-relaxed text-text-secondary">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
