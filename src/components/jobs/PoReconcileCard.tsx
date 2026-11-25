"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatAUDSigned, formatDateAU } from "@/lib/format";
import type { PoReconcileCandidateBill, PoReconcileData, PoReconcileRow, PoReconcileSuggestion } from "@/lib/po-reconcile-source";

// Close enough to call a match - Xero and Buildxact round GST differently.
const MATCH_TOLERANCE = 1;

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/po-reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Something went wrong saving that.");
  }
}

function matchPill(row: PoReconcileRow) {
  if (row.fromStock) return <StatusPill tone="good">From stock · J1057</StatusPill>;
  if (row.reconciled) return <StatusPill tone="good">Reconciled</StatusPill>;
  if (row.orderStatus === "Cancelled" && row.bills.length === 0) return <StatusPill tone="neutral">Cancelled</StatusPill>;
  if (row.bills.length === 0) return <StatusPill tone="warn">No Xero bill</StatusPill>;
  if (Math.abs(row.variance) < MATCH_TOLERANCE) return <StatusPill tone="good">Matches</StatusPill>;
  return row.variance < 0 ? <StatusPill tone="warn">Xero short</StatusPill> : <StatusPill tone="bad">Xero over</StatusPill>;
}

function candidateLabel(b: PoReconcileCandidateBill): string {
  return `${b.number} · ${b.party} · ${formatAUD(b.amount)}${b.date ? ` · ${formatDateAU(b.date)}` : ""}`;
}

const TIER_LABEL: Record<PoReconcileSuggestion["tier"], string> = {
  strong: "Strong match",
  likely: "Likely match",
  possible: "Possible match",
};

function tierPill(tier: PoReconcileSuggestion["tier"]) {
  return <StatusPill tone={tier === "strong" ? "good" : tier === "likely" ? "neutral" : "warn"}>{TIER_LABEL[tier]}</StatusPill>;
}

/** The best suggestion per PO when it is strong or likely, with no bill used twice - what "accept all" applies. */
function confidentLinks(rows: PoReconcileRow[]): { poSourceId: string; billSourceId: string }[] {
  const used = new Set<string>();
  const links: { poSourceId: string; billSourceId: string }[] = [];
  for (const row of rows) {
    if (row.reconciled || row.orderStatus === "Cancelled") continue;
    const best = row.suggestions[0];
    if (!best || best.tier === "possible") continue;
    if (best.bills.some((b) => used.has(b.sourceId))) continue;
    for (const b of best.bills) {
      used.add(b.sourceId);
      links.push({ poSourceId: row.poSourceId, billSourceId: b.sourceId });
    }
  }
  return links;
}

