import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

const PAGE_SIZE = 10;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cursor = request.nextUrl.searchParams.get("cursor");

  const publicFilter = and(
    eq(reviews.creator_id, id),
    eq(reviews.is_public, true),
    eq(reviews.reviewer_role, "guest"),
  );

  let cursorFilter;
  if (cursor) {
    cursorFilter = sql`(${reviews.created_at}, ${reviews.id}) < (
      SELECT created_at, id FROM reviews WHERE id = ${cursor}
    )`;
  }

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      created_at: reviews.created_at,
      guest_name: sql<string>`COALESCE((SELECT u.display_name FROM bookings b JOIN users u ON u.id = b.fan_id WHERE b.id = ${reviews.booking_id}), 'Guest')`,
    })
    .from(reviews)
    .where(cursorFilter ? and(publicFilter, cursorFilter) : publicFilter)
    .orderBy(sql`${reviews.created_at} DESC, ${reviews.id} DESC`)
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? last.id : null;

  const result: Record<string, unknown> = {
    reviews: page.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      guestName: r.guest_name,
      createdAt: r.created_at.toISOString(),
    })),
    nextCursor,
  };

  if (!cursor) {
    const dist = await db
      .select({
        rating: reviews.rating,
        count: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(publicFilter)
      .groupBy(reviews.rating);

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of dist) {
      if (d.rating != null) distribution[d.rating] = Number(d.count);
    }
    result.distribution = distribution;
  }

  return NextResponse.json(result);
}
