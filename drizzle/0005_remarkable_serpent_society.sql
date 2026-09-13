CREATE TABLE "financial_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"fy_start_date" timestamp NOT NULL,
	"revenue_fy_td" double precision NOT NULL,
	"gross_profit_fy_td" double precision NOT NULL,
	"net_profit_fy_td" double precision NOT NULL,
	"as_of" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_summary_source_idx" ON "financial_summary" USING btree ("source","source_id");