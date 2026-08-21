"use client";

import { useEffect, useState } from "react";

// Reactive CSS media-query match. SSR-safe: returns null until the media
// query is evaluated on the client (after mount), so callers can distinguish
// "unknown" from a definite true/false and avoid rendering the wrong layout.
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
