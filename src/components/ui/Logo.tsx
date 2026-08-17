// Shared brand wordmark — the "haibu" logotype with the accent dot
// (matching the icon mark in src/app/icon.svg and the NavBar on the homepage).
export function Logo({
  height = 44,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <svg
      height={height}
      viewBox="0 0 220 60"
      className={`w-auto ${className}`}
      role="img"
      aria-label="haibu"
    >
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
  );
}
