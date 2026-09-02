CREATE TABLE "recurring_liabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"amount" double precision NOT NULL,
	"frequency" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
