import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-emerald-500 text-black border border-emerald-400",
  secondary: "bg-slate-800 text-slate-100 border border-slate-600",
  ghost: "bg-transparent text-slate-200 border border-slate-700",
  danger: "bg-rose-900/40 text-rose-300 border border-rose-500/40"
};

export function Button({
  variant = "primary",
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
        "disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90",
        variantClass[variant],
        className
      )}
    >
      {leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}

