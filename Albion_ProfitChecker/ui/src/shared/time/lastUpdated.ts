/** Shared "Last updated" formatting from a data file's generatedAt ISO timestamp. */

export interface UpdatedStamp {
  /** Local clock time, e.g. "12:44". */
  time: string;
  /** Local date, e.g. "30.05.2026". */
  date: string;
  /** Human relative age, e.g. "2h ago" / "just now". */
  relative: string;
  /** Full local datetime for a tooltip. */
  title: string;
}

const EMPTY: UpdatedStamp = { time: "--:--", date: "", relative: "", title: "No data timestamp" };

/** "just now" / "5m ago" / "2h ago" / "3d ago" from an ISO timestamp. */
export function relativeFromNow(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Parse a generatedAt ISO string into display parts. Safe on null/invalid input. */
export function formatUpdated(iso: string | null | undefined, now: number = Date.now()): UpdatedStamp {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("de-CH");
  return { time, date, relative: relativeFromNow(iso, now), title: d.toLocaleString() };
}
