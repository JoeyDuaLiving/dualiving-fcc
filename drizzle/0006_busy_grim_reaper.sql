CREATE TABLE "manual_bank_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"balance" double precision NOT NULL,
	"as_of" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
