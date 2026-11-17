CREATE INDEX IF NOT EXISTS "items_community_starts_idx" ON "items" USING btree ("community_id","starts_at");
