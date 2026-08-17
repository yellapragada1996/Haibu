"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/creator/profile", label: "Profile" },
  { href: "/creator/offerings", label: "Offerings" },
  { href: "/creator/availability", label: "Availability" },
  { href: "/creator/bookings", label: "Bookings" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <div className="mb-8 flex gap-1 rounded-pill bg-bg-surface p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 rounded-pill px-3 py-2 text-center text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-on-primary"
                : "text-text-secondary hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
