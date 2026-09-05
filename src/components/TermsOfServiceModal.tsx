"use client";

import { useEffect, useRef, useState } from "react";

// Scrollable Terms of Service dialog. Fetches the rendered document from
// /api/terms. Bottom-sheet on mobile, centered dialog on larger screens.
export function TermsOfServiceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Load the document once when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHtml(null);
    setError(false);
    fetch("/api/terms")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data: { html: string }) => {
        if (!cancelled) setHtml(data.html);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Esc to close, body scroll lock, focus in / out.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tos-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-modal bg-bg-surface sm:rounded-modal"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 id="tos-title" className="text-lg font-semibold text-text-primary">
            Terms of Service
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-pill text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-text-secondary">
              Couldn&apos;t load the Terms of Service. Please try again.
            </p>
          ) : !html ? (
            <p className="text-sm text-text-secondary">Loading…</p>
          ) : (
            <div
              className="tos-doc text-sm text-text-secondary [&_a]:text-text-primary [&_a]:underline [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-text-primary [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text-primary [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text-primary [&_li]:leading-relaxed [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:text-text-primary [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>

        <div className="flex justify-end border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-pill bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
