// Thin CLI wrapper around POST /api/sync/buildxact. The sync engine itself
// can't run via plain `tsx` - it (and everything it imports) is guarded with
// `server-only`, which throws unconditionally outside Next.js's bundler.
// This script just calls the route on an already-running dev/prod server.
export {}; // gives this script its own module scope

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  console.log(`Triggering Buildxact sync via ${baseUrl}/api/sync/buildxact ...`);
  const response = await fetch(`${baseUrl}/api/sync/buildxact`, { method: "POST" });
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
