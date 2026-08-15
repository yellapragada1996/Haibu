const { Pool } = require("pg");
const { toZonedTime, fromZonedTime } = require("date-fns-tz");
const { addMinutes } = require("date-fns");

const pool = new Pool({ connectionString: "postgresql://postgres.etikjlfhyywksokxbxor:NW5m5l8Vng6Yi6pH@aws-0-us-east-1.pooler.supabase.com:5432/postgres" });

function fmt(slot) {
  return `${slot.start_at.slice(11, 16)} – ${slot.end_at.slice(11, 16)} UTC (${slot.start_at.slice(0, 10)})`;
}

// Mirrors generateAvailableSlots logic to test precedence locally.
function generateSlots({ windows, blocks, overrides, timezone, duration, from, to, minLead = 60 }) {
  if (from >= to) return [];
  const cutoff = addMinutes(new Date(), minLead);
  const slots = [];

  const localFrom = toZonedTime(from, timezone);
  const localTo = toZonedTime(to, timezone);
  const startDate = new Date(localFrom.getFullYear(), localFrom.getMonth(), localFrom.getDate());
  const endDate = new Date(localTo.getFullYear(), localTo.getMonth(), localTo.getDate());

  const overrideByDate = new Map();
  for (const o of overrides) {
    const existing = overrideByDate.get(o.date) ?? [];
    existing.push(o);
    overrideByDate.set(o.date, existing);
  }

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const localMidnight = fromZonedTime(`${dateKey}T00:00:00`, timezone);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateKey = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
    const nextMidnight = fromZonedTime(`${nextDateKey}T00:00:00`, timezone);

    // 1. Full-day block (entire creator-local day) kills the day; partial blocks filter per-slot
    const fullyBlocked = blocks.some(
      (b) =>
        new Date(b.start_at).getTime() <= localMidnight.getTime() &&
        new Date(b.end_at).getTime() >= nextMidnight.getTime(),
    );
    if (fullyBlocked) continue;

    // 2. Override
    const dayOverrideRows = overrideByDate.get(dateKey);
    // 3. Recurring
    const localDow = d.getDay();
    const matchingWindows =
      dayOverrideRows && dayOverrideRows.length > 0
        ? dayOverrideRows.map((o) => ({ start_minute: o.start_minute, end_minute: o.end_minute }))
        : windows.filter((w) => w.day_of_week === localDow);

    for (const w of matchingWindows) {
      const wStart = addMinutes(localMidnight, w.start_minute);
      const wEnd = addMinutes(localMidnight, w.end_minute);
      for (let s = wStart; addMinutes(s, duration) <= wEnd; s = addMinutes(s, duration)) {
        const e = addMinutes(s, duration);
        if (e <= cutoff) continue;
        if (s < from) continue;
        if (e > to) continue;
        // Per-slot block filter (partial blocks)
        if (blocks.some((b) => s < b.end_at && e > b.start_at)) continue;
        slots.push({ start_at: s.toISOString(), end_at: e.toISOString() });
      }
    }
  }
  return slots;
}

