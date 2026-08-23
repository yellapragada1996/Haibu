import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reviews, bookings, users } from "@/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";

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

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      created_at: reviews.created_at,
      guest_name: users.display_name,
    })
    .from(reviews)
    .innerJoin(bookings, eq(bookings.id, reviews.booking_id))
    .innerJoin(users, eq(users.id, bookings.fan_id))
    .where(
      cursor
        ? and(publicFilter, lt(reviews.created_at, new Date(cursor)))
        : publicFilter,
    )
    .orderBy(sql`${reviews.created_at} DESC`)
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].created_at.toISOString() : null;

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
