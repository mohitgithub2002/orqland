CREATE TYPE "public"."delivery_file_purpose" AS ENUM('LICENCE_FRONT', 'LICENCE_BACK', 'VEHICLE_RC', 'PROOF_OF_DELIVERY', 'COD_PROOF', 'SUPPORT_ATTACHMENT');--> statement-breakpoint
CREATE TYPE "public"."delivery_statement_status" AS ENUM('DRAFT', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."disconnect_request_status" AS ENUM('REQUESTED', 'COMPLETED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "delivery_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" "delivery_file_purpose" NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"original_name" varchar(160),
	"attached_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "delivery_files_size_chk" CHECK ("delivery_files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"status" "delivery_statement_status" DEFAULT 'DRAFT' NOT NULL,
	"totals" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"channel" varchar(20) DEFAULT 'PUSH' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_notification_preferences_user_id_type_channel_pk" PRIMARY KEY("user_id","type","channel")
);
--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD COLUMN "licence_front_file_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD COLUMN "licence_back_file_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD COLUMN "vehicle_rc_file_id" uuid;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD COLUMN "disconnect_request_status" "disconnect_request_status";--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD COLUMN "disconnect_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD COLUMN "disconnect_requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD COLUMN "disconnect_requested_by_role" "actor_role";--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD COLUMN "disconnect_request_reason" text;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "pod_file_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD COLUMN "collection_proof_file_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_support_messages" ADD COLUMN "attachment_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_files" ADD CONSTRAINT "delivery_files_owner_user_id_orq_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_statements" ADD CONSTRAINT "delivery_statements_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_statements" ADD CONSTRAINT "delivery_statements_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notification_preferences" ADD CONSTRAINT "delivery_notification_preferences_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_files_owner_idx" ON "delivery_files" USING btree ("owner_user_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_files_unattached_idx" ON "delivery_files" USING btree ("created_at") WHERE "delivery_files"."attached_at" IS NULL AND "delivery_files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_statements_period_uq" ON "delivery_statements" USING btree ("agent_user_id","orqspace_id","period_month");--> statement-breakpoint
CREATE INDEX "delivery_statements_orqspace_idx" ON "delivery_statements" USING btree ("orqspace_id","period_month");--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD CONSTRAINT "delivery_agent_profiles_licence_front_file_id_delivery_files_id_fk" FOREIGN KEY ("licence_front_file_id") REFERENCES "public"."delivery_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD CONSTRAINT "delivery_agent_profiles_licence_back_file_id_delivery_files_id_fk" FOREIGN KEY ("licence_back_file_id") REFERENCES "public"."delivery_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD CONSTRAINT "delivery_agent_profiles_vehicle_rc_file_id_delivery_files_id_fk" FOREIGN KEY ("vehicle_rc_file_id") REFERENCES "public"."delivery_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD CONSTRAINT "orqspace_agent_connections_disconnect_requested_by_user_id_orq_users_id_fk" FOREIGN KEY ("disconnect_requested_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_pod_file_id_delivery_files_id_fk" FOREIGN KEY ("pod_file_id") REFERENCES "public"."delivery_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_collection_proof_file_id_delivery_files_id_fk" FOREIGN KEY ("collection_proof_file_id") REFERENCES "public"."delivery_files"("id") ON DELETE set null ON UPDATE no action;