async function main() {
  // ========== STEP 5 REGRESSION SUITE (original cases) ==========
  console.log("=== STEP 5 REGRESSION ===");
  const TZ = "America/Toronto";
  const mon = new Date("2026-08-17T00:00:00Z");
  const tue = new Date("2026-08-18T00:00:00Z");

  const s1 = generateSlots({
    windows: [{ day_of_week: 1, start_minute: 540, end_minute: 720 }],
    blocks: [], overrides: [], timezone: TZ, duration: 30,
    from: mon, to: tue, minLead: 0,
  });
  console.log(`1. Toronto Mon 9-12 → ${s1.length} slots (expected 6): ${s1.length === 6 ? "PASS" : "FAIL"}`);

  const s2 = generateSlots({
    windows: [{ day_of_week: 1, start_minute: 540, end_minute: 720 }],
    blocks: [{ start_at: new Date("2026-08-17T14:30:00Z"), end_at: new Date("2026-08-17T15:30:00Z") }],
    overrides: [], timezone: TZ, duration: 30,
    from: mon, to: tue, minLead: 0,
  });
  console.log(`2. Block overlap → ${s2.length} slots (expected 4): ${s2.length === 4 ? "PASS" : "FAIL"}`);

  const s3 = generateSlots({
    windows: [{ day_of_week: 1, start_minute: 540, end_minute: 600 }],
    blocks: [], overrides: [], timezone: "Australia/Sydney", duration: 60,
    from: new Date("2026-08-16T00:00:00Z"), to: new Date("2026-08-17T00:00:00Z"), minLead: 0,
  });
  const t3ok = s3.length === 1 && s3[0].start_at === "2026-08-16T23:00:00.000Z";
  console.log(`3. Sydney tz → ${s3.length} slot at 23:00 UTC (expected 1): ${t3ok ? "PASS" : "FAIL"}`);

  const s4 = generateSlots({
    windows: [{ day_of_week: 1, start_minute: 540, end_minute: 720 }],
    blocks: [], overrides: [], timezone: TZ, duration: 30,
    from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-08-11T00:00:00Z"), minLead: 0,
  });
  // Aug 10 2026 is a Monday, in the past — cutoff with minLead=0 should still exclude past slots
  console.log(`4. Past-date window → ${s4.length} slots (expected 0): ${s4.length === 0 ? "PASS" : "FAIL"}`);

  // ========== PRECEDENCE TEST 1: override beats recurring ==========
  console.log("\n=== PRECEDENCE 1: override > recurring ===");
  // Recurring Tuesday 9-17, override a specific Tuesday (Aug 18, 2026) to 6pm-8pm only
  const tue18 = new Date("2026-08-18T00:00:00Z");
  const wed19 = new Date("2026-08-19T00:00:00Z");
  const tue25 = new Date("2026-08-25T00:00:00Z");
  const wed26 = new Date("2026-08-26T00:00:00Z");

  const overridden = generateSlots({
    windows: [{ day_of_week: 2, start_minute: 540, end_minute: 1020 }], // Tue 9-17
    blocks: [], overrides: [{ date: "2026-08-18", start_minute: 18 * 60, end_minute: 20 * 60 }],
    timezone: TZ, duration: 60,
    from: tue18, to: wed19, minLead: 0,
  });
  console.log(`Override date (Tue Aug 18) → ${overridden.length} slots (expected 2: 18:00, 19:00 UTC+4h)`);
  overridden.forEach((s) => console.log("  " + fmt(s)));
  // In Toronto (EDT, UTC-4), 6pm local = 22:00 UTC, 7pm = 23:00 UTC
  const overrideOk = overridden.length === 2 &&
    overridden[0].start_at === "2026-08-18T22:00:00.000Z" &&
    overridden[1].start_at === "2026-08-18T23:00:00.000Z";
  console.log(`Override wins for that date: ${overrideOk ? "PASS" : "FAIL"}`);

  const otherTuesday = generateSlots({
    windows: [{ day_of_week: 2, start_minute: 540, end_minute: 1020 }],
    blocks: [], overrides: [{ date: "2026-08-18", start_minute: 18 * 60, end_minute: 20 * 60 }],
    timezone: TZ, duration: 60,
    from: tue25, to: wed26, minLead: 0,
  });
  // Other Tuesday keeps recurring 9-17 (8 hours = 8 slots at 60min)
  console.log(`Other Tuesday (Aug 25) → ${otherTuesday.length} slots (expected 8, recurring kept)`);
  const otherOk = otherTuesday.length === 8 && otherTuesday[0].start_at === "2026-08-25T13:00:00.000Z";
  console.log(`Recurring pattern intact for other Tuesdays: ${otherOk ? "PASS" : "FAIL"}`);

  // ========== PRECEDENCE TEST 2: block beats override ==========
  console.log("\n=== PRECEDENCE 2: block > override ===");
  // Mirror saveAvailability storage: full local day for "2026-08-18" in
  // Toronto = 04:00Z Aug 18 → 04:00Z Aug 19
  const blockedAndOverridden = generateSlots({
    windows: [{ day_of_week: 2, start_minute: 540, end_minute: 1020 }],
    blocks: [{ start_at: new Date("2026-08-18T04:00:00Z"), end_at: new Date("2026-08-19T04:00:00Z") }],
    overrides: [{ date: "2026-08-18", start_minute: 18 * 60, end_minute: 20 * 60 }],
    timezone: TZ, duration: 60,
    from: tue18, to: wed19, minLead: 0,
  });
  console.log(`Blocked + overridden date → ${blockedAndOverridden.length} slots (expected 0)`);
  console.log(`Block wins over override: ${blockedAndOverridden.length === 0 ? "PASS" : "FAIL"}`);

  // Sanity: the SAME UTC span is a full local day in Toronto but NOT in
  // Sydney (UTC+10) — there it must fall through to per-slot filtering and
  // the override slots (04:00-06:00 UTC) are not overlapped by it...
  // Actually 04:00Z Aug18→04:00Z Aug19 in Sydney covers local Aug 18 fully
  // (14:00Z+10=Aug19... skip), just verify Toronto day after is intact:
  const dayAfterBlock = generateSlots({
    windows: [{ day_of_week: 2, start_minute: 540, end_minute: 1020 }],
    blocks: [{ start_at: new Date("2026-08-18T04:00:00Z"), end_at: new Date("2026-08-19T04:00:00Z") }],
    overrides: [],
    timezone: TZ, duration: 60,
    from: tue25, to: wed26, minLead: 0,
  });
  console.log(`Day after block (Aug 25) → ${dayAfterBlock.length} slots (expected 8, block does not leak)`);
  console.log(`Block scoped to its date: ${dayAfterBlock.length === 8 ? "PASS" : "FAIL"}`);

  await pool.end();
  console.log("\nDone.");
}
main().catch((e) => { console.error("FATAL:", e.message); pool.end(); });
