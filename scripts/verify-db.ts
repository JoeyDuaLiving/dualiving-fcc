import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
  );
  console.log(`${result.rows.length} tables:`);
  for (const row of result.rows) console.log(" -", row.table_name);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
