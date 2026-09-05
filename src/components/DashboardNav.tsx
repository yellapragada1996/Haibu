"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const CREATOR_ITEMS: NavItem[] = [
  {
    href: "/creator",
    label: "Dashboard",
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </>
    ),
  },
  {
    href: "/creator/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
      </>
    ),
  },
  {
    href: "/creator/offerings",
    label: "Offerings",
    icon: (
      <>
        <path d="M3 3h8l10 10-8 8L3 11z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </>
    ),
  },
  {
    href: "/creator/availability",
    label: "Availability",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    href: "/creator/earnings",
    label: "Earnings",
    icon: (
      <>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
  },
  {
    href: "/creator/bookings",
    label: "Booked by guests",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
  },
  {
    href: "/dashboard",
    label: "Booked by me",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <circle cx="12" cy="15" r="2" />
        <path d="M9.5 21v-1a2.5 2.5 0 0 1 5 0v1" />
      </>
    ),
  },
];

const FAN_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "My sessions",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    href: "/dashboard/refunds",
    label: "Refunds",
    icon: (
      <>
        <path d="M3 10h18" />
        <path d="M6 14h2" />
        <path d="M11 14h2" />
        <rect x="2" y="5" width="20" height="14" rx="2" />
      </>
    ),
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
      </>
    ),
  },
];

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function DashboardNav({ isCreator }: { isCreator: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items = isCreator ? CREATOR_ITEMS : FAN_ITEMS;

  async function signOut() {
    setOpen(false);
    await supabase.auth.signOut();
    try {
      sessionStorage.removeItem("pendingBooking");
    } catch {
      /* ignore */
    }
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const list = (onNavigate?: () => void) => (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-input px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? "bg-primary text-on-primary"
                  : "text-text-primary/80 hover:bg-bg-card-hover hover:text-text-primary"
              }`}
            >
              <Icon>{item.icon}</Icon>
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop — permanent sidebar */}
      <aside className="hidden shrink-0 border-r border-border-subtle bg-bg-surface md:block md:w-60">
        <nav aria-label="Dashboard" className="sticky top-0 flex h-screen flex-col">
          <div className="px-5 pb-3 pt-6 text-base font-bold text-text-primary">
            {isCreator ? "Studio" : "My sessions"}
          </div>
          <div className="flex-1 overflow-y-auto px-3">{list()}</div>
        </nav>
      </aside>

      {/* Mobile — top bar with hamburger */}
      <header className="sticky top-14 z-20 flex h-14 items-center gap-3 border-b border-border-subtle bg-bg-surface px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="dashboard-nav-drawer"
          className="-ml-3 flex h-11 w-11 items-center justify-center rounded-input text-text-primary/80 transition-colors hover:bg-bg-card-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-base font-bold text-text-primary">{isCreator ? "Studio" : "My sessions"}</span>
      </header>

      {/* Mobile — drawer */}
      {open && (
        <div
          id="dashboard-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard navigation"
          className="fixed inset-0 z-50 md:hidden"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-bg-surface p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 pt-2">
              <span className="text-base font-bold text-text-primary">{isCreator ? "Studio" : "My sessions"}</span>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-input text-text-primary/80 transition-colors hover:bg-bg-card-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-1">
              {list(() => setOpen(false))}
            </nav>
            <div className="border-t border-border-subtle pt-2">
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-sm text-text-primary/80 transition-colors hover:bg-bg-card-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
