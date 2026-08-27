import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Application runtime always uses the POOLED connection (DATABASE_URL) -
// migrations use the direct one, but that's drizzle-kit's concern
// (drizzle.config.ts), not this client's.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set - see .env.example for what's needed.");
}

// Reuse the pool across hot-reloads in dev so we don't exhaust Neon's
// connection limit every time Next.js recompiles a route.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
