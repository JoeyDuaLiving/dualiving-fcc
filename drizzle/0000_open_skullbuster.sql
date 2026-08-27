CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"user_id" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"balance" double precision NOT NULL,
	"as_of" timestamp NOT NULL,
	"raw" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"supplier_id" text,
	"job_id" text,
	"bill_number" text NOT NULL,
	"category" text,
	"amount" double precision NOT NULL,
	"amount_paid" double precision DEFAULT 0 NOT NULL,
	"amount_outstanding" double precision NOT NULL,
	"bill_date" timestamp,
	"due_date" timestamp,
	"status" text NOT NULL,
	"raw" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"abn" text,
	"billing_addr" text,
	"billing_city" text,
	"billing_state" text,
	"billing_post" text,
	"phone" text,
	"website" text,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"customer_id" text,
	"job_id" text,
	"invoice_number" text NOT NULL,
	"amount" double precision NOT NULL,
	"amount_paid" double precision DEFAULT 0 NOT NULL,
	"amount_outstanding" double precision NOT NULL,
	"issue_date" timestamp,
	"due_date" timestamp,
	"status" text NOT NULL,
	"raw" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"description" text NOT NULL,
	"total_inc_tax" double precision NOT NULL,
	"status" text NOT NULL,
	"due_date" timestamp,
	"invoice_date" timestamp,
	"invoice_number" integer,
	"payment_order" integer,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"buildxact_job_number" text,
	"xero_tracking_category_id" text,
	"xero_contact_id" text,
	"ghl_opportunity_id" text,
	"match_confidence" text DEFAULT 'unmatched' NOT NULL,
	CONSTRAINT "job_mappings_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"job_number" text NOT NULL,
	"client" text NOT NULL,
	"product" text NOT NULL,
	"status" text NOT NULL,
	"location" text,
	"contract_value" double precision NOT NULL,
	"approved_variations" double precision DEFAULT 0 NOT NULL,
	"original_budget_revenue" double precision NOT NULL,
	"original_budget_cost" double precision NOT NULL,
	"actual_cost" double precision DEFAULT 0 NOT NULL,
	"committed_cost" double precision DEFAULT 0 NOT NULL,
	"remaining_forecast_cost" double precision DEFAULT 0 NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp,
	"expected_completion" timestamp,
	"contracted_completion" timestamp,
	"margin_target_percent" double precision DEFAULT 25 NOT NULL,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"field" text NOT NULL,
	"job_id" text,
	"forecast_item_ref" text,
	"original_value" text NOT NULL,
	"new_value" text NOT NULL,
	"reason" text NOT NULL,
	"user_id" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"category" text NOT NULL,
	"classification" text NOT NULL,
	"description" text,
	"amount" double precision NOT NULL,
	"date" timestamp NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "pipeline_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"stage" text NOT NULL,
	"value" double precision NOT NULL,
	"probability_percent" double precision NOT NULL,
	"expected_close_date" timestamp,
	"salesperson" text,
	"lead_source" text,
	"product" text,
	"job_id" text,
	"raw" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"order_number" integer NOT NULL,
	"description" text,
	"order_status" text NOT NULL,
	"order_total_inc_tax" double precision NOT NULL,
	"invoice_total_inc_tax" double precision DEFAULT 0 NOT NULL,
	"order_date" timestamp,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"buildxact_value" double precision,
	"xero_value" double precision,
	"variance" double precision,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"sync_run_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"records_imported" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_invoice_payments" ADD CONSTRAINT "job_invoice_payments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_mappings" ADD CONSTRAINT "job_mappings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_adjustments" ADD CONSTRAINT "manual_adjustments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_adjustments" ADD CONSTRAINT "manual_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_opportunities" ADD CONSTRAINT "pipeline_opportunities_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_flags" ADD CONSTRAINT "reconciliation_flags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_source_idx" ON "bank_accounts" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_source_idx" ON "bills" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_source_idx" ON "companies" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_source_idx" ON "customers" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_source_idx" ON "invoices" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_invoice_payments_source_idx" ON "job_invoice_payments" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_idx" ON "jobs" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operating_expenses_source_idx" ON "operating_expenses" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_opportunities_source_idx" ON "pipeline_opportunities" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_source_idx" ON "purchase_orders" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_source_idx" ON "suppliers" USING btree ("source","source_id");