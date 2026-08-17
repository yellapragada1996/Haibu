"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "./Button";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";

type NavBarProps = {
  isLoggedIn?: boolean;
  isCreator?: boolean;
  isAdmin?: boolean;
  userName?: string;
  avatarUrl?: string | null;
};

export function NavBar({
  isLoggedIn = false,
  isCreator = false,
  isAdmin = false,
  userName = "",
  avatarUrl = null,
}: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState("");

  function goSearch(queryOverride?: string) {
    const raw = (queryOverride ?? searchQuery).trim();
    if (!raw) return;
    router.push(`/search?q=${encodeURIComponent(raw)}`);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-40 border-b border-border-subtle bg-bg-surface">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="hidden items-center justify-center w-9 h-9 rounded-input hover:bg-bg-card-hover text-white"
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <Link href="/" className="flex-shrink-0">
          <Logo />
        </Link>

        <div className="flex flex-1 justify-center max-w-[560px] mx-auto">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search creators"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goSearch();
              }}
              className="w-full h-9 rounded-pill bg-bg-base border border-border-subtle px-4 pr-10 text-sm text-white placeholder-text-secondary outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-label="Search"
              onClick={() => goSearch()}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-bg-card-hover flex items-center justify-center text-text-secondary"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="2" />
                <path d="M13 13l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isLoggedIn ? (
            <>
              {isCreator ? (
                <>
                  <Link
                    href="/creator/profile"
                    className="hidden sm:inline-flex h-9 items-center rounded-pill bg-bg-card-hover px-4 text-sm font-semibold text-white hover:bg-border-subtle transition-colors"
                  >
                    Creator Studio
                  </Link>
                  <Link
                    href="/creator/bookings"
                    className="hidden sm:inline-flex h-9 items-center rounded-pill bg-bg-card-hover px-4 text-sm font-semibold text-white hover:bg-border-subtle transition-colors"
                  >
                    Bookings
                  </Link>
                </>
              ) : (
                <ButtonLink href="/creator/profile" size="small" className="inline-flex">
                  Become a Creator
                </ButtonLink>
              )}
              {/* Notification bell removed — it was a dead placeholder (no
                  handler). Email reminders (Step 14) cover this need. */}
              <div className="relative" ref={avatarRef}>
                <button
                  onClick={() => setAvatarOpen(!avatarOpen)}
                  className="flex items-center"
                >
                  <Avatar src={avatarUrl} name={userName} size={32} />
                </button>
                {avatarOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-card bg-bg-card border border-border-subtle py-1 shadow-lg z-50">
                    <Link
                      href="/dashboard"
                      onClick={() => setAvatarOpen(false)}
                      className="block px-4 py-2 text-sm text-white hover:bg-bg-card-hover"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setAvatarOpen(false)}
                      className="block px-4 py-2 text-sm text-white hover:bg-bg-card-hover"
                    >
                      Settings
                    </Link>
                    {isCreator && (
                      <Link
                        href="/creator/profile"
                        onClick={() => setAvatarOpen(false)}
                        className="block px-4 py-2 text-sm text-white hover:bg-bg-card-hover"
                      >
                        Creator Studio
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setAvatarOpen(false)}
                        className="block px-4 py-2 text-sm text-white hover:bg-bg-card-hover"
                      >
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={async () => {
                        setAvatarOpen(false);
                        await supabase.auth.signOut();
                        // Clear any booking intent so /login doesn't show a
                        // stale "Almost there" context after logout.
                        try {
                          sessionStorage.removeItem("pendingBooking");
                        } catch {
                          /* ignore */
                        }
                        // Stay on the current page when it's public (e.g. a
                        // creator profile), else land on the home page.
                        const pathname =
                          typeof window !== "undefined"
                            ? window.location.pathname
                            : "/";
                        const publicPath =
                          pathname === "/" ||
                          pathname.startsWith("/@") ||
                          pathname.startsWith("/creators") ||
                          pathname.startsWith("/browse") ||
                          pathname.startsWith("/search") ||
                          pathname.startsWith("/slot") ||
                          pathname.startsWith("/dev");
                        router.push(publicPath ? pathname : "/");
                        router.refresh();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:text-white hover:bg-bg-card-hover"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <ButtonLink href="/login" size="small" variant="ghost">
                Log in
              </ButtonLink>
              <ButtonLink href="/login?tab=signup" size="small">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="sm:hidden border-t border-border-subtle bg-bg-surface px-4 py-4 space-y-3">
          <input
            type="text"
            placeholder="Search creators"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                goSearch();
                setMenuOpen(false);
              }
            }}
            className="w-full h-9 rounded-pill bg-bg-base border border-border-subtle px-4 text-sm text-white placeholder-text-secondary outline-none"
          />
          {isCreator ? (
            <Link
              href="/creator/profile"
              className="block rounded-pill bg-bg-card-hover px-4 py-2 text-sm font-semibold text-white text-center"
              onClick={() => setMenuOpen(false)}
            >
              Creator Studio
            </Link>
          ) : (
            <Link
              href="/creator/profile"
              className="block rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary text-center"
              onClick={() => setMenuOpen(false)}
            >
              Become a Creator
            </Link>
          )}
          {isLoggedIn && (
            <Link
              href="/dashboard"
              className="block rounded-pill px-4 py-2 text-sm text-text-secondary text-center hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </Link>
          )}
          {isLoggedIn && isAdmin && (
            <Link
              href="/admin"
              className="block rounded-pill px-4 py-2 text-sm text-text-secondary text-center hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              Admin
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
