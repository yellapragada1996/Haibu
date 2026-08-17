"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/ui/OtpInput";

export default function VerifyEmailPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [redirectTarget] = useState(() => {
    if (typeof window === "undefined") return "/dashboard";
    const r = new URLSearchParams(window.location.search).get("redirect");
    return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
  });

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (user.email_confirmed_at) {
        router.replace(redirectTarget);
        return;
      }
      setEmail(user.email ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendSeconds]);

  const verify = async () => {
    if (otp.length !== 6) {
      setMessage("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    router.replace(redirectTarget);
    router.refresh();
  };

  const resend = async () => {
    if (resendSeconds > 0) return;
    const { error } = await supabase.auth.resend({ email, type: "signup" });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("A new code was sent.");
      setResendSeconds(60);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-[400px] !p-8">
        <div className="flex justify-center mb-6">
          <svg height="60" viewBox="0 0 105 60" className="w-auto">
            <text x="0" y="41" fontFamily="Arial,Helvetica,sans-serif" fontSize="34" fontWeight="600" letterSpacing="-0.5" fill="white">haibu</text>
            <circle cx="97" cy="35" r="5" style={{ fill: "var(--color-brand)" }} />
          </svg>
        </div>

        <h1 className="text-center text-lg font-semibold text-white mb-2">
          Verify your email
        </h1>
        <p className="text-center text-sm text-text-secondary mb-6">
          We sent a 6-digit code to <span className="text-white">{email || "your email"}</span>.
        </p>

        <OtpInput value={otp} onChange={setOtp} />

        {message && <p className="mt-4 text-center text-sm text-text-secondary">{message}</p>}

        <Button className="mt-6 w-full" onClick={verify} disabled={loading}>
          {loading ? "Verifying…" : "Verify"}
        </Button>

        <button
          onClick={resend}
          disabled={resendSeconds > 0}
          className="mt-4 w-full text-center text-sm text-text-secondary hover:text-white disabled:opacity-50"
        >
          {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
        </button>
      </Card>
    </div>
  );
}
