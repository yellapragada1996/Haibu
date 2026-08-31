"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          backgroundColor: "#121212",
          color: "#FFFFFF",
          fontFamily: '"Inter", system-ui, sans-serif',
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "16px",
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: "14px", color: "#8A8A8A", marginTop: "8px" }}>
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p style={{ fontSize: "12px", color: "#5A5A5A", marginTop: "4px" }}>
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={() => retry()}
          style={{
            marginTop: "24px",
            height: "40px",
            padding: "0 24px",
            borderRadius: "999px",
            backgroundColor: "#FFFFFF",
            color: "#121212",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
