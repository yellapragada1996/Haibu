import Link from "next/link";
import { type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "default" | "small";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border border-border-subtle bg-neutral-default text-text-primary hover:bg-neutral-hover",
  ghost:
    "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-card-hover",
  destructive:
    "bg-error text-white hover:opacity-90 active:opacity-80",
};

const sizeStyles: Record<Size, string> = {
  default: "h-11 px-6 text-sm",
  small: "h-9 px-4 text-sm",
};

const base =
  "inline-flex items-center justify-center font-semibold rounded-pill transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer";

type ButtonProps = {
  variant?: Variant;
  size?: Size;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}

type ButtonLinkProps = {
  variant?: Variant;
  size?: Size;
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function ButtonLink({
  variant = "primary",
  size = "default",
  href,
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
    />
  );
}
