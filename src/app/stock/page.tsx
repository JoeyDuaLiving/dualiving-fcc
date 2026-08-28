import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { loadStockPosition } from "@/lib/stock-source";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const stock = await loadStockPosition();
  const isLive = stock.source === "live";

  return (
    <div>
      <PageHeader
        title="Stock"
        description="J1057 is a Buildxact job used to hold bulk-bought consumables and materials that don't cleanly split to a single job's PO at purchase time. When stock is drawn onto a real job, that's done by raising a normal PO directly on the real job with “STOCK” in its description - Buildxact's own sync already adds that cost to the real job. This page just finds those tagged POs and nets them against what's been bought in bulk."
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />

      {!isLive && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {stock.error ?? "Stock position unavailable."}
        </div>
      )}

      {isLive && stock.stockJob && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Purchased in bulk" value={formatAUD(stock.totalPurchased)} sub={`${stock.stockJob.purchaseOrders.length} purchase orders on J1057`} />
            <StatCard label="Drawn down onto jobs" value={formatAUD(stock.totalDrawnDown)} sub={`${stock.drawdowns.length} tagged purchase orders`} />
            <StatCard
              label="Remaining on hand"
              value={formatAUD(stock.remaining)}
              tone={stock.remaining < 0 ? "bad" : "good"}
              sub={stock.remaining < 0 ? "More drawn down than purchased" : "Estimate - not a real inventory count"}
            />
          </div>

          <Card
            title="Drawn down onto jobs"
            action={
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">Purchase orders elsewhere tagged &ldquo;STOCK&rdquo;</span>
                {stock.drawdowns.length > 0 && (
                  <a href="/api/stock/export" className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                    Export CSV
                  </a>
                )}
              </div>
            }
            className="mb-6"
          >
            {stock.drawdowns.length === 0 ? (
              <p className="text-sm text-slate-400">
                No purchase orders on other jobs are tagged &ldquo;STOCK&rdquo; in their description yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                      <th className="pb-2 font-medium">Job</th>
                      <th className="pb-2 font-medium">Order</th>
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                      <th className="pb-2 font-medium text-right">Date</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stock.drawdowns.map((d) => (
                      <tr key={d.poId} className="hover:bg-slate-900/60">
                        <td className="py-2.5">
                          <Link href={`/jobs/${d.jobId}`} className="text-brand-400 hover:text-brand-300 font-medium">
                            {d.jobNumber} - {d.client}
                          </Link>
                        </td>
                        <td className="py-2.5 text-slate-300">#{d.orderNumber}</td>
                        <td className="py-2.5 text-slate-400">{d.description}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(d.amount)}</td>
                        <td className="py-2.5 text-right text-slate-400 whitespace-nowrap">{d.date ? formatDateAU(d.date) : "—"}</td>
                        <td className="py-2.5 text-right text-slate-400">{d.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Purchased in bulk (J1057)" action={<span className="text-xs text-slate-500">{stock.stockJob.purchaseOrders.length}</span>}>
            <div className="overflow-x-auto">
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
                  {stock.stockJob.purchaseOrders.map((po) => (
                    <tr key={po.purchaseOrderId} className="hover:bg-slate-900/60">
                      <td className="py-2.5 text-slate-300">#{po.orderNumber}</td>
                      <td className="py-2.5 text-slate-400">{po.description}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(po.orderTotalIncTax)}</td>
                      <td className="py-2.5 text-right">
                        <StatusPill tone={po.isCompleted ? "good" : "neutral"}>{po.orderStatus}</StatusPill>
                      </td>
                    </tr>
                  ))}
                  {stock.stockJob.purchaseOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-500">No purchase orders recorded on J1057.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
