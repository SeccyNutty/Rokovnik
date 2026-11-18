ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_tags_idx" ON "items" USING gin ("tags");--> statement-breakpoint
UPDATE "items" SET "tags" = ARRAY[CASE "category"
  WHEN 'lecture' THEN 'predavanje' WHEN 'workshop' THEN 'radionica' WHEN 'hackathon' THEN 'hackathon'
  WHEN 'competition' THEN 'hackathon' WHEN 'fair' THEN 'sajam' WHEN 'scholarship' THEN 'stipendija'
  WHEN 'call' THEN 'natjecaj' WHEN 'social' THEN 'kultura' END]
  WHERE "tags" = '{}'::text[] AND "category" IN ('lecture','workshop','hackathon','competition','fair','scholarship','call','social');--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "topic_tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"contact_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_requests_name_key_unique" UNIQUE("name_key")
);--> statement-breakpoint
ALTER TABLE "organization_requests" ENABLE ROW LEVEL SECURITY;
