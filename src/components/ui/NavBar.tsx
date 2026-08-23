"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ButtonLink } from "./Button";
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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const avatarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  function goSearch(queryOverride?: string) {
    const raw = (queryOverride ?? searchQuery).trim();
    if (!raw) return;
    setSearchOpen(false);
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

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [searchOpen]);

  const loginHref = `/login?redirect=${encodeURIComponent(pathname)}`;
  const signupHref = `/login?tab=signup&redirect=${encodeURIComponent(pathname)}`;
  // The creator onboarding wizard lives under /creator — hide the
  // "Become a Creator" CTA while the user is already in that flow.
  const isOnCreatorPath =
    pathname === "/creator" || pathname.startsWith("/creator/");

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <Link href="/" className="flex-shrink-0">
            <Logo />
          </Link>

          {/* Desktop search */}
          <div className="hidden flex-1 justify-center max-w-[560px] mx-auto md:flex">
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
            {/* Desktop-only (md+) */}
            <div className="hidden items-center gap-2 md:flex">
              {isLoggedIn && (
                <Link
                  href={isCreator ? "/creator" : "/dashboard"}
                  className="inline-flex h-9 items-center rounded-pill bg-bg-card-hover px-4 text-sm font-semibold text-white hover:bg-border-subtle transition-colors"
                >
                  {isCreator ? "Studio" : "My sessions"}
                </Link>
              )}
              {isLoggedIn && !isCreator && !isOnCreatorPath && (
                <ButtonLink href="/creator" size="small">
                  Become a Creator
                </ButtonLink>
              )}
              {!isLoggedIn && (
                <>
                  <ButtonLink href={loginHref} size="small" variant="ghost">
                    Log in
                  </ButtonLink>
                  <ButtonLink href={signupHref} size="small">
                    Sign up
                  </ButtonLink>
                </>
              )}
            </div>

            {/* Mobile search trigger */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-white md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>

            {isLoggedIn ? (
              <div className="relative" ref={avatarRef}>
                <button onClick={() => setAvatarOpen(!avatarOpen)} className="flex items-center">
                  <Avatar src={avatarUrl} name={userName} size={32} />
                </button>
                {avatarOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-card bg-bg-card border border-border-subtle py-1 shadow-lg z-50">
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setAvatarOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5Z"/></svg>
                        Admin
                      </Link>
                    )}
                    {isCreator ? (
                      <>
                        <Link href="/creator" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                          Studio
                        </Link>
                        <Link href="/creator/bookings" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>
                          Bookings
                        </Link>
                        <Link href="/creator/earnings" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          Earnings
                        </Link>
                        <Link href="/creator/profile" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                          Profile
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href="/dashboard" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                          My sessions
                        </Link>
                        <Link href="/dashboard/profile" onClick={() => setAvatarOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-white hover:bg-bg-card-hover">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                          Profile
                        </Link>
                      </>
                    )}
                    <div className="my-1 h-px bg-border-subtle" />
                    <button
                      onClick={async () => {
                        setAvatarOpen(false);
                        await supabase.auth.signOut();
                        try {
                          sessionStorage.removeItem("pendingBooking");
                        } catch {
                          /* ignore */
                        }
                        const currentPath =
                          typeof window !== "undefined"
                            ? window.location.pathname
                            : "/";
                        const publicPath =
                          currentPath === "/" ||
                          currentPath.startsWith("/@") ||
                          currentPath.startsWith("/creators") ||
                          currentPath.startsWith("/browse") ||
                          currentPath.startsWith("/search") ||
                          currentPath.startsWith("/slot") ||
                          currentPath.startsWith("/dev");
                        router.push(publicPath ? currentPath : "/");
                        router.refresh();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:text-white hover:bg-bg-card-hover"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href={loginHref}
                className="px-2 text-sm font-semibold text-white md:hidden"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Full-screen search (mobile) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-bg-base md:hidden" role="dialog" aria-label="Search">
          <div className="flex items-center gap-2 px-3 py-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => setSearchOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-bg-card-hover"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="flex flex-1 items-center gap-2 rounded-pill bg-bg-card border border-border-subtle px-4 h-10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search creators by name or category"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goSearch();
                }}
                className="w-full bg-transparent text-sm text-white placeholder-text-secondary outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
