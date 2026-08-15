"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { validateImageFile } from "@/lib/imageUpload";

// Staged upload: file selection shows a local preview and reports the file
// to the parent via onStagedFile. The parent uploads it on explicit save.
export function ImageUpload({
  purpose,
  currentUrl,
  label,
  nameFallback,
  onStagedFile,
  onRemove,
}: {
  purpose: "avatar" | "banner";
  currentUrl: string | null;
  label: string;
  nameFallback: string;
  onStagedFile: (file: File | null) => void;
  onRemove?: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  function handleFilePicked(file: File) {
    setError(null);

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Local preview only — no upload until the parent saves.
    setPreview(URL.createObjectURL(file));
    onStagedFile(file);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">
        {label}
      </label>

      <div className="flex items-center gap-3">
        {purpose === "avatar" && (
          <Avatar src={preview} name={nameFallback} size={48} />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFilePicked(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="small"
          onClick={() => fileInputRef.current?.click()}
        >
          {currentUrl || preview ? "Replace" : "Upload"}
        </Button>
        {onRemove && (currentUrl || preview) && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              setError(null);
              try {
                await onRemove();
                setPreview(null);
                onStagedFile(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Remove failed");
              } finally {
                setRemoving(false);
              }
            }}
          >
            {removing ? "Removing..." : "Remove"}
          </Button>
        )}
        {preview && purpose === "banner" && (
          <img
            src={preview}
            alt="Banner preview"
            className="h-12 rounded-card object-cover"
          />
        )}
      </div>

      {error && <p className="mt-1 text-xs text-error">{error}</p>}
      <p className="mt-1 text-xs text-text-tertiary">
        JPG, PNG, or WebP · max 5MB
      </p>
    </div>
  );
}
