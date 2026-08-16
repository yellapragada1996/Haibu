"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Rendered by the protected layout when a user is authenticated but has not
// confirmed their email. Redirects to /verify-email carrying the original
// path so verification can send them back where they were headed.
export function EmailGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/verify-email?redirect=${encodeURIComponent(pathname)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
