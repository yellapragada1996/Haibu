"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Card } from "./Card";

type ToastItem = {
  id: string;
  message: string;
  type?: "info" | "success" | "error";
};

let addToastFn: ((msg: string, type?: string) => void) | null = null;

export function toast(message: string, type?: "info" | "success" | "error") {
  addToastFn?.(message, type);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type: type as ToastItem["type"] }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  const typeColors: Record<string, string> = {
    info: "",
    success: "border-l-live-green",
    error: "border-l-error",
  };

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <Card
            key={t.id}
            className={`max-w-sm animate-slide-up border-l-4 ${typeColors[t.type ?? "info"]}`}
          >
            <p className="text-sm text-white">{t.message}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
