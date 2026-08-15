"use client";

// Shared client-side upload helper: presign → PUT → complete.
// Returns the saved public URL (with cache-bust param).

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const MAX_SIZE = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "Only JPG, PNG, or WebP images are allowed";
  }
  if (file.size > MAX_SIZE) {
    return "File exceeds 5MB limit";
  }
  return null;
}

export async function uploadImage(
  purpose: "avatar" | "banner",
  file: File,
): Promise<string> {
  // 1. Get signed URL
  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, contentType: file.type }),
  });
  const presignData = await presignRes.json();
  if (!presignRes.ok) {
    throw new Error(presignData.error ?? "Presign failed");
  }

  // 2. Upload bytes directly to storage
  const uploadRes = await fetch(presignData.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) {
    throw new Error("Upload failed");
  }

  // 3. Confirm + save URL
  const completeRes = await fetch("/api/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, publicPath: presignData.publicPath }),
  });
  const completeData = await completeRes.json();
  if (!completeRes.ok) {
    throw new Error(completeData.error ?? "Save failed");
  }

  return completeData.url as string;
}
