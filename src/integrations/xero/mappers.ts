// Xero dates arrive as .NET-style "/Date(1787702400000+0000)/" strings - the
// number is already an absolute UTC epoch in milliseconds, the trailing
// +/-HHMM (when present) is just the source timezone offset, not something
// that needs to be applied on top.
const XERO_DATE_RE = /\/Date\((\d+)([+-]\d{4})?\)\//;

export function parseXeroDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = XERO_DATE_RE.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]));
}
