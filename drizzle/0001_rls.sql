-- Supabase izlaže tablice kroz javni API; aplikacija ga ne koristi (spaja se izravno kao vlasnik
-- tablica, na kojeg se RLS ne odnosi). Uključen RLS bez pravila zatvara taj javni pristup.
ALTER TABLE "communities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "community_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sender_rules" ENABLE ROW LEVEL SECURITY;
