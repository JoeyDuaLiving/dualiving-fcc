CREATE TABLE "po_bill_links" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"po_source_id" text NOT NULL,
	"bill_source_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "po_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"po_source_id" text NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "po_bill_links" ADD CONSTRAINT "po_bill_links_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_reconciliations" ADD CONSTRAINT "po_reconciliations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "po_bill_links_bill_idx" ON "po_bill_links" USING btree ("bill_source_id");--> statement-breakpoint
CREATE INDEX "po_bill_links_job_idx" ON "po_bill_links" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "po_reconciliations_po_idx" ON "po_reconciliations" USING btree ("po_source_id");--> statement-breakpoint
CREATE INDEX "po_reconciliations_job_idx" ON "po_reconciliations" USING btree ("job_id");