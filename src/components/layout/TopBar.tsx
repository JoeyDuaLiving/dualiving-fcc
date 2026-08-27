import Link from "next/link";
import { BellRing } from "lucide-react";
import { generateAlerts } from "@/lib/calculations";
import { TODAY } from "@/lib/mock-data";
import { formatDateAU } from "@/lib/format";
import { getLastSyncStatus, relativeTimeFromNow } from "@/lib/sync-status";
import { SyncNowButton } from "./SyncNowButton";

export async function TopBar() {
  const alerts = generateAlerts();
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const [buildxactSync, xeroSync, ghlSync] = await Promise.all([
    getLastSyncStatus("buildxact"),
    getLastSyncStatus("xero"),
    getLastSyncStatus("ghl"),
  ]);

  return (
    <header className="sticky top-0 z-10 h-16 border-b border-slate-800 bg-slate-950/95 backdrop-blur flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <div className="h-7 w-7 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
          DL
        </div>
        <span className="text-sm font-semibold text-white">Dualiving FCC</span>
      </div>

      <div className="hidden lg:flex items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${buildxactSync.status === "success" ? "bg-emerald-400" : buildxactSync.status === "partial" ? "bg-amber-400" : "bg-slate-600"}`} />
          Buildxact <span className="text-slate-600">&middot;</span> {relativeTimeFromNow(buildxactSync.finishedAt)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${xeroSync.status === "success" ? "bg-emerald-400" : xeroSync.status === "partial" ? "bg-amber-400" : "bg-slate-600"}`} />
          Xero <span className="text-slate-600">&middot;</span> {relativeTimeFromNow(xeroSync.finishedAt)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${ghlSync.status === "success" ? "bg-emerald-400" : ghlSync.status === "partial" ? "bg-amber-400" : "bg-slate-600"}`} />
          GHL <span className="text-slate-600">&middot;</span> {relativeTimeFromNow(ghlSync.finishedAt)}
        </div>
        <SyncNowButton />
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden sm:inline text-xs text-slate-400 tabular-nums">{formatDateAU(TODAY)}</span>
        <Link
          href="/alerts"
          className="relative flex items-center justify-center h-9 w-9 rounded-md text-slate-300 hover:bg-slate-900"
        >
          <BellRing size={18} />
          {criticalCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {criticalCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
