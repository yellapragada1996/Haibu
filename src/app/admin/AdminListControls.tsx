"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminListControls({
  base,
  param,
  options,
  placeholder,
  q = "",
  filter = "",
}: {
  base: string;
  param: string;
  options: { label: string; value: string }[];
  placeholder: string;
  q?: string;
  filter?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The q value we've already pushed to the URL. Lets us tell "the user typed
  // this" (don't re-sync) apart from "the URL changed externally" (do sync).
  const appliedRef = useRef(q);

  useEffect(() => {
    if (q !== appliedRef.current) {
      setSearch(q);
      appliedRef.current = q;
    }
  }, [q]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function apply(newQ: string, newFilter: string) {
    appliedRef.current = newQ;
    const params = new URLSearchParams();
    if (newQ) params.set("q", newQ);
    if (newFilter) params.set(param, newFilter);
    const s = params.toString();
    // replace (not push) so typing doesn't fill the history stack.
    router.replace(s ? `${base}?${s}` : base);
  }

  function handleChange(value: string) {
    setSearch(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = value.trim();
    if (trimmed === "") {
      // Clearing resets immediately — no debounce, no stuck empty list.
      apply("", filter);
    } else {
      timerRef.current = setTimeout(() => apply(trimmed, filter), 300);
    }
  }

  function clearSearch() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearch("");
    apply("", filter);
  }

  function setFilter(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    apply(search.trim(), value);
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="relative max-w-md">
        <input
          value={search}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (timerRef.current) clearTimeout(timerRef.current);
              apply(search.trim(), filter);
            }
          }}
          placeholder={placeholder}
          className="h-9 w-full rounded-pill border border-border-subtle bg-bg-base px-4 pr-9 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-primary"
        />
        {search && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none text-text-tertiary hover:text-text-primary"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === "" ? !filter : o.value === filter;
          return (
            <button
              key={o.value}
              onClick={() => setFilter(o.value)}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-on-primary"
                  : "bg-bg-card-hover text-text-secondary hover:text-text-primary"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
