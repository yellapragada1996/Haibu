"use client";

import { useState } from "react";

// Share button for the creator profile — navigator.share() on mobile (native
// sheet), copy-link fallback on desktop. Appends ?ref=<referrer-host> for
// funnel attribution. Icon-only, aria-labelled.
export function ShareButton({ path, name }: { path: string; name: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    // Build the link from the CURRENT origin so it works on localhost, staging,
    // and production alike (a hard-coded NEXT_PUBLIC_APP_URL pointed elsewhere).
    const base = window.location.origin + path;
    let shareUrl = base;
    try {
      const ref = document.referrer
        ? new URL(document.referrer).hostname.replace(/^www\./, "")
        : "direct";
      shareUrl = base + (base.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(ref);
    } catch {
      /* keep bare url */
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: name,
          text: `Book a live 1:1 with ${name} on Haibu`,
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share profile"
      title="Share profile"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-white"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
      )}
    </button>
  );
}
