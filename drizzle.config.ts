import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// dotenv only loads .env by default - point it at .env.local explicitly
// since that's where the Neon/Buildxact credentials actually live.
loadEnv({ path: ".env.local" });

// Migrations must run over Neon's DIRECT (unpooled) connection - the pooled
// one routes through PgBouncer in transaction mode, which doesn't support
// the session-level operations Drizzle Kit needs. See
// .agents/skills/neon-postgres/SKILL.md "Gotchas" for the failure modes this
// avoids (e.g. Prisma's `prepared statement already exists`-style errors).
const directUrl = process.env.DATABASE_URL_UNPOOLED;
if (!directUrl) {
  throw new Error("DATABASE_URL_UNPOOLED is not set - required for schema migrations (see drizzle.config.ts).");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl,
  },
});
