"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCreatorProfile, removeBanner } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ImageUpload } from "@/components/ImageUpload";
import { uploadImage } from "@/lib/imageUpload";

export function ProfileForm({
  existingBio,
  hasProfile,
  avatarUrl,
  bannerUrl,
  displayName,
  formId,
  hideSubmit,
  onComplete,
}: {
  existingBio: string;
  hasProfile: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  displayName: string;
  formId?: string;
  hideSubmit?: boolean;
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stagedAvatar, setStagedAvatar] = useState<File | null>(null);
  const [stagedBanner, setStagedBanner] = useState<File | null>(null);

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Capture the form element synchronously — React releases synthetic
    // events after the handler's synchronous phase, so e.currentTarget is
    // null after any await.
    const form = e.currentTarget;
    setSaveState("saving");
    setError(null);

    // Create/update the profile BEFORE uploading files — the banner presign
    // API needs the profile ID for the storage path, so new users must have
    // a profile row before we can upload a banner.
    const formData = new FormData(form);
    let result: Awaited<ReturnType<typeof upsertCreatorProfile>>;
    try {
      result = await upsertCreatorProfile(formData);
    } catch {
      setError("Something went wrong — please try again");
      setSaveState("idle");
      return;
    }
    if (result && "error" in result) {
      setError((result as { error: string }).error);
      setSaveState("idle");
      return;
    }

    try {
      if (stagedAvatar) await uploadImage("avatar", stagedAvatar);
      if (stagedBanner) await uploadImage("banner", stagedBanner);
    } catch (uploadErr) {
      setError(uploadErr instanceof Error ? uploadErr.message : "Upload failed");
      setSaveState("idle");
      return;
    }

    setStagedAvatar(null);
    setStagedBanner(null);
    setSaveState("saved");
    if (onComplete) {
      onComplete();
    } else if (hasProfile) {
      router.refresh();
    } else {
      router.push("/creator");
    }
  };

  return (
    <form onSubmit={handleSave} id={formId} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Display name
        </label>
        <Input
          name="display_name"
          defaultValue={displayName}
          placeholder="Your display name"
        />
      </div>

      <div>
        <ImageUpload
          purpose="avatar"
          currentUrl={avatarUrl}
          label="Avatar"
          nameFallback={displayName}
          onStagedFile={setStagedAvatar}
        />
      </div>

      <div>
        <ImageUpload
          purpose="banner"
          currentUrl={bannerUrl}
          label="Banner image"
          nameFallback={displayName}
          onStagedFile={setStagedBanner}
          onRemove={async () => {
            await removeBanner();
          }}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text-secondary">
          Bio
        </label>
        <textarea
          name="bio"
          defaultValue={existingBio}
          rows={4}
          placeholder="Tell guests about yourself and your sessions..."
          className="w-full bg-bg-base border border-border-subtle outline-none rounded-input px-4 py-3 text-sm text-text-primary placeholder-text-secondary transition-colors focus:border-primary resize-none"
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {!hideSubmit && (
        <Button type="submit" disabled={saveState !== "idle"}>
          {saveState === "saving"
            ? "Updating..."
            : saveState === "saved"
              ? "Updated ✓"
              : hasProfile
                ? "Update profile"
                : "Create profile"}
        </Button>
      )}
    </form>
  );
}
