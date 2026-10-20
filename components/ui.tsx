import Link from "next/link";
import type { ComponentProps } from "react";
import type { Level } from "@/lib/monitor";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 1.5C9 1.5 3.5 7.6 3.5 11.2A5.5 5.5 0 0 0 14.5 11.2C14.5 7.6 9 1.5 9 1.5Z" fill="#0a5ca8" />
      <rect x="5.6" y="10.6" width="6.8" height="1.4" fill="#fff" />
    </svg>
  );
}

const dot: Record<Level, string> = {
  safe: "bg-safe",
  check: "bg-check",
  unsafe: "bg-unsafe",
  offline: "bg-off",
};

/** Status is always a dot plus a word, never colour alone. */
export function StatusDot({ level, className = "" }: { level: Level; className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${dot[level]} ${className}`} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: "primary" | "secondary" };

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96]";

export const buttonStyles = {
  primary: `${base} bg-brand text-white hover:bg-brand-deep`,
  secondary: `${base} border border-line bg-card text-ink hover:border-faint`,
};

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`${buttonStyles[variant]} ${className}`} {...props} />;
}
