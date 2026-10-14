CREATE TABLE "job_manual_labour_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_manual_labour_costs" ADD CONSTRAINT "job_manual_labour_costs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_manual_labour_costs_job_idx" ON "job_manual_labour_costs" USING btree ("job_id");