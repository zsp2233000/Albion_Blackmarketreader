import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, className, id, ...rest }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-1" htmlFor={id}>
      {label ? <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span> : null}
      <input
        id={id}
        {...rest}
        className={cn(
          "h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none",
          "focus:border-emerald-400",
          className
        )}
      />
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

