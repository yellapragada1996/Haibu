"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";

type Mode =
  | "login"
  | "signup"
  | "verify"
  | "forgot"
  | "reset-verify"
  | "reset-password";

function captureTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function Logo() {
  return (
    <div className="flex justify-center mb-6">
      <svg height="60" viewBox="0 0 105 60" className="w-auto">
        <text x="0" y="41" fontFamily="Arial,Helvetica,sans-serif" fontSize="34" fontWeight="600" letterSpacing="-0.5" fill="white">haibu</text>
        <circle cx="97" cy="35" r="5" style={{ fill: "var(--color-brand)" }} />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [booking, setBooking] = useState<{
    creatorName: string;
    avatarUrl: string | null;
    offeringTitle: string;
    durationMinutes: number;
    displayDate: string;
    displayTime: string;
    priceCents: number;
    slotStart: string;
    creatorId: string;
    offeringId: string;
  } | null>(null);
  const router = useRouter();
  // useSearchParams is hydration-safe — reading window.location.search in a
  // useState initializer silently keeps the SSR default (e.g. "/dashboard")
  // because hydration adopts the server's state.
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const supabase = createClient();

  // Already logged in? Redirect immediately instead of showing the form.
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) router.replace(redirectTo);
      try {
        const raw = sessionStorage.getItem("pendingBooking");
        if (raw) setBooking(JSON.parse(raw));
      } catch {
        /* ignore malformed storage */
      }
      // "Sign up" in the nav links to ?tab=signup — land on the signup tab.
      if (new URLSearchParams(window.location.search).get("tab") === "signup") {
        setMode("signup");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend-cooldown countdown.
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendSeconds]);

  const startResend = () => setResendSeconds(60);

  const resend = async () => {
    if (resendSeconds > 0) return;
    if (mode === "verify") {
      const { error } = await supabase.auth.resend({ email, type: "signup" });
      if (error) {
        setMessage(error.message);
        return;
      }
    } else if (mode === "reset-verify") {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        setMessage(error.message);
        return;
      }
    }
    setMessage("A new code was sent.");
    startResend();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "email_not_confirmed") {
          setMessage("Please verify your email first.");
          setMode("verify");
          startResend();
        } else {
          setMessage(error.message);
        }
        setLoading(false);
        return;
      }
      const tz = captureTimezone();
      if (tz) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await fetch("/api/user/timezone", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.session.access_token}`,
            },
            body: JSON.stringify({ timezone: tz }),
          });
        }
      }
      // Full navigation after auth — client-side router.push + refresh lets
      // the middleware's auth-page redirect (session now exists) bounce to
      // /dashboard instead of the intended page.
      window.location.assign(redirectTo);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }
      setMessage("We sent a 6-digit code to your email.");
      setMode("verify");
      startResend();
      setLoading(false);
    } else if (mode === "forgot") {
      // Anti-enumeration: don't reveal whether the email exists.
      await supabase.auth.resetPasswordForEmail(email);
      setMessage("If that email exists, we sent a reset code.");
      setMode("reset-verify");
      startResend();
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setMessage("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setMessage("");

    if (mode === "verify") {
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }
      window.location.assign(redirectTo);
    } else if (mode === "reset-verify") {
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "recovery" });
      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }
      setOtp("");
      setMode("reset-password");
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    window.location.assign("/dashboard");
  };

  const showTabs = mode === "login" || mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-[400px] !p-8">
        <Logo />

        {/* Booking context (deferred auth): a guest arriving mid-booking sees
            what they're completing before the auth options. */}
        {booking && (mode === "login" || mode === "signup") && (
          <>
            <h1 className="mb-1 text-center text-lg font-semibold text-white">
              Almost there — confirm your booking
            </h1>
            <p className="mb-4 mt-1 text-center text-sm text-text-secondary">
              Complete your {booking.offeringTitle} session with{" "}
              {booking.creatorName} to receive your join link.
            </p>

            {/* Prominent booking-context card — anchors the screen, above auth options */}
            <div className="mb-5 rounded-card border border-border-subtle bg-bg-card p-4">
              <div className="flex items-center gap-3">
                {booking.avatarUrl ? (
                  <img
                    src={booking.avatarUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-bg-card-hover" />
                )}
                <div>
                  <div className="text-[15px] font-bold text-white">
                    {booking.creatorName}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {booking.offeringTitle} · {booking.durationMinutes} min
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border-subtle pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">When</span>
                  <span className="font-semibold text-white">
                    {booking.displayDate} · {booking.displayTime}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-bold text-white">
                    ${(booking.priceCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <GoogleButton loading={loading} onClick={handleGoogleLogin} />
              {!showEmailForm ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEmailForm(true)}
                  className="w-full"
                >
                  Continue with email
                </Button>
              ) : (
                <form onSubmit={handleBookingEmail} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    type="password"
                    placeholder="Choose a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {message && (
                    <p className="text-center text-sm text-text-secondary">
                      {message}
                    </p>
                  )}
                  <Button type="submit" disabled={loading} className="w-full">
                    Create account
                  </Button>
                </form>
              )}
              <button
                type="button"
                onClick={() => setBooking(null)}
                className="w-full text-center text-sm text-text-secondary hover:text-white"
              >
                Already have an account? Log in
              </button>
            </div>
          </>
        )}

        {!booking && showTabs && (
          <div className="flex rounded-pill bg-bg-base p-1 mb-6">
            <button
              onClick={() => { setMode("login"); setMessage(""); }}
              className={`flex-1 rounded-pill py-2 text-sm font-semibold transition-colors ${mode === "login" ? "bg-primary text-on-primary" : "text-text-secondary hover:text-white"}`}
            >
              Log in
            </button>
            <button
              onClick={() => { setMode("signup"); setMessage(""); }}
              className={`flex-1 rounded-pill py-2 text-sm font-semibold transition-colors ${mode === "signup" ? "bg-primary text-on-primary" : "text-text-secondary hover:text-white"}`}
            >
              Sign up
            </button>
          </div>
        )}

        {mode === "login" && !booking && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {message && <p className="text-center text-sm text-text-secondary">{message}</p>}
              <Button type="submit" disabled={loading} className="w-full">Log in</Button>
            </form>

            <button
              onClick={() => { setMode("forgot"); setMessage(""); }}
              className="mt-3 w-full text-center text-sm text-text-secondary hover:text-white"
            >
              Forgot password?
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-bg-card px-2 text-text-secondary">or</span></div>
            </div>

            <GoogleButton loading={loading} onClick={handleGoogleLogin} />
          </>
        )}

        {mode === "signup" && !booking && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {message && <p className="text-center text-sm text-text-secondary">{message}</p>}
              <Button type="submit" disabled={loading} className="w-full">Create account</Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-bg-card px-2 text-text-secondary">or</span></div>
            </div>

            <GoogleButton loading={loading} onClick={handleGoogleLogin} />
          </>
        )}

        {mode === "verify" && (
          <>
            <h1 className="text-center text-lg font-semibold text-white mb-2">Check your email</h1>
            <p className="text-center text-sm text-text-secondary mb-6">
              We sent a 6-digit code to <span className="text-white">{email}</span>.
            </p>

            <OtpInput value={otp} onChange={setOtp} />

            {message && <p className="mt-4 text-center text-sm text-text-secondary">{message}</p>}

            <Button className="mt-6 w-full" onClick={handleVerify} disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>

            <button onClick={resend} disabled={resendSeconds > 0} className="mt-4 w-full text-center text-sm text-text-secondary hover:text-white disabled:opacity-50">
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
            </button>

            <button onClick={() => { setMode("signup"); setEmail(""); setOtp(""); setMessage(""); }} className="mt-3 w-full text-center text-sm text-text-secondary hover:text-white">
              Use a different email
            </button>
          </>
        )}

        {mode === "forgot" && (
          <>
            <h1 className="text-center text-lg font-semibold text-white mb-2">Reset your password</h1>
            <p className="text-center text-sm text-text-secondary mb-6">Enter your email and we&apos;ll send a code.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {message && <p className="text-center text-sm text-text-secondary">{message}</p>}
              <Button type="submit" disabled={loading} className="w-full">Send code</Button>
            </form>

            <button onClick={() => { setMode("login"); setMessage(""); }} className="mt-3 w-full text-center text-sm text-text-secondary hover:text-white">
              Back to log in
            </button>
          </>
        )}

        {mode === "reset-verify" && (
          <>
            <h1 className="text-center text-lg font-semibold text-white mb-2">Enter reset code</h1>
            <p className="text-center text-sm text-text-secondary mb-6">
              We sent a 6-digit code to <span className="text-white">{email}</span>.
            </p>

            <OtpInput value={otp} onChange={setOtp} />

            {message && <p className="mt-4 text-center text-sm text-text-secondary">{message}</p>}

            <Button className="mt-6 w-full" onClick={handleVerify} disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>

            <button onClick={resend} disabled={resendSeconds > 0} className="mt-4 w-full text-center text-sm text-text-secondary hover:text-white disabled:opacity-50">
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
            </button>
          </>
        )}

        {mode === "reset-password" && (
          <>
            <h1 className="text-center text-lg font-semibold text-white mb-2">Set a new password</h1>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <Input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {message && <p className="text-center text-sm text-text-secondary">{message}</p>}
              <Button type="submit" disabled={loading} className="w-full">Set password</Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );

  // Email path in booking context: create the account (password is required by
  // Supabase), then verify via the existing OTP flow. A true passwordless magic
  // link needs the Supabase confirm template to render {{ .ConfirmationURL }}
  // (dashboard config) — flagged separately.
  async function handleBookingEmail(e: FormEvent) {
    e.preventDefault();
    if (!booking) return;
    setLoading(true);
    setMessage("");
    const origin = window.location.origin;
    const bookUrl = `/book/${booking.creatorId}?offering=${booking.offeringId}&slot=${encodeURIComponent(booking.slotStart)}`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(bookUrl)}`,
      },
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    setMode("verify");
    startResend();
    setLoading(false);
  }

  function handleGoogleLogin() {
    setLoading(true);
    (async () => {
      const target = booking
        ? `/book/${booking.creatorId}?offering=${booking.offeringId}&slot=${encodeURIComponent(booking.slotStart)}`
        : redirectTo;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          // Always show Google's account chooser — otherwise Google reuses the
          // cached account session and the guest can't pick a different one.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setMessage(error.message);
        setLoading(false);
      }
    })();
  }
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-pill bg-bg-card-hover px-4 py-3 text-sm font-semibold text-white transition hover:bg-border-subtle disabled:opacity-50"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      Continue with Google
    </button>
  );
}
