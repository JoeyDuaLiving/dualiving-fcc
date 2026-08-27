CREATE TABLE "manual_payment_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"label" text NOT NULL,
	"percent_of_contract" double precision NOT NULL,
	"trigger_description" text,
	"expected_date" timestamp NOT NULL,
	"invoiced" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_payment_stages" ADD CONSTRAINT "manual_payment_stages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;