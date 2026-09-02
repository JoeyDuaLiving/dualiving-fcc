import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { apUpcomingWithin, daysOverdue, outstandingBills } from "@/lib/calculations";
import { liveApUpcomingWithin, loadLivePayables, type LiveBill } from "@/lib/xero-source";
import { TODAY } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

// A supplier with this much or more currently outstanding gets its own
// summary card - catches both patterns seen in this tenant's real data:
// many small bills from one recurring supplier (Bunnings, 78 bills/$17k,
// invisible in a flat chronological list) and a few large ones (Brisbane
// Plastering, 2 bills/$16k).
const LARGE_SUPPLIER_THRESHOLD = 5000;

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Bucket {
  key: string;
  label: string;
  bills: (LiveBill & { category?: string })[];
}

function bucketByDueDate(bills: (LiveBill & { category?: string })[]): Bucket[] {
  const overdue = bills.filter((b) => daysOverdue(b.dueDate) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = bills.filter((b) => daysOverdue(b.dueDate) <= 0);

  const thisWeekMonday = mondayOf(TODAY);
  const nextWeekMonday = addDaysISO(thisWeekMonday, 7);

  const byWeek = new Map<string, (LiveBill & { category?: string })[]>();
  for (const bill of upcoming) {
    const weekStart = mondayOf(bill.dueDate);
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, []);
    byWeek.get(weekStart)!.push(bill);
  }

  const weekBuckets: Bucket[] = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekBills]) => {
      const weekEnd = addDaysISO(weekStart, 6);
      const range = `${formatDateAU(weekStart)} - ${formatDateAU(weekEnd)}`;
      const label = weekStart === thisWeekMonday ? `This week (${range})` : weekStart === nextWeekMonday ? `Next week (${range})` : `Week of ${range}`;
      return { key: weekStart, label, bills: weekBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)) };
    });

  const buckets: Bucket[] = [];
  if (overdue.length > 0) buckets.push({ key: "overdue", label: "Overdue", bills: overdue });
  buckets.push(...weekBuckets);
  return buckets;
}

export default async function PayablesPage() {
  const live = await loadLivePayables();
  const isLive = live.source === "live";

  const bills: (LiveBill & { category?: string })[] = isLive
    ? live.bills
    : outstandingBills()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((b) => ({
          id: b.id,
          billNumber: b.billNumber,
          supplier: b.supplier,
          jobId: b.jobId ?? null,
          jobNumber: b.jobId ?? null, // mock job.id is already a friendly "DUA-XXXX" string
          category: b.category,
          amount: b.amount,
          amountOutstanding: b.amountOutstanding,
          dueDate: b.dueDate,
          status: b.status,
        }));

  const totalOutstanding = bills.reduce((s, b) => s + b.amountOutstanding, 0);
  const windows = [7, 14, 30, 60, 90];
  const dueWithin = (days: number) => (isLive ? liveApUpcomingWithin(live.bills, days) : apUpcomingWithin(days));
  const overdueTotal = bills.filter((b) => daysOverdue(b.dueDate) > 0).reduce((s, b) => s + b.amountOutstanding, 0);

  const bySupplier = new Map<string, { total: number; count: number }>();
  for (const bill of bills) {
    const entry = bySupplier.get(bill.supplier) ?? { total: 0, count: 0 };
    entry.total += bill.amountOutstanding;
    entry.count += 1;
    bySupplier.set(bill.supplier, entry);
  }
  const largeSuppliers = Array.from(bySupplier.entries())
    .filter(([, v]) => v.total >= LARGE_SUPPLIER_THRESHOLD)
    .sort(([, a], [, b]) => b.total - a.total);

  const buckets = bucketByDueDate(bills);

  return (
    <div>
      <PageHeader
        title="Payables"
        description={
          isLive
            ? "Live from Xero - supplier bills currently outstanding (not the full historical archive)."
            : "Supplier bills from Xero. Upcoming payment windows feed directly into the cash flow forecast."
        }
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />

      {!isLive && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total outstanding" value={formatAUD(totalOutstanding)} sub={`${bills.length} open bills`} />
        <StatCard label="Overdue" value={formatAUD(overdueTotal)} tone="warn" />
        <StatCard label="Due within 30 days" value={formatAUD(dueWithin(30))} />
      </div>

      <Card title="Upcoming payment windows" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {windows.map((w) => (
            <div key={w}>
              <div className="text-xs text-slate-400">Next {w} days</div>
              <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(dueWithin(w))}</div>
            </div>
          ))}
        </div>
      </Card>

      {largeSuppliers.length > 0 && (
        <Card
          title="Larger suppliers"
          action={<span className="text-xs text-slate-500">${LARGE_SUPPLIER_THRESHOLD.toLocaleString()}+ outstanding</span>}
          className="mb-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {largeSuppliers.map(([supplier, { total, count }]) => (
              <div key={supplier} className="rounded-lg border border-slate-800 p-3">
                <div className="text-sm text-slate-200 font-medium truncate">{supplier}</div>
                <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(total)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{count} bill{count === 1 ? "" : "s"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {buckets.map((bucket) => (
        <Card
          key={bucket.key}
          title={bucket.label}
          action={
            <span className={`text-xs ${bucket.key === "overdue" ? "text-red-400" : "text-slate-500"}`}>
              {formatAUD(bucket.bills.reduce((s, b) => s + b.amountOutstanding, 0))} &middot; {bucket.bills.length} bill{bucket.bills.length === 1 ? "" : "s"}
            </span>
          }
          className="mb-6"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Bill</th>
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium">Job</th>
                  {!isLive && <th className="pb-2 font-medium">Category</th>}
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium text-right">Outstanding</th>
                  <th className="pb-2 font-medium">Due date</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {bucket.bills.map((bill) => {
                  const overdue = daysOverdue(bill.dueDate);
                  return (
                    <tr key={bill.id} className="hover:bg-slate-900/60">
                      <td className="py-2.5 text-slate-300">{bill.billNumber}</td>
                      <td className="py-2.5 text-slate-300">{bill.supplier}</td>
                      <td className="py-2.5">
                        {bill.jobId ? (
                          <Link href={`/jobs/${bill.jobId}`} className="text-brand-400 hover:text-brand-300">
                            {bill.jobNumber ?? bill.jobId}
                          </Link>
                        ) : (
                          <span className="text-slate-500">Overhead</span>
                        )}
                      </td>
                      {!isLive && <td className="py-2.5 text-slate-400">{bill.category}</td>}
                      <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(bill.amount)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-200 font-medium">{formatAUD(bill.amountOutstanding)}</td>
                      <td className="py-2.5 text-slate-400 whitespace-nowrap">{formatDateAU(bill.dueDate)}</td>
                      <td className="py-2.5 text-right">
                        <StatusPill tone={overdue > 0 ? "bad" : bill.status === "awaiting_approval" ? "warn" : "neutral"}>
                          {bill.status.replace("_", " ")}
                        </StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {buckets.length === 0 && (
        <Card title="Open bills">
          <p className="py-6 text-center text-slate-500">No open bills.</p>
        </Card>
      )}
    </div>
  );
}
