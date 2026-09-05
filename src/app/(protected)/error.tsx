"use client";

import { useEffect } from "react";

export default function ProtectedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold text-text-primary">Something went wrong</h2>
      <p className="mt-2 text-sm text-text-secondary">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-text-tertiary">
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={() => retry()}
        className="mt-6 inline-flex h-10 items-center rounded-pill bg-primary px-6 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
