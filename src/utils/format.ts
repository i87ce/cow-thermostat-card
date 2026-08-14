/**
 * Misc formatters used across panels.
 */

export function formatTemp(t: number | null, unit = "°"): string {
  if (t == null || !Number.isFinite(t)) return "—";
  // One decimal when needed ("26.5°"), strip ".0" so integers stay "21°".
  return `${t.toFixed(1).replace(/\.0$/, "")}${unit}`;
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
