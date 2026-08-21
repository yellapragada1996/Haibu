import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { db } from "@/db";
import { creatorProfiles, users, offerings } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { SlotPicker } from "@/components/SlotPicker";
import { generateAvailableSlots } from "@/lib/availability";

// Screen 2 — PUBLIC slot picker (deferred auth): guests pick a date + time
// BEFORE authenticating. No login required to reach this screen.
export default async function SlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string }>;
  searchParams: Promise<{ offering?: string }>;
}) {
  const { creatorId } = await params;
  const sp = await searchParams;
  const offeringParam = typeof sp.offering === "string" ? sp.offering : null;

  // Reject non-UUID creator ids cleanly (invalid UUIDs would 500 at the DB).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) {
    notFound();
  }

  const [creator] = await db
    .select({
      id: creatorProfiles.id,
      display_name: users.display_name,
      avatar_url: users.avatar_url,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.user_id))
    .where(
      and(
        eq(creatorProfiles.id, creatorId),
        eq(creatorProfiles.is_published, true),
      ),
    );
  if (!creator) notFound();

  const offeringRows = await db
    .select()
    .from(offerings)
    .where(
      and(
        eq(offerings.creator_id, creatorId),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(offerings.price_cents);

  const offering = offeringParam
    ? offeringRows.find((o) => o.id === offeringParam)
    : offeringRows[0];
  if (!offering) notFound();

  // Availability is generated directly (same code the /api/availability route
  // uses). Avoid a server-to-server fetch that breaks when NEXT_PUBLIC_APP_URL
  // is unset/wrong in the deployed environment.
  const now = new Date();
  const to = new Date(now.getTime() + 30 * 86400000);
  let slots: { start_at: string; end_at: string }[] = [];
  try {
    slots = await generateAvailableSlots({
      creator_id: creatorId,
      offering_id: offering.id,
      from: now,
      to,
    });
  } catch (err) {
    console.error("[slots] generateAvailableSlots failed", err);
  }

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-[480px] px-4 py-6">
        <SlotPicker
          creator={creator}
          offering={{
            id: offering.id,
            title: offering.title,
            duration_minutes: offering.duration_minutes,
            price_cents: offering.price_cents,
          }}
          slots={slots}
        />
      </main>
    </PublicLayout>
  );
}
