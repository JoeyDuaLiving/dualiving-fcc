import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: "default" | "good" | "bad" | "warn";
  icon?: LucideIcon;
}

const TONE_VALUE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-white",
  good: "text-emerald-400",
  bad: "text-red-400",
  warn: "text-amber-400",
};

export function StatCard({ label, value, sub, href, tone = "default", icon: Icon }: StatCardProps) {
  const content = (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 h-full transition-colors hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400">{label}</div>
        {Icon && <Icon size={14} className="text-slate-600" />}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${TONE_VALUE[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}
