import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { ageingBucket, daysOverdue, outstandingInvoices, totalOverdue, arAgeingSummary } from "@/lib/calculations";
import { liveArAgeingSummary, liveTotalOverdue, loadLiveReceivables, type LiveInvoice } from "@/lib/xero-source";

export const dynamic = "force-dynamic";

const BUCKET_LABELS: { key: keyof ReturnType<typeof arAgeingSummary>; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "1-7", label: "1-7 days" },
  { key: "8-30", label: "8-30 days" },
  { key: "31-60", label: "31-60 days" },
  { key: "61-90", label: "61-90 days" },
  { key: "90+", label: "90+ days" },
];

export default async function ReceivablesPage() {
  const live = await loadLiveReceivables();
  const isLive = live.source === "live";

  const invoices: LiveInvoice[] = isLive
    ? live.invoices
    : outstandingInvoices()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          customer: i.customer,
          jobId: i.jobId ?? null,
          jobNumber: i.jobId ?? null, // mock job.id is already a friendly "DUA-XXXX" string
          amount: i.amount,
          amountOutstanding: i.amountOutstanding,
          dueDate: i.dueDate,
          status: i.status,
        }));

  const ageing = isLive ? liveArAgeingSummary(invoices) : arAgeingSummary();
  const overdue0 = isLive ? liveTotalOverdue(invoices, 0) : totalOverdue(0);
  const overdue30 = isLive ? liveTotalOverdue(invoices, 30) : totalOverdue(30);
  const overdue60 = isLive ? liveTotalOverdue(invoices, 60) : totalOverdue(60);
  const totalOutstanding = invoices.reduce((s, i) => s + i.amountOutstanding, 0);

  return (
    <div>
      <PageHeader
        title="Receivables"
        description={
          isLive
            ? "Live from Xero - customer invoices and payments, the system of record for what's actually been billed and collected."
            : "Customer invoices and payments from Xero. This is the system of record for what has actually been billed and collected."
        }
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />

      {!isLive && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total outstanding" value={formatAUD(totalOutstanding)} sub={`${invoices.length} open invoices`} />
        <StatCard label="Total overdue" value={formatAUD(overdue0)} tone={overdue0 > 0 ? "warn" : "good"} />
        <StatCard label="Overdue > 30 days" value={formatAUD(overdue30)} tone={overdue30 > 0 ? "bad" : "good"} />
        <StatCard label="Overdue > 60 days" value={formatAUD(overdue60)} tone={overdue60 > 0 ? "bad" : "good"} />
      </div>

      <Card title="Ageing" className="mb-6">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {BUCKET_LABELS.map(({ key, label }) => (
            <div key={key}>
              <div className="text-xs text-slate-400">{label}</div>
              <div className={`text-lg font-semibold tabular-nums mt-1 ${key === "current" || key === "1-7" ? "text-white" : "text-amber-400"}`}>
                {formatAUD(ageing[key])}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Open invoices">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Invoice</th>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">Job</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Outstanding</th>
                <th className="pb-2 font-medium">Due date</th>
                <th className="pb-2 font-medium text-right">Days overdue</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invoices.map((inv) => {
                const overdue = daysOverdue(inv.dueDate);
                const bucket = ageingBucket(inv.dueDate);
                return (
                  <tr key={inv.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5 text-slate-300">{inv.invoiceNumber}</td>
                    <td className="py-2.5 text-slate-300">{inv.customer}</td>
                    <td className="py-2.5">
                      {inv.jobId ? (
                        <Link href={`/jobs/${inv.jobId}`} className="text-brand-400 hover:text-brand-300">
                          {inv.jobNumber ?? inv.jobId}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(inv.amount)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-200 font-medium">{formatAUD(inv.amountOutstanding)}</td>
                    <td className="py-2.5 text-slate-400 whitespace-nowrap">{formatDateAU(inv.dueDate)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-400">{overdue > 0 ? overdue : "—"}</td>
                    <td className="py-2.5 text-right">
                      <StatusPill tone={bucket === "current" ? "neutral" : bucket === "1-7" ? "warn" : "bad"}>
                        {inv.status.replace("_", " ")}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">No open invoices.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
