"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const SYNC_ENDPOINTS = [
  { source: "Buildxact", url: "/api/sync/buildxact" },
  { source: "Xero", url: "/api/sync/xero" },
  { source: "GHL", url: "/api/sync/ghl" },
];

export function SyncNowButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    setIsSyncing(true);
    setError(null);
    const failures: string[] = [];

    // Sequential, not parallel - each sync hits its own API's rate limits
    // independently, and running them at the same time doesn't help since
    // each is already paced internally to stay under its own limit.
    for (const endpoint of SYNC_ENDPOINTS) {
      try {
        const response = await fetch(endpoint.url, { method: "POST" });
        const body = await response.json();
        if (!response.ok || body.status === "failed") {
          failures.push(`${endpoint.source}: ${body.error ?? "sync failed"}`);
        }
      } catch {
        failures.push(`${endpoint.source}: could not reach sync endpoint`);
      }
    }

    setIsSyncing(false);
    if (failures.length > 0) {
      setError(failures.join(" · "));
    }
    startTransition(() => router.refresh());
  }

  const busy = isSyncing || isPending;

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-1.5 text-slate-300 hover:text-white border border-slate-700 rounded-md px-2.5 py-1 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        {busy ? "Syncing..." : "Sync Now"}
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-md border border-red-500/30 bg-slate-900 px-2.5 py-1.5 text-[11px] text-red-300 shadow-lg z-20">
          {error}
        </div>
      )}
    </div>
  );
}
