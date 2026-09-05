import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  pill?: boolean;
};

export function Input({
  error,
  pill = false,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      <input
        className={`w-full bg-bg-base border outline-none transition-colors px-4 py-3 text-sm text-text-primary placeholder-text-secondary ${
          error
            ? "border-error focus:border-error"
            : "border-border-subtle focus:border-primary"
        } ${
          pill ? "rounded-pill" : "rounded-input"
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-error">{error}</p>
      )}
    </div>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string;
};

export function Select({ error, className = "", children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      <select
        className={`w-full bg-bg-base border outline-none rounded-input px-4 py-3 text-sm text-text-primary appearance-none ${
          error
            ? "border-error focus:border-error"
            : "border-border-subtle focus:border-primary"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p className="mt-1 text-xs text-error">{error}</p>
      )}
    </div>
  );
}
