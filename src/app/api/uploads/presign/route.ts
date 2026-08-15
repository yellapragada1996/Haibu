import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  // Auth — the user identity comes from the session, never the request body.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let purpose: string;
  let contentType: string;
  try {
    const body = await request.json();
    purpose = body.purpose;
    contentType = body.contentType;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (purpose !== "avatar" && purpose !== "banner") {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, or WebP images are allowed" },
      { status: 400 },
    );
  }

  // Stable deterministic path — derived from the session, not client input.
  // Re-uploads overwrite the previous object; no orphaned files accumulate.
  let storagePath: string;
  if (purpose === "avatar") {
    storagePath = `avatars/${user.id}`;
  } else {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.user_id, user.id));
    if (!profile) {
      return NextResponse.json(
        { error: "Create a creator profile first" },
        { status: 400 },
      );
    }
    storagePath = `banners/${profile.id}`;
  }

  const serviceSupabase = await createServiceClient();
  const { data, error } = await serviceSupabase.storage
    .from("haibu-media")
    .createSignedUploadUrl(storagePath, {
      upsert: true,
    });

  if (error || !data?.signedUrl) {
    console.error("[presign] error:", JSON.stringify(error));
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    publicPath: storagePath,
    maxSize: MAX_SIZE,
  });
}
