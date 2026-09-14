CREATE TYPE "public"."delivery_channel" AS ENUM('in_app', 'whatsapp', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'simulated');--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"dossier_id" text,
	"idempotency_key" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "urgent_alerts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_delivery_recipient_idx" ON "notification_delivery" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_idempotency_unique" ON "notification_delivery" USING btree ("idempotency_key");