import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { creatorProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let purpose: string;
  let publicPath: string;
  try {
    const body = await request.json();
    purpose = body.purpose;
    publicPath = body.publicPath;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (purpose !== "avatar" && purpose !== "banner") {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  // Ownership gate: the path must match what presign would have generated
  // for THIS authenticated user. A request targeting someone else's path
  // is rejected.
  let expectedPath: string;
  if (purpose === "avatar") {
    expectedPath = `avatars/${user.id}`;
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
    expectedPath = `banners/${profile.id}`;
  }

  if (publicPath !== expectedPath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Verify the object actually exists and is within limits — HEAD the
  // public URL. This checks real storage state, not client-declared metadata.
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl = `${projectUrl}/storage/v1/object/public/haibu-media/${publicPath}`;

  try {
    const res = await fetch(publicUrl, { method: "HEAD" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Upload not found — upload failed" },
        { status: 400 },
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Invalid file type" },
        { status: 400 },
      );
    }
    if (contentLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 5MB limit" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify upload" },
      { status: 500 },
    );
  }

  // Save the URL only after a verified successful upload.
  // Cache-bust query param: the deterministic path means the URL string is
  // stable across re-uploads, but browsers cache by URL — without a version
  // param, a replaced image would keep showing the old cached one.
  const versionedUrl = `${publicUrl}?v=${Date.now()}`;

  if (purpose === "avatar") {
    await db
      .update(users)
      .set({ avatar_url: versionedUrl })
      .where(eq(users.id, user.id));
  } else {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.user_id, user.id));
    if (profile) {
      await db
        .update(creatorProfiles)
        .set({ banner_url: versionedUrl })
        .where(eq(creatorProfiles.id, profile.id));
    }
  }

  return NextResponse.json({ success: true, url: versionedUrl });
}
