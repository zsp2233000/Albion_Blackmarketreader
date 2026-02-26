import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  heading?: ReactNode;
  subtitle?: ReactNode;
}

export function Card({ heading, subtitle, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border border-slate-700 bg-slate-900/80 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.25)]",
        className
      )}
    >
      {(heading || subtitle) ? (
        <div className="mb-3">
          {heading ? <h3 className="text-base font-semibold text-slate-100">{heading}</h3> : null}
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
