CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_name" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_provider_tenant_idx" ON "integration_connections" USING btree ("provider","tenant_id");