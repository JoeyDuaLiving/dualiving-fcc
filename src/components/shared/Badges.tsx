import type { AlertSeverity, Confidence } from "@/types";

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  actual: "bg-slate-700 text-slate-200",
  committed: "bg-blue-500/15 text-blue-300",
  forecast: "bg-amber-500/15 text-amber-300",
  potential: "bg-purple-500/15 text-purple-300",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  actual: "Actual",
  committed: "Committed",
  forecast: "Forecast",
  potential: "Potential",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${CONFIDENCE_STYLE[confidence]}`}
    >
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

export const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  positive: "bg-emerald-500",
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const label = severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Good news";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[severity]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {label}
    </span>
  );
}

export function StatusPill({ tone, children }: { tone: "neutral" | "good" | "bad" | "warn"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-slate-700 text-slate-200",
    good: "bg-emerald-500/15 text-emerald-300",
    bad: "bg-red-500/15 text-red-300",
    warn: "bg-amber-500/15 text-amber-300",
  } as const;
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[tone]}`}>{children}</span>;
}
