"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SignUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="4" />
      <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </svg>
  );
}

export function BottomNav({
  isLoggedIn,
  isCreator,
}: {
  isLoggedIn: boolean;
  isCreator: boolean;
}) {
  const pathname = usePathname();

  const isDashboardRoute =
    pathname === "/creator" ||
    pathname.startsWith("/creator/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/");

  const tab =
    "flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  const secondHref = !isLoggedIn
    ? `/login?tab=signup&redirect=${encodeURIComponent(pathname)}`
    : isCreator
      ? "/creator"
      : "/dashboard";

  const secondLabel = !isLoggedIn ? "Sign up" : "Dashboard";
  const secondIcon = !isLoggedIn ? <SignUpIcon /> : <DashboardIcon />;
  const secondActive = isLoggedIn && isDashboardRoute;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={`${tab} ${pathname === "/" ? "text-white" : "text-text-secondary"}`}
        >
          <HomeIcon />
          Home
        </Link>
        <Link
          href={secondHref}
          aria-current={secondActive ? "page" : undefined}
          className={`${tab} ${secondActive ? "text-white" : "text-text-secondary"}`}
        >
          {secondIcon}
          {secondLabel}
        </Link>
      </div>
    </nav>
  );
}
