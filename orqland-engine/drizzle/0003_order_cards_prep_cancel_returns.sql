ALTER TYPE "public"."delivery_file_purpose" ADD VALUE 'ORDER_INVOICE';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preparation_minutes" smallint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "preparation_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_request_status" varchar(12);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_request_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_request_resolution" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "return_pickup_date" date;--> statement-breakpoint
ALTER TABLE "delivery_files" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_files" ADD CONSTRAINT "delivery_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_files_order_idx" ON "delivery_files" USING btree ("order_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_request_status_chk" CHECK ("orders"."cancel_request_status" IS NULL OR "orders"."cancel_request_status" IN ('REQUESTED', 'APPROVED', 'DECLINED'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_preparation_minutes_chk" CHECK ("orders"."preparation_minutes" IS NULL OR "orders"."preparation_minutes" BETWEEN 1 AND 480);