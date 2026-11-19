CREATE TYPE "public"."actor_role" AS ENUM('CUSTOMER', 'WORKSPACE', 'AGENT', 'PLATFORM_ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('RESERVED', 'COMMITTED', 'RELEASED', 'RESTORED');--> statement-breakpoint
CREATE TYPE "public"."order_fulfilment_method" AS ENUM('SELF_DELIVERY', 'AGENT_DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."order_payment_kind" AS ENUM('PAYMENT', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."order_payment_method" AS ENUM('ONLINE', 'COD');--> statement-breakpoint
CREATE TYPE "public"."order_payment_record_status" AS ENUM('INITIATED', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."order_requested_fulfilment" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PLACED', 'ACCEPTED', 'REJECTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED', 'PICKED_UP', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."agent_connection_status" AS ENUM('PENDING', 'ACTIVE', 'DECLINED', 'CANCELLED', 'EXPIRED', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."assignment_strategy" AS ENUM('NEAREST', 'LEAST_LOADED', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."assignment_type" AS ENUM('MANUAL', 'AUTO');--> statement-breakpoint
CREATE TYPE "public"."cod_collection_method" AS ENUM('CASH', 'UPI_TO_SELLER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."cod_status" AS ENUM('PENDING_COLLECTION', 'COLLECTED', 'PARTIALLY_SETTLED', 'SETTLED', 'DISCREPANCY', 'UNDER_REVIEW', 'NOT_COLLECTED');--> statement-breakpoint
CREATE TYPE "public"."delivery_agent_availability" AS ENUM('OFFLINE', 'ONLINE', 'BUSY');--> statement-breakpoint
CREATE TYPE "public"."delivery_agent_status" AS ENUM('PENDING_VERIFICATION', 'MANUAL_REVIEW', 'REJECTED', 'ACTIVE', 'KYC_BLOCKED', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."delivery_mode" AS ENUM('SELF', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."delivery_offer_status" AS ENUM('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."delivery_task_status" AS ENUM('PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN');--> statement-breakpoint
CREATE TYPE "public"."distance_source" AS ENUM('ESTIMATED_ROUTE', 'GPS_TRACE', 'WORKSPACE_APPROVED');--> statement-breakpoint
CREATE TYPE "public"."earning_status" AS ENUM('ESTIMATED', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."kyc_attempt_status" AS ENUM('PENDING', 'PASSED', 'FAILED', 'MISMATCH', 'PROVIDER_UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."kyc_check_status" AS ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'MISMATCH', 'PROVIDER_UNAVAILABLE', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."kyc_check_type" AS ENUM('DRIVING_LICENCE', 'VEHICLE_RC');--> statement-breakpoint
CREATE TYPE "public"."kyc_trigger" AS ENUM('REGISTRATION', 'RE_KYC', 'VEHICLE_CHANGE', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."proof_of_delivery_type" AS ENUM('OTP', 'PHOTO', 'SIGNATURE_NAME', 'ADMIN_OVERRIDE');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_category" AS ENUM('DELIVERY', 'EARNINGS_PAYMENT', 'KYC', 'WORKSPACE', 'TECHNICAL', 'ACCOUNT_SECURITY', 'EMERGENCY');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'WAITING_ON_AGENT', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'THREE_WHEELER', 'CAR', 'VAN', 'OTHER');--> statement-breakpoint
CREATE TABLE "order_inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "inventory_reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"expires_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_inventory_reservations_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "order_inventory_reservations_quantity_chk" CHECK ("order_inventory_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"listing_id" uuid,
	"variant_id" uuid,
	"listing_type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"variant_label" varchar(255),
	"sku" varchar(100),
	"image_url" text,
	"inventory_mode" varchar(20) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_base_price" numeric(12, 2) NOT NULL,
	"gst_percentage" numeric(5, 2) NOT NULL,
	"unit_gst" numeric(12, 2) NOT NULL,
	"unit_total_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_chk" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_line_total_chk" CHECK ("order_items"."line_total" = "order_items"."unit_total_price" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "order_payment_kind" NOT NULL,
	"method" "order_payment_method" NOT NULL,
	"status" "order_payment_record_status" DEFAULT 'INITIATED' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"provider" varchar(40),
	"provider_reference" varchar(120),
	"failure_reason" text,
	"recorded_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payments_amount_chk" CHECK ("order_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(24) NOT NULL,
	"checkout_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"order_status" "order_status" DEFAULT 'PLACED' NOT NULL,
	"payment_method" "order_payment_method" NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'PENDING' NOT NULL,
	"requested_fulfilment" "order_requested_fulfilment" NOT NULL,
	"fulfilment_method" "order_fulfilment_method",
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"subtotal_base" numeric(12, 2) NOT NULL,
	"total_gst" numeric(12, 2) NOT NULL,
	"delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"buyer_snapshot" jsonb NOT NULL,
	"delivery_address_snapshot" jsonb,
	"source_address_id" uuid,
	"customer_note" text,
	"idempotency_key" varchar(64) NOT NULL,
	"rejection_reason" text,
	"cancellation_reason" text,
	"cancelled_by_role" "actor_role",
	"accepted_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_total_consistency_chk" CHECK ("orders"."total_amount" = "orders"."subtotal_base" + "orders"."total_gst" + "orders"."delivery_fee" - "orders"."discount_total"),
	CONSTRAINT "orders_amounts_non_negative_chk" CHECK ("orders"."total_amount" >= 0 AND "orders"."delivery_fee" >= 0),
	CONSTRAINT "orders_delivery_address_chk" CHECK ("orders"."requested_fulfilment" = 'PICKUP' OR "orders"."delivery_address_snapshot" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "delivery_agent_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"agent_status" "delivery_agent_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"availability" "delivery_agent_availability" DEFAULT 'OFFLINE' NOT NULL,
	"max_concurrent_tasks" smallint DEFAULT 1 NOT NULL,
	"licence_number_enc" text NOT NULL,
	"licence_number_last4" varchar(4) NOT NULL,
	"licence_dob_enc" text NOT NULL,
	"licence_status" "kyc_check_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"licence_valid_to" date,
	"licence_verified_at" timestamp with time zone,
	"licence_next_due_at" timestamp with time zone,
	"vehicle_number_enc" text NOT NULL,
	"vehicle_number_masked" varchar(20) NOT NULL,
	"vehicle_category" "vehicle_category" NOT NULL,
	"vehicle_status" "kyc_check_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"vehicle_rc_valid_to" date,
	"vehicle_verified_at" timestamp with time zone,
	"vehicle_next_due_at" timestamp with time zone,
	"licence_fp" char(64) NOT NULL,
	"vehicle_fp" char(64) NOT NULL,
	"combined_fp" char(64) NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"consent_given_at" timestamp with time zone NOT NULL,
	"last_failure_reason" text,
	"suspended_reason" text,
	"suspended_at" timestamp with time zone,
	"suspended_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"last_lat" numeric(9, 6),
	"last_lng" numeric(9, 6),
	"last_location_at" timestamp with time zone,
	"last_availability_change_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_agent_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"check_type" "kyc_check_type" NOT NULL,
	"trigger" "kyc_trigger" NOT NULL,
	"status" "kyc_attempt_status" DEFAULT 'PENDING' NOT NULL,
	"provider" varchar(30) DEFAULT 'SUREPASS' NOT NULL,
	"provider_reference" varchar(120),
	"provider_http_status" integer,
	"mismatch_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"response_summary" jsonb,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orqspace_agent_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"status" "agent_connection_status" DEFAULT 'PENDING' NOT NULL,
	"initiated_by_user_id" uuid NOT NULL,
	"initiated_by_role" "actor_role" DEFAULT 'WORKSPACE' NOT NULL,
	"current_rate_per_km" numeric(10, 2) NOT NULL,
	"invite_message" varchar(280),
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"disconnected_by_user_id" uuid,
	"disconnect_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orqspace_agent_connections_rate_chk" CHECK ("orqspace_agent_connections"."current_rate_per_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "orqspace_agent_rate_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"rate_per_km" numeric(10, 2) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orqspace_agent_rate_history_rate_chk" CHECK ("orqspace_agent_rate_history"."rate_per_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "orqspace_delivery_settings" (
	"orqspace_id" uuid PRIMARY KEY NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"pickup_address" jsonb,
	"pickup_lat" numeric(9, 6),
	"pickup_lng" numeric(9, 6),
	"auto_assign_enabled" boolean DEFAULT false NOT NULL,
	"assignment_strategy" "assignment_strategy" DEFAULT 'NEAREST' NOT NULL,
	"offer_timeout_seconds" integer DEFAULT 90 NOT NULL,
	"max_offer_attempts" integer DEFAULT 5 NOT NULL,
	"max_pickup_radius_km" numeric(6, 2) DEFAULT '15' NOT NULL,
	"road_distance_factor" numeric(4, 2) DEFAULT '1.30' NOT NULL,
	"require_delivery_otp" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orqspace_delivery_settings_timeout_chk" CHECK ("orqspace_delivery_settings"."offer_timeout_seconds" BETWEEN 15 AND 900),
	CONSTRAINT "orqspace_delivery_settings_attempts_chk" CHECK ("orqspace_delivery_settings"."max_offer_attempts" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "delivery_location_pings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"task_id" uuid,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"accuracy_m" real,
	"speed_mps" real,
	"heading" real,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"assignment_type" "assignment_type" NOT NULL,
	"rank_score" numeric(10, 4),
	"distance_to_pickup_km" numeric(8, 2),
	"rate_per_km_offered" numeric(10, 2) NOT NULL,
	"status" "delivery_offer_status" DEFAULT 'OFFERED' NOT NULL,
	"offered_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"decline_reason" text
);
--> statement-breakpoint
CREATE TABLE "delivery_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"from_status" "delivery_task_status",
	"to_status" "delivery_task_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"is_override" boolean DEFAULT false NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_number" varchar(24) NOT NULL,
	"order_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"mode" "delivery_mode" NOT NULL,
	"assignment_type" "assignment_type",
	"status" "delivery_task_status" DEFAULT 'PENDING_ASSIGNMENT' NOT NULL,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"attention_reason" varchar(160),
	"agent_user_id" uuid,
	"connection_id" uuid,
	"rate_per_km_snapshot" numeric(10, 2),
	"self_staff_name" varchar(150),
	"self_staff_phone" varchar(20),
	"pickup_snapshot" jsonb,
	"dropoff_snapshot" jsonb NOT NULL,
	"pickup_lat" numeric(9, 6),
	"pickup_lng" numeric(9, 6),
	"dropoff_lat" numeric(9, 6),
	"dropoff_lng" numeric(9, 6),
	"estimated_distance_km" numeric(8, 2),
	"measured_distance_km" numeric(8, 2),
	"cod_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"delivery_otp_hash" char(64),
	"pod_type" "proof_of_delivery_type",
	"pod_photo_url" text,
	"pod_recipient_name" varchar(150),
	"accepted_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"failure_reason" text,
	"cancellation_reason" text,
	"attempt_no" smallint DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_tasks_task_number_unique" UNIQUE("task_number")
);
--> statement-breakpoint
CREATE TABLE "delivery_cod_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"agent_user_id" uuid,
	"expected_amount" numeric(12, 2) NOT NULL,
	"collected_amount" numeric(12, 2),
	"collection_method" "cod_collection_method",
	"collection_proof_url" text,
	"collected_at" timestamp with time zone,
	"settled_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "cod_status" DEFAULT 'PENDING_COLLECTION' NOT NULL,
	"discrepancy_reason" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_cod_records_task_id_unique" UNIQUE("task_id"),
	CONSTRAINT "delivery_cod_records_amounts_chk" CHECK ("delivery_cod_records"."expected_amount" >= 0 AND "delivery_cod_records"."settled_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_cod_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_record_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "cod_collection_method" NOT NULL,
	"recorded_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_cod_settlements_amount_chk" CHECK ("delivery_cod_settlements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_earning_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"earning_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"distance_source" "distance_source" NOT NULL,
	"measured_distance_km" numeric(8, 2),
	"approved_billable_km" numeric(8, 2) NOT NULL,
	"rate_per_km" numeric(10, 2) NOT NULL,
	"base_amount" numeric(12, 2) NOT NULL,
	"adjustment_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"final_amount" numeric(12, 2) NOT NULL,
	"status" "earning_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"period_month" date NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payout_reference" varchar(120),
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_earnings_task_id_unique" UNIQUE("task_id"),
	CONSTRAINT "delivery_earnings_final_chk" CHECK ("delivery_earnings"."final_amount" = "delivery_earnings"."base_amount" + "delivery_earnings"."adjustment_total"),
	CONSTRAINT "delivery_earnings_km_chk" CHECK ("delivery_earnings"."approved_billable_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"action" varchar(80) NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_role" "actor_role" NOT NULL,
	"body" text NOT NULL,
	"attachment_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" varchar(24) NOT NULL,
	"raised_by_user_id" uuid NOT NULL,
	"category" "support_ticket_category" NOT NULL,
	"subject" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"priority" "support_ticket_priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "support_ticket_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_team" varchar(60),
	"assigned_to_user_id" uuid,
	"related_task_id" uuid,
	"related_earning_id" uuid,
	"related_connection_id" uuid,
	"related_period_month" varchar(7),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
ALTER TABLE "order_inventory_reservations" ADD CONSTRAINT "order_inventory_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inventory_reservations" ADD CONSTRAINT "order_inventory_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_inventory_reservations" ADD CONSTRAINT "order_inventory_reservations_variant_id_orq_listing_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."orq_listing_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_orq_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."orq_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_orq_listing_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."orq_listing_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_recorded_by_user_id_orq_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_orq_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_orq_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."orq_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_address_id_orq_user_addresses_id_fk" FOREIGN KEY ("source_address_id") REFERENCES "public"."orq_user_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD CONSTRAINT "delivery_agent_profiles_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_profiles" ADD CONSTRAINT "delivery_agent_profiles_suspended_by_user_id_orq_users_id_fk" FOREIGN KEY ("suspended_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_verifications" ADD CONSTRAINT "delivery_agent_verifications_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_verifications" ADD CONSTRAINT "delivery_agent_verifications_requested_by_user_id_orq_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD CONSTRAINT "orqspace_agent_connections_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD CONSTRAINT "orqspace_agent_connections_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD CONSTRAINT "orqspace_agent_connections_initiated_by_user_id_orq_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_connections" ADD CONSTRAINT "orqspace_agent_connections_disconnected_by_user_id_orq_users_id_fk" FOREIGN KEY ("disconnected_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_rate_history" ADD CONSTRAINT "orqspace_agent_rate_history_connection_id_orqspace_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."orqspace_agent_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_agent_rate_history" ADD CONSTRAINT "orqspace_agent_rate_history_set_by_user_id_orq_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspace_delivery_settings" ADD CONSTRAINT "orqspace_delivery_settings_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_pings" ADD CONSTRAINT "delivery_location_pings_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_pings" ADD CONSTRAINT "delivery_location_pings_task_id_delivery_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_task_id_delivery_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_connection_id_orqspace_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."orqspace_agent_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_task_id_delivery_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_actor_user_id_orq_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_connection_id_orqspace_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."orqspace_agent_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_task_id_delivery_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_records" ADD CONSTRAINT "delivery_cod_records_resolved_by_user_id_orq_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_settlements" ADD CONSTRAINT "delivery_cod_settlements_cod_record_id_delivery_cod_records_id_fk" FOREIGN KEY ("cod_record_id") REFERENCES "public"."delivery_cod_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_cod_settlements" ADD CONSTRAINT "delivery_cod_settlements_recorded_by_user_id_orq_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earning_adjustments" ADD CONSTRAINT "delivery_earning_adjustments_earning_id_delivery_earnings_id_fk" FOREIGN KEY ("earning_id") REFERENCES "public"."delivery_earnings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earning_adjustments" ADD CONSTRAINT "delivery_earning_adjustments_created_by_user_id_orq_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_task_id_delivery_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_connection_id_orqspace_agent_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."orqspace_agent_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_earnings" ADD CONSTRAINT "delivery_earnings_approved_by_user_id_orq_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_audit_logs" ADD CONSTRAINT "delivery_audit_logs_actor_user_id_orq_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notifications" ADD CONSTRAINT "delivery_notifications_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_messages" ADD CONSTRAINT "delivery_support_messages_ticket_id_delivery_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."delivery_support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_messages" ADD CONSTRAINT "delivery_support_messages_author_user_id_orq_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_tickets" ADD CONSTRAINT "delivery_support_tickets_raised_by_user_id_orq_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."orq_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_tickets" ADD CONSTRAINT "delivery_support_tickets_assigned_to_user_id_orq_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."orq_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_tickets" ADD CONSTRAINT "delivery_support_tickets_related_task_id_delivery_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."delivery_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_tickets" ADD CONSTRAINT "delivery_support_tickets_related_earning_id_delivery_earnings_id_fk" FOREIGN KEY ("related_earning_id") REFERENCES "public"."delivery_earnings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_support_tickets" ADD CONSTRAINT "delivery_support_tickets_related_connection_id_orqspace_agent_connections_id_fk" FOREIGN KEY ("related_connection_id") REFERENCES "public"."orqspace_agent_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_inventory_reservations_order_idx" ON "order_inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_inventory_reservations_expiry_idx" ON "order_inventory_reservations" USING btree ("expires_at") WHERE "order_inventory_reservations"."status" = 'RESERVED';--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_provider_ref_uq" ON "order_payments" USING btree ("provider","provider_reference") WHERE "order_payments"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_idempotency_uq" ON "orders" USING btree ("customer_id","idempotency_key","orqspace_id");--> statement-breakpoint
CREATE INDEX "orders_orqspace_status_created_idx" ON "orders" USING btree ("orqspace_id","order_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_customer_created_idx" ON "orders" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_checkout_idx" ON "orders" USING btree ("checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_agent_profiles_licence_fp_uq" ON "delivery_agent_profiles" USING btree ("licence_fp") WHERE "delivery_agent_profiles"."agent_status" <> 'REJECTED';--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_agent_profiles_combined_fp_uq" ON "delivery_agent_profiles" USING btree ("combined_fp") WHERE "delivery_agent_profiles"."agent_status" <> 'REJECTED';--> statement-breakpoint
CREATE INDEX "delivery_agent_profiles_vehicle_fp_idx" ON "delivery_agent_profiles" USING btree ("vehicle_fp");--> statement-breakpoint
CREATE INDEX "delivery_agent_profiles_status_idx" ON "delivery_agent_profiles" USING btree ("agent_status","availability");--> statement-breakpoint
CREATE INDEX "delivery_agent_profiles_licence_due_idx" ON "delivery_agent_profiles" USING btree ("licence_next_due_at");--> statement-breakpoint
CREATE INDEX "delivery_agent_profiles_vehicle_due_idx" ON "delivery_agent_profiles" USING btree ("vehicle_next_due_at");--> statement-breakpoint
CREATE INDEX "delivery_agent_verifications_user_idx" ON "delivery_agent_verifications" USING btree ("user_id","check_type","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "orqspace_agent_connections_live_uq" ON "orqspace_agent_connections" USING btree ("orqspace_id","agent_user_id") WHERE "orqspace_agent_connections"."status" IN ('PENDING', 'ACTIVE');--> statement-breakpoint
CREATE INDEX "orqspace_agent_connections_orqspace_idx" ON "orqspace_agent_connections" USING btree ("orqspace_id","status");--> statement-breakpoint
CREATE INDEX "orqspace_agent_connections_agent_idx" ON "orqspace_agent_connections" USING btree ("agent_user_id","status");--> statement-breakpoint
CREATE INDEX "orqspace_agent_rate_history_connection_idx" ON "orqspace_agent_rate_history" USING btree ("connection_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_location_pings_agent_idx" ON "delivery_location_pings" USING btree ("agent_user_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_location_pings_task_idx" ON "delivery_location_pings" USING btree ("task_id","recorded_at");--> statement-breakpoint
CREATE INDEX "delivery_location_pings_received_idx" ON "delivery_location_pings" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_offers_one_open_per_task_uq" ON "delivery_offers" USING btree ("task_id") WHERE "delivery_offers"."status" = 'OFFERED';--> statement-breakpoint
CREATE INDEX "delivery_offers_agent_status_idx" ON "delivery_offers" USING btree ("agent_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_offers_open_expiry_idx" ON "delivery_offers" USING btree ("expires_at") WHERE "delivery_offers"."status" = 'OFFERED';--> statement-breakpoint
CREATE INDEX "delivery_status_events_task_idx" ON "delivery_status_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_tasks_one_active_per_order_uq" ON "delivery_tasks" USING btree ("order_id") WHERE "delivery_tasks"."status" NOT IN ('DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN');--> statement-breakpoint
CREATE INDEX "delivery_tasks_orqspace_status_idx" ON "delivery_tasks" USING btree ("orqspace_id","status");--> statement-breakpoint
CREATE INDEX "delivery_tasks_agent_status_idx" ON "delivery_tasks" USING btree ("agent_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_tasks_order_idx" ON "delivery_tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_cod_records_orqspace_status_idx" ON "delivery_cod_records" USING btree ("orqspace_id","status");--> statement-breakpoint
CREATE INDEX "delivery_cod_records_agent_idx" ON "delivery_cod_records" USING btree ("agent_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_cod_settlements_record_idx" ON "delivery_cod_settlements" USING btree ("cod_record_id");--> statement-breakpoint
CREATE INDEX "delivery_earning_adjustments_earning_idx" ON "delivery_earning_adjustments" USING btree ("earning_id");--> statement-breakpoint
CREATE INDEX "delivery_earnings_agent_period_idx" ON "delivery_earnings" USING btree ("agent_user_id","period_month");--> statement-breakpoint
CREATE INDEX "delivery_earnings_orqspace_period_idx" ON "delivery_earnings" USING btree ("orqspace_id","period_month");--> statement-breakpoint
CREATE INDEX "delivery_audit_logs_entity_idx" ON "delivery_audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_notifications_user_idx" ON "delivery_notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_notifications_unread_idx" ON "delivery_notifications" USING btree ("user_id") WHERE "delivery_notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "delivery_support_messages_ticket_idx" ON "delivery_support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_support_tickets_user_idx" ON "delivery_support_tickets" USING btree ("raised_by_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_support_tickets_queue_idx" ON "delivery_support_tickets" USING btree ("status","priority","created_at");