import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { loadLiveJobDetail, type LiveJobDetail } from "@/lib/jobs-source";
import type { BuildxactPurchaseOrder } from "@/integrations/buildxact/types";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const live = await loadLiveJobDetail(id);
  if (live.detail) return <LiveJobDetailView detail={live.detail} />;

  notFound();
}

function LiveJobDetailView({ detail }: { detail: LiveJobDetail }) {
  const { job, cashPosition, purchaseOrders, invoices, xeroBills, xeroInvoices, estimatedCost } = detail;
  const xeroBillsTotal = xeroBills.reduce((s, b) => s + b.amount, 0);
  const xeroInvoicesTotal = xeroInvoices.reduce((s, inv) => s + inv.amount, 0);

  // To-date profit, not a forecast-to-completion margin - actualCost and
  // committedCost don't overlap (committedAmountForPo excludes POs already
  // reflected in actualCost), so this is a clean snapshot of cost incurred
  // and committed so far against contract value, without needing the
  // cost-to-complete figure Buildxact doesn't reliably expose.
  const revisedRevenue = job.contractValue + job.approvedVariations;
  const costToDate = job.actualCost + cashPosition.committedCost;
  const profitToDatePercent = revisedRevenue > 0 ? ((revisedRevenue - costToDate) / revisedRevenue) * 100 : 0;

  // Subcontractor labour, detected from PO descriptions ("Labour", "Wages",
  // "Superannuation") - the same word-boundary tagging pattern as the STOCK
  // detection elsewhere in this app. Deliberately not the full labour cost:
  // this tenant's own crew wages aren't tracked per job in Buildxact (only
  // 46 of 111 jobs have any per-job wage entry at all, and those are small
  // relative to total payroll) - just what's visible via subcontractor POs.
  // Per-PO contribution mirrors how committedAmountForPo/actualCost already
  // treat a PO - the full amount once closed (Received/Completed, already
  // reflected in actualCost), only the not-yet-invoiced remainder while
  // open (reflected in committedCost) - so labour + materials/other always
  // adds back up to costToDate exactly.
  const LABOUR_TAG_RE = /\b(labou?r|wages?|superannuation)\b/i;
  function poCostToDateContribution(po: BuildxactPurchaseOrder): number {
    if (po.orderStatus === "Cancelled") return 0;
    if (po.orderStatus === "Received" || po.orderStatus === "Completed") return po.orderTotalIncTax;
    return Math.max(0, po.orderTotalIncTax - po.invoiceTotalIncTax);
  }
  const isLabourPO = (po: BuildxactPurchaseOrder) => LABOUR_TAG_RE.test(po.description ?? "");
  const labourCostToDate = purchaseOrders.filter(isLabourPO).reduce((s, po) => s + poCostToDateContribution(po), 0);
  const materialsAndOtherCostToDate = Math.max(0, costToDate - labourCostToDate);
  const labourPercent = costToDate > 0 ? (labourCostToDate / costToDate) * 100 : 0;

  return (
    <div>
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={14} /> Back to Jobs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">{job.jobNumber}</h1>
            <StatusPill tone="good">Live</StatusPill>
            <StatusPill tone={job.status === "complete" ? "good" : job.status === "on_hold" ? "warn" : "neutral"}>
              {job.status.replace("_", " ")}
            </StatusPill>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {job.client} &middot; {job.product} &middot; {job.location}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {job.expectedCompletion && <div>Target completion {formatDateAU(job.expectedCompletion)}</div>}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
        This job is loaded live from Buildxact (job, purchase order and invoice data). Forecast cost-to-complete
        and cash-required aren&rsquo;t shown - Buildxact doesn&rsquo;t expose a confirmed &ldquo;cost to
        complete&rdquo; field yet, so those numbers would be guesses rather than real figures. They&rsquo;ll appear
        once that gap is closed (a confirmed field, or a manual override).
        <br className="hidden sm:block" />
        {revisedRevenue > 0 ? (
          <>
            Profit to date is{" "}
            <span className={profitToDatePercent < 0 ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
              {profitToDatePercent.toFixed(1)}%
            </span>{" "}
            - contract value ({formatAUD(revisedRevenue)}) minus actual + committed cost so far (
            {formatAUD(costToDate)}). This doesn&rsquo;t include future cost to complete, so it will move as the job
            progresses.
          </>
        ) : (
          <>Profit to date is N/A - this job has no contract value recorded.</>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Progress" value={`${job.progressPercent}%`} />
        <StatCard label="Contract value" value={formatAUD(job.contractValue)} sub={`incl. ${formatAUD(job.approvedVariations)} variations`} />
        <StatCard label="Estimated cost" value={estimatedCost !== null ? formatAUD(estimatedCost) : "—"} sub={estimatedCost !== null ? "Buildxact estimate" : "No estimate on this job"} />
        <StatCard label="Actual cost" value={formatAUD(job.actualCost)} />
        <StatCard label="Committed cost" value={formatAUD(cashPosition.committedCost)} sub={`${purchaseOrders.length} purchase orders`} />
        <StatCard
          label="Profit to date"
          value={revisedRevenue > 0 ? `${profitToDatePercent.toFixed(1)}%` : "N/A"}
          sub={revisedRevenue > 0 ? "vs actual + committed cost" : "No contract value recorded"}
          tone={revisedRevenue > 0 ? (profitToDatePercent < 0 ? "bad" : "good") : "default"}
        />
        <StatCard label="Cash received" value={formatAUD(cashPosition.cashReceived)} sub={`of ${formatAUD(cashPosition.amountInvoicedToDate)} invoiced`} />
        <StatCard label="Xero bills" value={formatAUD(xeroBillsTotal)} sub={`${xeroBills.length} matched`} />
        <StatCard label="Xero invoices" value={formatAUD(xeroInvoicesTotal)} sub={`${xeroInvoices.length} matched`} />
      </div>

      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
        Xero bills/invoices below are matched to this job by job code (Xero&rsquo;s &ldquo;Job Codes&rdquo; tracking
        category, or a job-number-in-description match for older records) - shown as a cross-check against the
        Buildxact figures above, not a source for them.
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Purchase orders" action={<span className="text-xs text-slate-500">{purchaseOrders.length}</span>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium text-right">Total</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {purchaseOrders.map((po) => (
                <tr key={po.purchaseOrderId}>
                  <td className="py-2 text-slate-300">#{po.orderNumber}</td>
                  <td className="py-2 text-slate-400">
                    {po.description}
                    {isLabourPO(po) && (
                      <span className="ml-2">
                        <StatusPill tone="warn">Labour</StatusPill>
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(po.orderTotalIncTax)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={po.isCompleted ? "good" : "neutral"}>{po.orderStatus}</StatusPill>
                  </td>
                </tr>
              ))}
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">No purchase orders recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Xero bills (matched)" action={<span className="text-xs text-slate-500">{xeroBills.length} &middot; {formatAUD(xeroBillsTotal, { compact: true })}</span>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Bill</th>
                <th className="pb-2 font-medium">Supplier</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Date</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {xeroBills.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 text-slate-300">{b.number}</td>
                  <td className="py-2 text-slate-400">{b.party}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(b.amount)}</td>
                  <td className="py-2 text-right text-slate-400 whitespace-nowrap">{b.date ? formatDateAU(b.date) : "—"}</td>
                  <td className="py-2 text-right text-slate-400">{b.status}</td>
                </tr>
              ))}
              {xeroBills.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">No Xero bills matched to this job.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Cost breakdown" className="mb-6">
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Subcontractor labour</span>
              <span className="text-slate-300 tabular-nums">
                {formatAUD(labourCostToDate)} ({labourPercent.toFixed(0)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${labourPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Materials &amp; other</span>
              <span className="text-slate-300 tabular-nums">
                {formatAUD(materialsAndOtherCostToDate)} ({(100 - labourPercent).toFixed(0)}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${100 - labourPercent}%` }} />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Subcontractor labour only, detected from purchase order descriptions (&ldquo;Labour&rdquo;, &ldquo;Wages&rdquo;,
          &ldquo;Superannuation&rdquo;) - this doesn&rsquo;t include your own crew&rsquo;s wages, which aren&rsquo;t
          tracked per job in Buildxact. Tagged orders are marked &ldquo;Labour&rdquo; in the Purchase orders table
          above.
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Invoices" action={<span className="text-xs text-slate-500">{invoices.length}</span>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Due</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invoices.map((inv) => (
                <tr key={inv.jobPaymentId}>
                  <td className="py-2 text-slate-300">{inv.description}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(inv.totalIncTax)}</td>
                  <td className="py-2 text-right text-slate-400 whitespace-nowrap">{formatDateAU(inv.dueDate)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={inv.status === "Received" ? "good" : "neutral"}>{inv.status}</StatusPill>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">No invoices raised yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Xero invoices (matched)" action={<span className="text-xs text-slate-500">{xeroInvoices.length} &middot; {formatAUD(xeroInvoicesTotal, { compact: true })}</span>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Invoice</th>
                <th className="pb-2 font-medium">Contact</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Date</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {xeroInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 text-slate-300">{inv.number}</td>
                  <td className="py-2 text-slate-400">{inv.party}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(inv.amount)}</td>
                  <td className="py-2 text-right text-slate-400 whitespace-nowrap">{inv.date ? formatDateAU(inv.date) : "—"}</td>
                  <td className="py-2 text-right text-slate-400">{inv.status}</td>
                </tr>
              ))}
              {xeroInvoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">No Xero invoices matched to this job.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
