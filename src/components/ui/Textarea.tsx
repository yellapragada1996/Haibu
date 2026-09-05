import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
};

export function Textarea({
  error,
  className = "",
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <div className="w-full">
      <textarea
        rows={rows}
        className={`w-full bg-bg-base border outline-none transition-colors px-4 py-3 text-sm text-text-primary placeholder-text-secondary resize-y ${
          error
            ? "border-error focus:border-error"
            : "border-border-subtle focus:border-primary"
        } rounded-input ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-error">{error}</p>
      )}
    </div>
  );
}
