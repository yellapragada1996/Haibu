"use client";

import { useState } from "react";

export function ShareButton({ path, name }: { path: string; name: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const base = window.location.origin + path;
    const shareUrl = base;
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
    <div className="relative">
      <button
        type="button"
        onClick={share}
        aria-label="Share profile"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-dim px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
        Share
      </button>
      {copied && (
        <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-1 text-xs font-medium text-black shadow-lg animate-fade-in-out">
          Link copied!
        </span>
      )}
    </div>
  );
}
