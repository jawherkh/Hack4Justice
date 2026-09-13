CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"service_id" text NOT NULL,
	"status" "submission_status" DEFAULT 'SUBMITTED' NOT NULL,
	"receipt" text,
	"note" text,
	"snapshot" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_project_id_idx" ON "submission" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_reference_unique" ON "submission" USING btree ("reference");