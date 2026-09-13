CREATE TYPE "public"."account_type" AS ENUM('business', 'professional');--> statement-breakpoint
CREATE TYPE "public"."company_stage" AS ENUM('idea', 'creating', 'registered', 'closing');--> statement-breakpoint
CREATE TYPE "public"."governorate" AS ENUM('ariana', 'beja', 'ben_arous', 'bizerte', 'gabes', 'gafsa', 'jendouba', 'kairouan', 'kasserine', 'kebili', 'kef', 'mahdia', 'manouba', 'medenine', 'monastir', 'nabeul', 'sfax', 'sidi_bouzid', 'siliana', 'sousse', 'tataouine', 'tozeur', 'tunis', 'zaghouan');--> statement-breakpoint
CREATE TYPE "public"."legal_form" AS ENUM('ei', 'suarl', 'sarl', 'sa', 'sas', 'other');--> statement-breakpoint
CREATE TYPE "public"."preferred_locale" AS ENUM('fr', 'en', 'ar');--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"preferred_locale" "preferred_locale" NOT NULL,
	"governorate" "governorate",
	"phone" text,
	"company_name" text,
	"legal_form" "legal_form",
	"company_stage" "company_stage",
	"tax_id" text,
	"accepted_terms_at" timestamp with time zone NOT NULL,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;