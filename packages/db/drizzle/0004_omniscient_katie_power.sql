CREATE TYPE "public"."notification_domain" AS ENUM('project', 'procedure', 'upload');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('PROJECT_CREATED', 'PROCEDURE_STARTED', 'PROCEDURE_READY', 'SUBMISSION_UPDATED', 'UPLOAD_EXTRACTED', 'UPLOAD_FAILED');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"domain" "notification_domain" NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_id_created_at_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_idempotency_unique" ON "notification" USING btree ("user_id","idempotency_key");