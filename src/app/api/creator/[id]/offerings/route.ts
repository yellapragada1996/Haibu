import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { offerings } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rows = await db
    .select({
      id: offerings.id,
      title: offerings.title,
      duration_minutes: offerings.duration_minutes,
      price_cents: offerings.price_cents,
    })
    .from(offerings)
    .where(
      and(
        eq(offerings.creator_id, id),
        eq(offerings.is_active, true),
        isNull(offerings.deleted_at),
      ),
    )
    .orderBy(offerings.price_cents);

  return NextResponse.json({ offerings: rows });
}
