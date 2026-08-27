import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { SeverityBadge, StatusPill } from "@/components/shared/Badges";
import { generateAlerts } from "@/lib/calculations";
import { computeLiveAlerts } from "@/lib/live-forecast";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const live = await computeLiveAlerts();
  const isLive = live.source === "live";
  const alerts = isLive ? live.alerts : generateAlerts();

  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");
  const positive = alerts.filter((a) => a.severity === "positive");

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Automatically generated from cash forecasts, job costing and receivables - not a manual checklist."
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />

      {!isLive && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Critical" value={String(critical.length)} tone={critical.length > 0 ? "bad" : "good"} />
        <StatCard label="Warning" value={String(warning.length)} tone={warning.length > 0 ? "warn" : "good"} />
        <StatCard label="Good news" value={String(positive.length)} tone="good" />
      </div>

      <Card title="All alerts">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">No management issues detected right now.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {alerts.map((alert) => (
              <li key={alert.id} className="py-3 first:pt-0">
                <Link href={alert.href ?? "#"} className="block group">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-slate-100 group-hover:text-white">{alert.title}</span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <p className="text-sm text-slate-400">{alert.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
