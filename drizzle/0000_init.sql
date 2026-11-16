CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"suggested_name" text NOT NULL,
	"suggested_slug" text NOT NULL,
	"sample_from" text DEFAULT '' NOT NULL,
	"sample_subject" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"community_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "community_requests_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"message_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"online_url" text,
	"registration_url" text,
	"organizer" text,
	"category" text DEFAULT 'other' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"dedupe_key" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"sender_address" text NOT NULL,
	"forwarded_by" text,
	"subject" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"auth" jsonb,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"community_id" uuid,
	"request_id" uuid,
	"status" text NOT NULL,
	"error" text,
	"extractor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sender_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sender_rules_value_unique" UNIQUE("value")
);
--> statement-breakpoint
ALTER TABLE "community_requests" ADD CONSTRAINT "community_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_request_id_community_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."community_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_dedupe_uid" ON "items" USING btree ("community_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "items_starts_idx" ON "items" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_uid" ON "messages" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "messages_request_idx" ON "messages" USING btree ("request_id");