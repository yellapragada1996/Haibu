"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setSearch(q);
  }, [q]);

  function navigate(newQ: string, newFilter: string) {
    const params = new URLSearchParams();
    if (newQ) params.set("q", newQ);
    if (newFilter) params.set(param, newFilter);
    const s = params.toString();
    router.push(s ? `${base}?${s}` : base);
  }

  return (
    <div className="mb-4 space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate(search.trim(), filter);
        }}
        className="flex max-w-md gap-2"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-pill border border-border-subtle bg-bg-base px-4 text-sm text-white placeholder-text-secondary outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-pill border border-border-subtle bg-bg-card-hover px-4 text-sm font-semibold text-white hover:bg-border-subtle"
        >
          Search
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === "" ? !filter : o.value === filter;
          return (
            <button
              key={o.value}
              onClick={() => navigate(search, o.value)}
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "bg-bg-card-hover text-text-secondary hover:text-white"
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
