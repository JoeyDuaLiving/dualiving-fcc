import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU, formatPercent } from "@/lib/format";
import {
  getJob,
  jobBills,
  jobCashPosition,
  jobCosting,
  jobInvoices,
} from "@/lib/calculations";
import { paymentSchedules, reconciliationFlags } from "@/lib/mock-data";
import { loadLiveJobDetail, type LiveJobDetail } from "@/lib/jobs-source";
import type { Job } from "@/types";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const mockJob = getJob(id);
  if (mockJob) return <MockJobDetail job={mockJob} />;

  const live = await loadLiveJobDetail(id);
  if (live.detail) return <LiveJobDetailView detail={live.detail} />;

  notFound();
}

function MockJobDetail({ job }: { job: Job }) {
  const costing = jobCosting(job);
  const pos = jobCashPosition(job);
  const schedule = paymentSchedules.find((p) => p.jobId === job.id);
  const invoices = jobInvoices(job.id);
  const bills = jobBills(job.id);
  const flags = reconciliationFlags.filter((f) => f.jobId === job.id);

  const costRows = [
    { label: "Labour", value: job.directCostBreakdown.labour },
    { label: "Materials", value: job.directCostBreakdown.materials },
    { label: "Subcontractors", value: job.directCostBreakdown.subcontractors },
    { label: "Freight", value: job.directCostBreakdown.freight },
    { label: "Engineering", value: job.directCostBreakdown.engineering },
    { label: "Site costs", value: job.directCostBreakdown.siteCosts },
    { label: "Other", value: job.directCostBreakdown.other },
  ];
  const maxCost = Math.max(...costRows.map((r) => r.value));

  return (
    <div>
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft size={14} /> Back to Jobs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-white">{job.id}</h1>
            <StatusPill tone={job.status === "complete" ? "good" : job.status === "on_hold" ? "warn" : "neutral"}>
              {job.status.replace("_", " ")}
            </StatusPill>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {job.client} &middot; {job.product} &middot; {job.location} &middot; Buildxact {job.jobNumber}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Start {formatDateAU(job.startDate)}</div>
          <div>Expected completion {formatDateAU(job.expectedCompletion)}</div>
          <div>Contracted completion {formatDateAU(job.contractedCompletion)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Revised revenue" value={formatAUD(costing.revisedRevenue)} sub={`incl. ${formatAUD(job.approvedVariations)} variations`} />
        <StatCard label="Forecast final cost" value={formatAUD(costing.forecastFinalCost)} />
        <StatCard
          label="Forecast gross margin"
          value={formatPercent(costing.forecastMarginPercent)}
          tone={costing.belowTarget ? "bad" : "good"}
          sub={`Target ${job.marginTargetPercent}%`}
        />
        <StatCard
          label="Cash required to finish"
          value={formatAUD(pos.cashRequiredToFinish)}
          tone={pos.cashRequiredToFinish > 0 ? "warn" : "good"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Job costing">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium"></th>
                <th className="pb-2 font-medium text-right">Original budget</th>
                <th className="pb-2 font-medium text-right">Current forecast</th>
                <th className="pb-2 font-medium text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-2 text-slate-400">Revenue</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(costing.originalBudgetRevenue)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(costing.revisedRevenue)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(costing.revisedRevenue - costing.originalBudgetRevenue)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Cost</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(costing.originalBudgetCost)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(costing.forecastFinalCost)}</td>
                <td className={`py-2 text-right tabular-nums ${costing.forecastFinalCost > costing.originalBudgetCost ? "text-red-400" : "text-emerald-400"}`}>
                  {formatAUD(costing.forecastFinalCost - costing.originalBudgetCost)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400 font-medium">Gross profit</td>
                <td className="py-2 text-right tabular-nums text-slate-200 font-medium">{formatAUD(costing.originalBudgetGrossProfit)}</td>
                <td className="py-2 text-right tabular-nums text-slate-200 font-medium">{formatAUD(costing.forecastGrossProfit)}</td>
                <td className={`py-2 text-right tabular-nums font-medium ${costing.grossProfitVariance < 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {formatAUD(costing.grossProfitVariance)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Margin</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatPercent(costing.originalBudgetMarginPercent)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatPercent(costing.forecastMarginPercent)}</td>
                <td className={`py-2 text-right tabular-nums ${costing.marginVariancePoints < 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {costing.marginVariancePoints >= 0 ? "+" : ""}
                  {costing.marginVariancePoints.toFixed(1)} pts
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-4">
            Forecast final cost = actual cost ({formatAUD(job.actualCost)}) + committed cost ({formatAUD(job.committedCost)}) + remaining
            forecast cost ({formatAUD(job.remainingForecastCost)}).
          </p>
        </Card>

        <Card title="Cash position">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-2 text-slate-400">Cash received</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.cashReceived)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Cash spent (paid to suppliers)</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.cashSpent)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Amount invoiced to date</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.amountInvoicedToDate)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Remaining cost (committed + forecast)</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.remainingCost)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Expected remaining revenue</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.expectedRemainingRevenue)}</td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Next payment</td>
                <td className="py-2 text-right tabular-nums text-slate-200">
                  {pos.nextPaymentAmount ? `${formatAUD(pos.nextPaymentAmount)} - ${pos.nextPaymentLabel}` : "Fully invoiced"}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-300 font-medium">Cash required to finish</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${pos.cashRequiredToFinish > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatAUD(pos.cashRequiredToFinish)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">WIP (cost incurred, not yet billed)</td>
                <td className="py-2 text-right tabular-nums text-slate-200">{formatAUD(pos.wip)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Direct cost breakdown (forecast final cost)">
          <div className="space-y-3">
            {costRows.map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="text-slate-300 tabular-nums">{formatAUD(row.value)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(row.value / maxCost) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Payment schedule">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">%</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Date</th>
                <th className="pb-2 font-medium text-right">Invoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {schedule?.stages.map((stage) => (
                <tr key={stage.id}>
                  <td className="py-2 text-slate-300">{stage.label}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400">{stage.percentOfContract}%</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">
                    {formatAUD(Math.round((stage.percentOfContract / 100) * costing.revisedRevenue))}
                  </td>
                  <td className="py-2 text-right text-slate-400 whitespace-nowrap">{formatDateAU(stage.expectedDate)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={stage.invoiced ? "good" : "neutral"}>{stage.invoiced ? "Invoiced" : "Pending"}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="Invoices" action={<Link href="/receivables" className="text-xs text-brand-400 hover:text-brand-300">All receivables</Link>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Invoice</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Outstanding</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 text-slate-300">{inv.invoiceNumber}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(inv.amount)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(inv.amountOutstanding)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={inv.status === "paid" ? "good" : inv.status === "overdue" ? "bad" : "neutral"}>
                      {inv.status.replace("_", " ")}
                    </StatusPill>
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

        <Card title="Bills" action={<Link href="/payables" className="text-xs text-brand-400 hover:text-brand-300">All payables</Link>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Bill</th>
                <th className="pb-2 font-medium">Supplier</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td className="py-2 text-slate-300">{bill.billNumber}</td>
                  <td className="py-2 text-slate-400">{bill.supplier}</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(bill.amount)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={bill.status === "paid" ? "good" : bill.status === "overdue" ? "bad" : "neutral"}>
                      {bill.status.replace("_", " ")}
                    </StatusPill>
                  </td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">No bills recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {flags.length > 0 && (
        <Card title="Reconciliation flags" action={<Link href="/reconciliation" className="text-xs text-brand-400 hover:text-brand-300">All flags</Link>}>
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.id} className="text-sm text-slate-300 flex items-start gap-2">
                <StatusPill tone={f.severity === "critical" ? "bad" : f.severity === "warning" ? "warn" : "neutral"}>
                  {f.severity}
                </StatusPill>
                <span>{f.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LiveJobDetailView({ detail }: { detail: LiveJobDetail }) {
  const { job, cashPosition, purchaseOrders, invoices, xeroBills, xeroInvoices } = detail;
  const xeroBillsTotal = xeroBills.reduce((s, b) => s + b.amount, 0);
  const xeroInvoicesTotal = xeroInvoices.reduce((s, inv) => s + inv.amount, 0);

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
          <div>Progress {job.progressPercent}%</div>
          {job.expectedCompletion && <div>Target completion {formatDateAU(job.expectedCompletion)}</div>}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
        This job is loaded live from Buildxact (job, purchase order and invoice data). Forecast cost-to-complete,
        margin and cash-required aren&rsquo;t shown - Buildxact doesn&rsquo;t expose a confirmed &ldquo;cost to
        complete&rdquo; field yet, so those numbers would be guesses rather than real figures. They&rsquo;ll appear
        once that gap is closed (a confirmed field, or a manual override).
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Contract value" value={formatAUD(job.contractValue)} sub={`incl. ${formatAUD(job.approvedVariations)} variations`} />
        <StatCard label="Actual cost" value={formatAUD(job.actualCost)} />
        <StatCard label="Committed cost" value={formatAUD(cashPosition.committedCost)} sub={`${purchaseOrders.length} purchase orders`} />
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
                  <td className="py-2 text-slate-400">{po.description}</td>
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
