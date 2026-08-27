"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Waves,
  HardHat,
  FileText,
  Receipt,
  Wallet,
  Target,
  SlidersHorizontal,
  GitCompareArrows,
  BellRing,
  Settings as SettingsIcon,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cash-flow", label: "Cash Flow", icon: Waves },
  { href: "/jobs", label: "Jobs / WIP", icon: HardHat },
  { href: "/receivables", label: "Receivables", icon: FileText },
  { href: "/payables", label: "Payables", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/pipeline", label: "Sales Pipeline", icon: Target },
  { href: "/forecast", label: "Forecast", icon: SlidersHorizontal },
  { href: "/reconciliation", label: "Reconciliation", icon: GitCompareArrows },
  { href: "/alerts", label: "Alerts", icon: BellRing },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-800 bg-slate-950">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-slate-800">
        <div className="h-8 w-8 rounded-md bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
          DL
        </div>
        <div>
          <div className="text-sm font-semibold text-white leading-tight">Dualiving</div>
          <div className="text-[11px] text-slate-400 leading-tight">Financial Command Centre</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-brand-500/15 text-brand-300 font-medium"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <Icon size={16} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500">
        Phase 1 &middot; Mock data
        <br />
        Buildxact &middot; Xero &middot; GHL
      </div>
    </aside>
  );
}
