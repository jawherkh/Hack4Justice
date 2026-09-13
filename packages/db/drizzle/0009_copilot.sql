CREATE TYPE "public"."copilot_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."copilot_message_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TABLE "copilot_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "copilot_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "copilot_message_status" DEFAULT 'completed' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copilot_conversation" ADD CONSTRAINT "copilot_conversation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_conversation" ADD CONSTRAINT "copilot_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_message" ADD CONSTRAINT "copilot_message_conversation_id_copilot_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."copilot_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_conversation_project_id_idx" ON "copilot_conversation" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "copilot_message_conversation_id_idx" ON "copilot_message" USING btree ("conversation_id","created_at");