CREATE TABLE "bill_job_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"job_id" text NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_job_allocations" ADD CONSTRAINT "bill_job_allocations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_job_allocations" ADD CONSTRAINT "bill_job_allocations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_job_allocations_bill_job_idx" ON "bill_job_allocations" USING btree ("bill_id","job_id");--> statement-breakpoint
CREATE INDEX "bill_job_allocations_job_idx" ON "bill_job_allocations" USING btree ("job_id");