"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef } from "react";

export function TimezoneCapture() {
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;

    async function updateTimezone() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;

      await fetch("/api/user/timezone", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ timezone: tz }),
      });
    }

    updateTimezone();
  }, []);

  return null;
}