function PoRow({ jobSourceId, row, candidates }: { jobSourceId: string; row: PoReconcileRow; candidates: PoReconcileCandidateBill[] }) {
  const router = useRouter();
  const [note, setNote] = useState(row.note ?? "");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving that.");
    } finally {
      setBusy(false);
    }
  }

  const saveStatus = (reconciled: boolean, nextNote: string) =>
    run(() => post({ action: "setStatus", jobSourceId, poSourceId: row.poSourceId, reconciled, note: nextNote }));

  const cancelled = row.orderStatus === "Cancelled";

  return (
    <tr className={`align-top ${cancelled ? "opacity-60" : ""}`}>
      <td className="py-3 pr-3">
        <div className="text-slate-200 whitespace-nowrap">#{row.orderNumber}</div>
        <div className="text-xs text-slate-400 max-w-[14rem]">{row.description || "—"}</div>
        <div className="mt-1">
          <StatusPill tone={row.orderStatus === "Received" || row.orderStatus === "Completed" ? "good" : "neutral"}>{row.orderStatus}</StatusPill>
        </div>
      </td>
      <td className="py-3 pr-3 text-right tabular-nums text-slate-300 whitespace-nowrap">{formatAUD(row.total)}</td>
      <td className="py-3 pr-3 text-right tabular-nums text-slate-400 whitespace-nowrap">{formatAUD(row.invoiced)}</td>
      <td className="py-3 pr-3 min-w-[16rem]">
        {row.bills.length === 0 && row.fromStock && (
          <span className="text-xs text-slate-400">
            No bill expected: drawn from stock bought on J1057 (
            <Link href="/stock" className="text-brand-400 hover:text-brand-300">
              Stock
            </Link>
            )
          </span>
        )}
        {row.bills.length === 0 && !row.fromStock && <span className="text-xs text-slate-500">None matched</span>}
        <ul className="space-y-1">
          {row.bills.map((b) => (
            <li key={b.sourceId} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-slate-300">
                {b.number} <span className="text-slate-500">· {b.party}</span>
                <span className="block text-slate-500">
                  {b.date ? formatDateAU(b.date) : "no date"} · {b.status} · {b.how === "manual" ? "linked by hand" : "matched on PO reference"}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="tabular-nums text-slate-200">{formatAUD(b.amount)}</span>
                {b.how === "manual" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => post({ action: "unlink", billSourceId: b.sourceId }))}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Unlink
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {row.suggestions.length > 0 && !row.reconciled && (
          <ul className="mt-2 space-y-1.5">
            {row.suggestions.map((sg, i) => (
              <li key={i} className="rounded-md border border-slate-700/70 bg-slate-800/40 p-2 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-500">Suggested</span>
                    {tierPill(sg.tier)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        post({
                          action: "linkMany",
                          jobSourceId,
                          links: sg.bills.map((b) => ({ poSourceId: row.poSourceId, billSourceId: b.sourceId })),
                        })
                      )
                    }
                    className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2 py-0.5"
                  >
                    {sg.bills.length > 1 ? "Accept both" : "Accept"}
                  </button>
                </div>
                {sg.bills.map((b) => (
                  <div key={b.sourceId} className="flex justify-between gap-2 text-slate-300">
                    <span>
                      {b.number} <span className="text-slate-500">· {b.party}{b.date ? ` · ${formatDateAU(b.date)}` : ""}{b.scope === "unassigned" ? " · no job code" : ""}</span>
                    </span>
                    <span className="tabular-nums">{formatAUD(b.amount)}</span>
                  </div>
                ))}
                <div className="text-slate-500 mt-0.5">{sg.reason}</div>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 && !cancelled && !(row.fromStock && row.bills.length === 0) && (
          <div className="mt-2 flex items-center gap-1.5">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label={`Xero bill to link to PO ${row.orderNumber}`}
              className="min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-xs text-slate-200"
            >
              <option value="">Link a Xero bill…</option>
              {candidates.some((c) => c.scope === "job") && (
                <optgroup label="On this job, not matched to a PO">
                  {candidates
                    .filter((c) => c.scope === "job")
                    .map((c) => (
                      <option key={c.sourceId} value={c.sourceId}>
                        {candidateLabel(c)}
                      </option>
                    ))}
                </optgroup>
              )}
              {candidates.some((c) => c.scope === "unassigned") && (
                <optgroup label="No job code in Xero (recent)">
                  {candidates
                    .filter((c) => c.scope === "unassigned")
                    .map((c) => (
                      <option key={c.sourceId} value={c.sourceId}>
                        {candidateLabel(c)}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              disabled={!pick || busy}
              onClick={() =>
                run(async () => {
                  await post({ action: "link", jobSourceId, poSourceId: row.poSourceId, billSourceId: pick });
                  setPick("");
                })
              }
              className="text-xs bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2 py-1"
            >
              Link
            </button>
          </div>
        )}
      </td>
      <td className="py-3 pr-3 text-right tabular-nums text-slate-300 whitespace-nowrap">{formatAUD(row.xeroTotal)}</td>
      <td
        className={`py-3 pr-3 text-right tabular-nums whitespace-nowrap ${
          row.bills.length === 0 && !cancelled ? "text-slate-500" : Math.abs(row.variance) < MATCH_TOLERANCE ? "text-emerald-300" : row.variance < 0 ? "text-amber-300" : "text-red-300"
        }`}
      >
        {row.bills.length === 0 && !cancelled ? "—" : formatAUDSigned(row.variance)}
      </td>
      <td className="py-3 min-w-[12rem]">
        <div className="flex items-center gap-2 mb-1.5">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={row.reconciled || row.fromStock}
              disabled={busy || row.fromStock}
              onChange={(e) => saveStatus(e.target.checked, note)}
              className="accent-emerald-500"
            />
            Reconciled
          </label>
          {matchPill(row)}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note.trim() !== (row.note ?? "")) void saveStatus(row.reconciled, note);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Add a note"
          aria-label={`Note for PO ${row.orderNumber}`}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-xs text-slate-200 placeholder:text-slate-600"
        />
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export function PoReconcileCard({ jobSourceId, data }: { jobSourceId: string; data: PoReconcileData }) {
  const router = useRouter();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const live = data.rows.filter((r) => r.orderStatus !== "Cancelled");
  const reconciledCount = live.filter((r) => r.reconciled || r.fromStock).length;
  const noBill = live.filter((r) => r.bills.length === 0 && !r.reconciled && !r.fromStock).length;
  const stockPos = live.filter((r) => r.fromStock);
  const stockTotal = stockPos.reduce((s, r) => s + r.total, 0);
  const unlinkedTotal = data.unlinkedBills.reduce((s, b) => s + b.amount, 0);
  const candidates = [...data.unlinkedBills, ...data.unassignedBills];

  const confident = confidentLinks(data.rows);
  const suggestedPoCount = data.rows.filter((r) => !r.reconciled && r.suggestions.length > 0).length;

  async function acceptAllConfident() {
    const poCount = new Set(confident.map((l) => l.poSourceId)).size;
    if (!window.confirm(`Link ${confident.length} Xero bill${confident.length === 1 ? "" : "s"} to ${poCount} purchase order${poCount === 1 ? "" : "s"}? You can unlink any of them afterwards.`)) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await post({ action: "linkMany", jobSourceId, links: confident });
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Something went wrong saving that.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Open and unreconciled POs first, finished ones last - the to-do list order.
  const rows = [...data.rows].sort((a, b) => {
    const rank = (r: PoReconcileRow) => (r.orderStatus === "Cancelled" ? 2 : r.reconciled || r.fromStock ? 1 : 0);
    return rank(a) - rank(b) || b.orderNumber - a.orderNumber;
  });

  return (
    <Card
      title="PO vs Xero reconciliation"
      className="mb-6"
      action={
        <span className="text-xs text-slate-500">
          {reconciledCount} of {live.length} reconciled
        </span>
      }
    >
      <p className="text-xs text-slate-500 mb-3 max-w-3xl">
        Our own check of each Buildxact PO against the Xero bills that cover it. Bills match automatically when they quote the PO number (PO 2045); anything else can be
        linked by hand. This is a comparison only and doesn&rsquo;t change the WIP, actual or committed cost.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StatusPill tone={noBill > 0 ? "warn" : "good"}>{noBill} PO{noBill === 1 ? "" : "s"} with no Xero bill</StatusPill>
        <StatusPill tone={data.unlinkedBills.length > 0 ? "warn" : "good"}>
          {data.unlinkedBills.length} Xero bill{data.unlinkedBills.length === 1 ? "" : "s"} on this job not matched to a PO
          {data.unlinkedBills.length > 0 ? ` (${formatAUD(unlinkedTotal)})` : ""}
        </StatusPill>
        {stockPos.length > 0 && (
          <StatusPill tone="neutral">
            {stockPos.length} PO{stockPos.length === 1 ? "" : "s"} from stock ({formatAUD(stockTotal)}), reconciled against J1057
          </StatusPill>
        )}
        {suggestedPoCount > 0 && <StatusPill tone="neutral">{suggestedPoCount} PO{suggestedPoCount === 1 ? "" : "s"} with suggested matches</StatusPill>}
        {confident.length > 0 && (
          <button
            type="button"
            disabled={bulkBusy}
            onClick={acceptAllConfident}
            className="ml-auto text-xs bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2.5 py-1"
          >
            {bulkBusy ? "Linking..." : `Accept ${confident.length} strong & likely`}
          </button>
        )}
      </div>
      {bulkError && <p className="text-xs text-red-400 -mt-2 mb-3">{bulkError}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="pb-2 pr-3 font-medium">Purchase order</th>
              <th className="pb-2 pr-3 font-medium text-right">PO total (inc GST)</th>
              <th className="pb-2 pr-3 font-medium text-right">Invoiced in BX (inc GST)</th>
              <th className="pb-2 pr-3 font-medium">Xero bills (inc GST)</th>
              <th className="pb-2 pr-3 font-medium text-right">Xero total (inc GST)</th>
              <th className="pb-2 pr-3 font-medium text-right">Variance</th>
              <th className="pb-2 font-medium">Sign-off</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row) => (
              <PoRow key={row.poSourceId} jobSourceId={jobSourceId} row={row} candidates={candidates} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-500">
                  No purchase orders recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.unlinkedBills.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Xero bills on this job not matched to a PO</h3>
          <ul className="divide-y divide-slate-800/60 text-xs">
            {data.unlinkedBills.map((b) => (
              <li key={b.sourceId} className="flex justify-between gap-3 py-1.5">
                <span className="text-slate-300">
                  {b.number} <span className="text-slate-500">· {b.party}{b.date ? ` · ${formatDateAU(b.date)}` : ""}</span>
                </span>
                <span className="tabular-nums text-slate-200">{formatAUD(b.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
