CREATE TYPE "public"."upload_status" AS ENUM('UPLOADED', 'PROCESSING', 'EXTRACTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "upload" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" "upload_status" DEFAULT 'UPLOADED' NOT NULL,
	"text" text,
	"page_count" integer,
	"error" text,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_user_id_idx" ON "upload" USING btree ("user_id");