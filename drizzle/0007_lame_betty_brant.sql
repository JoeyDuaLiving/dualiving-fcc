CREATE TABLE "what_if_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"monthly_amount" double precision NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "what_if_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "what_if_adjustments" ADD CONSTRAINT "what_if_adjustments_scenario_id_what_if_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."what_if_scenarios"("id") ON DELETE cascade ON UPDATE no action;