CREATE TABLE "admin_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_currency" varchar DEFAULT 'EUR' NOT NULL,
	"company_name" text,
	"company_address" text,
	"company_vat_id" text,
	"company_email" text,
	"company_phone" text,
	"company_logo_key" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "api_call_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"original_filename" text NOT NULL,
	"title" text NOT NULL,
	"pdf_storage_key" text NOT NULL,
	"fields_json" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"envelope_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"percent_off" integer NOT NULL,
	"stripe_coupon_id" text,
	"stripe_promo_code_id" text,
	"max_redemptions" integer,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_campaigns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "signer_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"signer_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"spot_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "signer_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "text_field_values" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" varchar NOT NULL,
	"spot_key" text NOT NULL,
	"value" text NOT NULL,
	"field_type" text NOT NULL,
	"signer_role" text,
	"signer_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"key_prefix" varchar NOT NULL,
	"key_hash" varchar NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"invited_by" varchar NOT NULL,
	"token" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "organization_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"seat_count" varchar DEFAULT '1' NOT NULL,
	"sso_enforced" boolean DEFAULT false NOT NULL,
	"sso_provider_settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"provider_user_id" varchar,
	"provider_email" varchar,
	"folder_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_guides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_guides_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_s3_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint_encrypted" text NOT NULL,
	"bucket_encrypted" text NOT NULL,
	"access_key_id_encrypted" text NOT NULL,
	"secret_access_key_encrypted" text NOT NULL,
	"region" varchar DEFAULT 'auto',
	"prefix" varchar,
	"label" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_s3_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_signers" ADD COLUMN "order_index" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "is_template" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "storage_bucket" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "storage_region" text;--> statement-breakpoint
ALTER TABLE "template_fields" ADD COLUMN "input_mode" text DEFAULT 'any';--> statement-breakpoint
ALTER TABLE "template_fields" ADD COLUMN "placeholder" text;--> statement-breakpoint
ALTER TABLE "template_fields" ADD COLUMN "creator_fills" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "template_fields" ADD COLUMN "is_document_date" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "signer_roles" jsonb DEFAULT '["Signer 1"]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "microsoft_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_type" varchar DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "documents_this_month" varchar DEFAULT '0';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_reset_date" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storage_provider" varchar DEFAULT 'fairsign' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "encryption_key_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "encryption_key_salt" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_verification_session_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_verification_status" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_deletion_date" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_reason" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "data_region" varchar DEFAULT 'EU' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allowed_origins" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "api_calls_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "api_quota_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_period_start" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_reason" varchar;--> statement-breakpoint
ALTER TABLE "bulk_items" ADD CONSTRAINT "bulk_items_batch_id_bulk_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."bulk_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_items" ADD CONSTRAINT "bulk_items_envelope_id_documents_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_sessions" ADD CONSTRAINT "signer_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signer_sessions" ADD CONSTRAINT "signer_sessions_signer_id_document_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."document_signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_field_values" ADD CONSTRAINT "text_field_values_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_microsoft_id_unique" UNIQUE("microsoft_id");