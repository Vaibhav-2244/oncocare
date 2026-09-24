-- Harden medicine finder and dashboard message access.

-- Catalog tables remain publicly readable, but only authenticated users may write.
DROP POLICY IF EXISTS "anon_insert_pharmacies" ON pharmacies;
DROP POLICY IF EXISTS "anon_update_pharmacies" ON pharmacies;
DROP POLICY IF EXISTS "anon_delete_pharmacies" ON pharmacies;
CREATE POLICY "authenticated_insert_pharmacies" ON pharmacies FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_pharmacies" ON pharmacies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_pharmacies" ON pharmacies FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reviews" ON pharmacy_reviews;
DROP POLICY IF EXISTS "anon_update_reviews" ON pharmacy_reviews;
DROP POLICY IF EXISTS "anon_delete_reviews" ON pharmacy_reviews;
CREATE POLICY "authenticated_insert_reviews" ON pharmacy_reviews FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_reviews" ON pharmacy_reviews FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_reviews" ON pharmacy_reviews FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_medicines" ON medicines;
DROP POLICY IF EXISTS "anon_update_medicines" ON medicines;
DROP POLICY IF EXISTS "anon_delete_medicines" ON medicines;
CREATE POLICY "authenticated_insert_medicines" ON medicines FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_medicines" ON medicines FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_medicines" ON medicines FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_prices" ON medicine_prices;
DROP POLICY IF EXISTS "anon_update_prices" ON medicine_prices;
DROP POLICY IF EXISTS "anon_delete_prices" ON medicine_prices;
CREATE POLICY "authenticated_insert_prices" ON medicine_prices FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_prices" ON medicine_prices FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_prices" ON medicine_prices FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_generics" ON generic_alternatives;
DROP POLICY IF EXISTS "anon_update_generics" ON generic_alternatives;
DROP POLICY IF EXISTS "anon_delete_generics" ON generic_alternatives;
CREATE POLICY "authenticated_insert_generics" ON generic_alternatives FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_generics" ON generic_alternatives FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_generics" ON generic_alternatives FOR DELETE
  TO authenticated USING (true);

-- Existing personal rows have no recoverable owner. Preserve them with NULL user_id;
-- the authenticated policies below intentionally exclude those legacy rows.
ALTER TABLE user_watchlist
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_favourite_pharmacies
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE recently_viewed
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favourite_pharmacies_user ON user_favourite_pharmacies (user_id);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed (user_id);

DROP POLICY IF EXISTS "anon_read_watchlist" ON user_watchlist;
DROP POLICY IF EXISTS "anon_insert_watchlist" ON user_watchlist;
DROP POLICY IF EXISTS "anon_update_watchlist" ON user_watchlist;
DROP POLICY IF EXISTS "anon_delete_watchlist" ON user_watchlist;
CREATE POLICY "authenticated_read_watchlist" ON user_watchlist FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "authenticated_insert_watchlist" ON user_watchlist FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_update_watchlist" ON user_watchlist FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_delete_watchlist" ON user_watchlist FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "anon_read_fav_pharmacies" ON user_favourite_pharmacies;
DROP POLICY IF EXISTS "anon_insert_fav_pharmacies" ON user_favourite_pharmacies;
DROP POLICY IF EXISTS "anon_update_fav_pharmacies" ON user_favourite_pharmacies;
DROP POLICY IF EXISTS "anon_delete_fav_pharmacies" ON user_favourite_pharmacies;
CREATE POLICY "authenticated_read_fav_pharmacies" ON user_favourite_pharmacies FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "authenticated_insert_fav_pharmacies" ON user_favourite_pharmacies FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_update_fav_pharmacies" ON user_favourite_pharmacies FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_delete_fav_pharmacies" ON user_favourite_pharmacies FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "anon_read_recently_viewed" ON recently_viewed;
DROP POLICY IF EXISTS "anon_insert_recently_viewed" ON recently_viewed;
DROP POLICY IF EXISTS "anon_update_recently_viewed" ON recently_viewed;
DROP POLICY IF EXISTS "anon_delete_recently_viewed" ON recently_viewed;
CREATE POLICY "authenticated_read_recently_viewed" ON recently_viewed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "authenticated_insert_recently_viewed" ON recently_viewed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_update_recently_viewed" ON recently_viewed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated_delete_recently_viewed" ON recently_viewed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- RLS WITH CHECK evaluates only the proposed row, so use a trigger to ensure a
-- recipient can change only is_read and cannot rewrite message ownership/content.
CREATE OR REPLACE FUNCTION public.prevent_recipient_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.recipient_id AND (
    NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
    NEW.recipient_id IS DISTINCT FROM OLD.recipient_id OR
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Recipients may only update message read status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_recipient_message_mutation ON messages;
CREATE TRIGGER prevent_recipient_message_mutation
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_recipient_message_mutation();

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);
