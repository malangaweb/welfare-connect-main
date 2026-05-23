-- Search-performance indexes for ILIKE '%term%' filters used in members and transactions views.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_members_name_trgm
  ON public.members USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_members_member_number_trgm
  ON public.members USING gin (member_number extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_members_phone_number_trgm
  ON public.members USING gin (phone_number extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_reference_trgm
  ON public.transactions USING gin (mpesa_reference extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_transactions_reference_trgm
  ON public.transactions USING gin (reference extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm
  ON public.transactions USING gin (description extensions.gin_trgm_ops);

-- Helps common listing pattern: newest transactions filtered by type/status.
CREATE INDEX IF NOT EXISTS idx_transactions_type_status_created_at_desc
  ON public.transactions (transaction_type, status, created_at DESC);
