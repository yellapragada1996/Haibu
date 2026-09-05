import Link from "next/link";
import { PublicLayout } from "@/components/layout/PublicLayout";

export default function SupportPage() {
  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[640px] px-4 py-10">
        <h1 className="text-2xl font-bold text-text-primary">Need help?</h1>

        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          We&apos;re here for you. Whether you have a question about a booking,
          ran into an issue during a session, or just aren&apos;t sure how
          something works, reach out and we&apos;ll help sort it out.
        </p>

        <p className="mt-6 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Email us:</span>{" "}
          <a
            href="mailto:support@haibu.live"
            className="text-text-primary underline underline-offset-2"
          >
            support@haibu.live
          </a>
        </p>
        <p className="mt-2 text-xs text-text-tertiary">
          We aim to respond within 24 hours.
        </p>

        <h2 className="mt-10 text-lg font-semibold text-text-primary">
          Common questions
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Looking for something specific? A lot of common questions, like our
          cancellation policy, refunds, and how sessions work, are answered on
          our{" "}
          <Link href="/terms" className="text-text-primary underline underline-offset-2">
            Terms of Service
          </Link>{" "}
          page.
        </p>
      </main>
    </PublicLayout>
  );
}
