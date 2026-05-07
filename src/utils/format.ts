/**
 * Misc formatters used across panels.
 */

export function formatTemp(t: number | null, unit = "°"): string {
  if (t == null || Number.isNaN(t)) return "--";
  // 1 decimal only when needed; Figma display shows "21°" / "24°C" cleanly.
  if (Number.isInteger(t)) return `${t}${unit}`;
  return `${t.toFixed(1)}${unit}`;
}

export function formatTime(d: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale || undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
