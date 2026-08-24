import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata = {
  title: "Account suspended — haibu",
};

export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-[400px] !p-8">
        <div className="flex justify-center">
          <svg height="60" viewBox="0 0 105 60" className="w-auto">
            <text
              x="0"
              y="41"
              fontFamily="Arial,Helvetica,sans-serif"
              fontSize="34"
              fontWeight="600"
              letterSpacing="-0.5"
              fill="white"
            >
              haibu
            </text>
            <circle cx="97" cy="35" r="5" style={{ fill: "var(--color-brand)" }} />
          </svg>
        </div>

        <h1 className="mt-6 text-center text-lg font-semibold text-white">
          Account suspended
        </h1>

        <p className="mt-3 text-center text-sm leading-relaxed text-text-secondary">
          Your account has been suspended, so you can&apos;t sign in right now.
          If you think this is a mistake, please reach out and we&apos;ll take a
          look.
        </p>

        <p className="mt-4 text-center text-sm text-text-secondary">
          <a
            href="mailto:support@haibu.live"
            className="font-semibold text-white underline underline-offset-2"
          >
            support@haibu.live
          </a>
        </p>

        <div className="mt-8 border-t border-border-subtle pt-6 text-center">
          <Link
            href="/"
            className="text-sm text-text-secondary hover:text-white"
          >
            Back to home
          </Link>
        </div>
      </Card>
    </div>
  );
}
