// Thin CLI wrapper around POST /api/sync/xero - see scripts/sync-buildxact.ts
// for why this can't just import the sync engine directly (server-only).
export {}; // gives this script its own module scope

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  console.log(`Triggering Xero sync via ${baseUrl}/api/sync/xero ...`);
  const response = await fetch(`${baseUrl}/api/sync/xero`, { method: "POST" });
  const body = await response.json();

  if (!response.ok) {
    console.error("Sync failed:", body);
    process.exit(1);
  }

  console.log(body);
  process.exit(body.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(`Could not reach ${baseUrl} - is the dev server running? (npm run dev)`);
  console.error(err);
  process.exit(1);
});
