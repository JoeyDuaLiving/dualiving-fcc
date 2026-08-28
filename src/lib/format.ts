// All date helpers operate on plain "YYYY-MM-DD" calendar dates and do all
// arithmetic in UTC. Parsing via `new Date(iso)` and formatting via local
// Intl calls would silently shift the date by one day whenever the server's
// timezone offset is non-zero (e.g. AEST) - every function here avoids that
// by never letting the local timezone touch the calendar date.

function parseISODateUTC(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatAUD(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAUDSigned(amount: number): string {
  const formatted = formatAUD(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : `+${formatted}`;
}

export function formatDateAU(iso: string | null | undefined): string {
  // Some Buildxact records (e.g. the STOCK placeholder job's invoice rows)
  // return a null due date despite the raw type declaring it as always a
  // string - real data disagreeing with the documented shape, same caveat
  // as elsewhere in the Buildxact integration. Every call site in this app
  // wants "-" for a missing date, not a crash.
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseISODateUTC(iso));
}

export function formatDateShortAU(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(parseISODateUTC(iso));
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODateUTC(b).getTime() - parseISODateUTC(a).getTime()) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODateUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
