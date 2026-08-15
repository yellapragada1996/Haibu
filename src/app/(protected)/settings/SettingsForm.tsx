"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ImageUpload } from "@/components/ImageUpload";
import { uploadImage } from "@/lib/imageUpload";

export function SettingsForm({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stagedAvatar, setStagedAvatar] = useState<File | null>(null);

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

    // Staged avatar persists together with the name.
    try {
      if (stagedAvatar) await uploadImage("avatar", stagedAvatar);
    } catch (uploadErr) {
      setError(uploadErr instanceof Error ? uploadErr.message : "Upload failed");
      setSaveState("idle");
      return;
    }

    const formData = new FormData(form);
    const result = await updateDisplayName(formData);
    if (result && "error" in result) {
      setError(result.error ?? "");
      setSaveState("idle");
    } else {
      setStagedAvatar(null);
      setSaveState("saved");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave}>
        <Card className="space-y-4">
          <div>
            <ImageUpload
              purpose="avatar"
              currentUrl={avatarUrl}
              label="Avatar"
              nameFallback={name}
              onStagedFile={setStagedAvatar}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Display name
            </label>
            <Input
              name="display_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <Button type="submit" disabled={saveState !== "idle"}>
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "Saved ✓"
                : "Save"}
          </Button>
        </Card>
      </form>
    </div>
  );
}
