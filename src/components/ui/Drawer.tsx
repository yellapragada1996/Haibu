"use client";

import { useEffect, type ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

// Right-side slide-in panel for inspecting an item while keeping the list in
// view (the moderation-queue pattern: scan → inspect → act → next).
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border-subtle bg-bg-surface p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && (
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-xl leading-none text-text-tertiary hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
