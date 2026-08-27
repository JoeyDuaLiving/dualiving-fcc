import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { manualAdjustments, settings } from "@/lib/mock-data";
import { checkBuildxactConnection } from "@/integrations/buildxact/status";
import { checkXeroConnection } from "@/integrations/xero/status";
import { checkGhlConnection } from "@/integrations/ghl/status";

const MOCK_INTEGRATIONS = [
  { name: "Google Sheets", scope: "Manual forecasts and assumptions not available via API", frequency: "Manual import", status: "Not configured" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ xero_connected?: string; xero_error?: string }>;
}) {
  const { xero_connected: xeroConnectedBanner, xero_error: xeroErrorBanner } = await searchParams;

  const buildxactStatus = await checkBuildxactConnection();
  const buildxactStatusLabel =
    buildxactStatus.state === "connected" ? "Connected (live)" : buildxactStatus.state === "error" ? "Connection error" : "Not connected";
  const buildxactTone = buildxactStatus.state === "connected" ? "good" : buildxactStatus.state === "error" ? "bad" : "neutral";

  const xeroStatus = await checkXeroConnection();
  const xeroStatusLabel =
    xeroStatus.state === "connected"
      ? "Connected (live)"
      : xeroStatus.state === "error"
        ? "Connection error"
        : xeroStatus.state === "not_connected"
          ? "Not connected"
          : "Not configured";
  const xeroTone = xeroStatus.state === "connected" ? "good" : xeroStatus.state === "error" ? "bad" : "neutral";

  const ghlStatus = await checkGhlConnection();
  const ghlStatusLabel = ghlStatus.state === "connected" ? "Connected (live)" : ghlStatus.state === "error" ? "Connection error" : "Not configured";
  const ghlTone = ghlStatus.state === "connected" ? "good" : ghlStatus.state === "error" ? "bad" : "neutral";

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Integrations, job mappings and management assumptions. Phase 1 runs on mock data - connecting live integrations and making these assumptions editable is Phase 2+ of the build."
      />

      {xeroConnectedBanner && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Connected to Xero organisation: <span className="text-emerald-200">{xeroConnectedBanner}</span>
        </div>
      )}
      {xeroErrorBanner && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Xero connection failed: <span className="text-red-200">{xeroErrorBanner}</span>
        </div>
      )}

      <Card title="Management assumptions" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-400">Minimum cash buffer</div>
            <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(settings.minimumCashBuffer)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Default deposit %</div>
            <div className="text-lg font-semibold text-white tabular-nums mt-1">{settings.defaultDepositPercent}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Gross margin target</div>
            <div className="text-lg font-semibold text-white tabular-nums mt-1">{settings.marginTargetPercent}%</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Active scenario</div>
            <div className="text-lg font-semibold text-white capitalize mt-1">{settings.activeScenario}</div>
          </div>
        </div>
      </Card>

      <Card title="Integrations" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">System</th>
                <th className="pb-2 font-medium">Data scope</th>
                <th className="pb-2 font-medium">Sync frequency</th>
                <th className="pb-2 font-medium text-right">Status</th>
                <th className="pb-2 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="py-2.5 text-slate-200 font-medium">Buildxact</td>
                <td className="py-2.5 text-slate-400">Jobs, estimates, purchase orders, invoices and tenant data - confirmed live against the real API.</td>
                <td className="py-2.5 text-slate-400">Every 30 minutes</td>
                <td className="py-2.5 text-right">
                  <StatusPill tone={buildxactTone}>{buildxactStatusLabel}</StatusPill>
                </td>
                <td className="py-2.5 text-right"></td>
              </tr>
              <tr>
                <td className="py-2.5 text-slate-200 font-medium">Xero</td>
                <td className="py-2.5 text-slate-400">Bank accounts, invoices, bills, payments, contacts, chart of accounts, P&amp;L / Balance Sheet.</td>
                <td className="py-2.5 text-slate-400">Not yet scheduled</td>
                <td className="py-2.5 text-right">
                  <StatusPill tone={xeroTone}>{xeroStatusLabel}</StatusPill>
                </td>
                <td className="py-2.5 text-right">
                  {xeroStatus.state !== "not_configured" && (
                    <Link
                      href="/api/integrations/xero/connect"
                      className="text-xs text-blue-400 hover:text-blue-300 border border-slate-700 rounded-md px-2 py-1"
                    >
                      {xeroStatus.state === "connected" ? "Reconnect" : "Connect"}
                    </Link>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 text-slate-200 font-medium">GoHighLevel</td>
                <td className="py-2.5 text-slate-400">Opportunities, pipelines and pipeline stages (sales pipeline forecast).</td>
                <td className="py-2.5 text-slate-400">Not yet scheduled</td>
                <td className="py-2.5 text-right">
                  <StatusPill tone={ghlTone}>{ghlStatusLabel}</StatusPill>
                </td>
                <td className="py-2.5 text-right"></td>
              </tr>
              {MOCK_INTEGRATIONS.map((i) => (
                <tr key={i.name}>
                  <td className="py-2.5 text-slate-200 font-medium">{i.name}</td>
                  <td className="py-2.5 text-slate-400">{i.scope}</td>
                  <td className="py-2.5 text-slate-400">{i.frequency}</td>
                  <td className="py-2.5 text-right">
                    <StatusPill tone={i.status.startsWith("Connected") ? "good" : "neutral"}>{i.status}</StatusPill>
                  </td>
                  <td className="py-2.5 text-right"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Buildxact, Xero and GHL status above are real, live checks against the actual APIs - no data is faked.
          Google Sheets is still a mock placeholder pending manual-import support. Xero uses a real OAuth 2.0 consent
          flow (the Connect button redirects to Xero&rsquo;s own login/authorize screen); Buildxact and GHL use a
          static API token instead. No credential is ever exposed to the browser - tokens are exchanged and stored
          server-side only.
        </p>
        {buildxactStatus.state !== "connected" && (
          <p className="text-xs mt-2 text-slate-500">
            Buildxact detail: <span className="text-slate-400">{buildxactStatus.message}</span>
          </p>
        )}
        {xeroStatus.state !== "connected" && (
          <p className="text-xs mt-2 text-slate-500">
            Xero detail: <span className="text-slate-400">{xeroStatus.message}</span>
          </p>
        )}
        {ghlStatus.state !== "connected" && (
          <p className="text-xs mt-2 text-slate-500">
            GHL detail: <span className="text-slate-400">{ghlStatus.message}</span>
          </p>
        )}
      </Card>

      <Card title="Manual overrides / audit trail">
        {manualAdjustments.length === 0 ? (
          <p className="text-sm text-slate-400">No manual overrides recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {manualAdjustments.map((adj) => (
              <li key={adj.id} className="py-3 first:pt-0 text-sm">
                <div className="text-slate-200 font-medium">{adj.field}{adj.jobId ? ` - ${adj.jobId}` : ""}</div>
                <div className="text-slate-400 mt-0.5">
                  {adj.originalValue} <span className="text-slate-600">&rarr;</span> {adj.newValue}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {adj.reason} &middot; {adj.user} &middot; {formatDateAU(adj.date)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
