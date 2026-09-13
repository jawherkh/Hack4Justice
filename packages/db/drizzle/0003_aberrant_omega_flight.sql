CREATE TYPE "public"."requirement_status" AS ENUM('MISSING', 'PROVIDED', 'VALID', 'INVALID', 'WAIVED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "project_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"requirement_id" text NOT NULL,
	"status" "requirement_status" DEFAULT 'MISSING' NOT NULL,
	"value" jsonb,
	"upload_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "service_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "submission_status" "submission_status";--> statement-breakpoint
ALTER TABLE "project_requirement" ADD CONSTRAINT "project_requirement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement" ADD CONSTRAINT "project_requirement_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_requirement_project_id_idx" ON "project_requirement" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_requirement_unique" ON "project_requirement" USING btree ("project_id","requirement_id");--> statement-breakpoint
CREATE INDEX "upload_project_id_idx" ON "upload" USING btree ("project_id");