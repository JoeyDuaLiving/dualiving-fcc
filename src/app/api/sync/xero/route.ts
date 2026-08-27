import { syncXero } from "@/sync/xero";

export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncXero();
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown sync error" }, { status: 500 });
  }
}
