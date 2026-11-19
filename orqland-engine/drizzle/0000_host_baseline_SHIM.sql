CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED', 'BLOCKED', 'PENDING_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."address_type" AS ENUM('HOME', 'WORK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode" AS ENUM('LIMITED', 'NO_LIMIT', 'TIME_BASED');--> statement-breakpoint
CREATE TYPE "public"."listing_type" AS ENUM('PRODUCT', 'SERVICE', 'RENTAL', 'STAY', 'EXPERIENCE');--> statement-breakpoint
CREATE TYPE "public"."orqspace_type" AS ENUM('AIR', 'STREET');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('WEB_USER', 'DELIVERY_AGENT', 'ORG_ADMIN', 'PLATFORM_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT');--> statement-breakpoint
CREATE TABLE "orq_user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_name" varchar(150),
	"recipient_phone" varchar(20),
	"door_no" varchar(50),
	"street" varchar(255),
	"landmark" varchar(255),
	"city" varchar(100),
	"district" varchar(100),
	"state" varchar(100),
	"country" varchar(100),
	"pincode" varchar(12),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"is_primary" boolean DEFAULT false NOT NULL,
	"address_type" "address_type" DEFAULT 'HOME' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orq_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"orq_user_id" varchar(14) NOT NULL,
	"orq_username" varchar(30),
	"fname" varchar(100),
	"lname" varchar(100),
	"display_name" varchar(150),
	"email" varchar(255),
	"phone" varchar(20),
	"avatar" text,
	"bio" text,
	"roles" "user_role"[] DEFAULT '{"WEB_USER"}' NOT NULL,
	"account_status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orq_users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "orq_users_orq_user_id_unique" UNIQUE("orq_user_id"),
	CONSTRAINT "orq_users_orq_username_unique" UNIQUE("orq_username"),
	CONSTRAINT "orq_users_email_unique" UNIQUE("email"),
	CONSTRAINT "orq_users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "orqspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orqspace_id" varchar(32) NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"type" "orqspace_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orqspaces_orqspace_id_unique" UNIQUE("orqspace_id")
);
--> statement-breakpoint
CREATE TABLE "orq_listing_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"type" varchar(100),
	"sku" varchar(100),
	"cost" numeric(12, 2),
	"base_price" numeric(12, 2) NOT NULL,
	"gst_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"inventory_mode" "inventory_mode" DEFAULT 'NO_LIMIT' NOT NULL,
	"total_capacity" integer,
	"remaining_quantity" integer,
	"variant_status" "variant_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orq_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"listing_type" "listing_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"base_price" numeric(12, 2) NOT NULL,
	"gst_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"has_variants" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"status" varchar(30) DEFAULT 'PUBLISHED' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_agent_assignments" (
	"delivery_agent_user_id" uuid NOT NULL,
	"orqspace_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "delivery_agent_assignments_delivery_agent_user_id_orqspace_id_pk" PRIMARY KEY("delivery_agent_user_id","orqspace_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_agents" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"vehicle_number" varchar(20),
	"driving_license_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orq_user_addresses" ADD CONSTRAINT "orq_user_addresses_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orqspaces" ADD CONSTRAINT "orqspaces_owner_id_orq_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."orq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orq_listing_variants" ADD CONSTRAINT "orq_listing_variants_listing_id_orq_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."orq_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orq_listings" ADD CONSTRAINT "orq_listings_owner_id_orq_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."orq_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orq_listings" ADD CONSTRAINT "orq_listings_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_assignments" ADD CONSTRAINT "delivery_agent_assignments_delivery_agent_user_id_delivery_agents_user_id_fk" FOREIGN KEY ("delivery_agent_user_id") REFERENCES "public"."delivery_agents"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agent_assignments" ADD CONSTRAINT "delivery_agent_assignments_orqspace_id_orqspaces_id_fk" FOREIGN KEY ("orqspace_id") REFERENCES "public"."orqspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_agents" ADD CONSTRAINT "delivery_agents_user_id_orq_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."orq_users"("id") ON DELETE no action ON UPDATE no action;