CREATE TABLE "quoted_job_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"quoted_job_id" text NOT NULL,
	"label" text NOT NULL,
	"percent_of_contract" double precision NOT NULL,
	"trigger_description" text,
	"expected_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quoted_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"client" text NOT NULL,
	"estimated_contract_value" double precision NOT NULL,
	"expected_start_date" timestamp NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quoted_job_stages" ADD CONSTRAINT "quoted_job_stages_quoted_job_id_quoted_jobs_id_fk" FOREIGN KEY ("quoted_job_id") REFERENCES "public"."quoted_jobs"("id") ON DELETE cascade ON UPDATE no action;