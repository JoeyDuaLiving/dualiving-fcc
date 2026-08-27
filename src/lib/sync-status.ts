import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { syncRuns } from "@/db/schema";

export interface LastSyncStatus {
  finishedAt: Date | null;
  status: string | null;
}

/** Never throws - a status widget shouldn't break the page if the database
 * is briefly unreachable. */
export async function getLastSyncStatus(source: string): Promise<LastSyncStatus> {
  try {
    const [run] = await db
      .select({ finishedAt: syncRuns.finishedAt, status: syncRuns.status })
      .from(syncRuns)
      .where(eq(syncRuns.source, source))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);
    return run ? { finishedAt: run.finishedAt, status: run.status } : { finishedAt: null, status: null };
  } catch {
    return { finishedAt: null, status: null };
  }
}

export function relativeTimeFromNow(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
