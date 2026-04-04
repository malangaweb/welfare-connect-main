-- =====================================================
-- MIGRATION: Archive + Cleanup Empty Quarantine Rows
-- Date: 2026-03-21
-- Purpose: Remove legacy empty quarantine rows from reporting while
--          preserving an archive copy for audit purposes.
-- =====================================================

-- 1) Archive table for removed quarantine rows (idempotent)
CREATE TABLE IF NOT EXISTS public.wrong_mpesa_transactions_quarantine_archive (
    id UUID PRIMARY KEY,
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    archive_reason TEXT NOT NULL,
    quarantined_at TIMESTAMP WITH TIME ZONE,
    quarantine_reason TEXT,
    original_row JSONB NOT NULL
);

-- 2) Move only fully-empty legacy rows to archive
INSERT INTO public.wrong_mpesa_transactions_quarantine_archive (
    id,
    archived_at,
    archive_reason,
    quarantined_at,
    quarantine_reason,
    original_row
)
SELECT
    q.id,
    NOW(),
    'Legacy empty quarantine cleanup',
    q.quarantined_at,
    q.quarantine_reason,
    q.original_row
FROM public.wrong_mpesa_transactions_quarantine q
WHERE
    COALESCE(NULLIF(BTRIM(q.original_row->>'mpesa_receipt_number'), ''), '') = ''
    AND COALESCE(NULLIF(BTRIM(q.original_row->>'phone_number'), ''), '') = ''
    AND (
      COALESCE(NULLIF(BTRIM(q.original_row->>'amount'), ''), '') = ''
      OR NOT (q.original_row->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$')
    )
ON CONFLICT (id) DO NOTHING;

-- 3) Delete archived empty rows from active quarantine table
DELETE FROM public.wrong_mpesa_transactions_quarantine q
USING public.wrong_mpesa_transactions_quarantine_archive a
WHERE a.id = q.id
  AND a.archive_reason = 'Legacy empty quarantine cleanup';

-- 4) Ensure unified view exists for ongoing suspense tracking
CREATE OR REPLACE VIEW public.unified_wrong_mpesa_transactions AS
SELECT
    w.id::text AS id,
    'wrong_mpesa_transactions'::text AS source_table,
    FALSE AS is_quarantined,
    w.created_at AS observed_at,
    w.created_at AS created_at,
    NULL::timestamp with time zone AS quarantined_at,
    NULL::text AS quarantine_reason,
    w.mpesa_receipt_number::text AS mpesa_receipt_number,
    w.phone_number::text AS phone_number,
    w.amount::numeric AS amount,
    w.sender_name::text AS sender_name,
    w.status::text AS status,
    w.source::text AS webhook_source,
    w.reference::text AS reference,
    w.transaction_date::text AS event_time,
    w.notes::text AS notes,
    w.matched_member_id::text AS matched_member_id,
    w.matched_at::text AS matched_at,
    COALESCE(w.metadata, '{}'::jsonb) AS metadata,
    to_jsonb(w) AS raw_row
FROM public.wrong_mpesa_transactions w

UNION ALL

SELECT
    q.id::text AS id,
    'wrong_mpesa_transactions_quarantine'::text AS source_table,
    TRUE AS is_quarantined,
    q.quarantined_at AS observed_at,
    q.quarantined_at AS created_at,
    q.quarantined_at AS quarantined_at,
    q.quarantine_reason::text AS quarantine_reason,
    q.original_row->>'mpesa_receipt_number' AS mpesa_receipt_number,
    q.original_row->>'phone_number' AS phone_number,
    CASE
      WHEN COALESCE(q.original_row->>'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (q.original_row->>'amount')::numeric
      ELSE NULL
    END AS amount,
    q.original_row->>'sender_name' AS sender_name,
    q.original_row->>'status' AS status,
    q.original_row->>'source' AS webhook_source,
    q.original_row->>'reference' AS reference,
    q.original_row->>'transaction_date' AS event_time,
    q.original_row->>'notes' AS notes,
    q.original_row->>'matched_member_id' AS matched_member_id,
    q.original_row->>'matched_at' AS matched_at,
    CASE
      WHEN jsonb_typeof(q.original_row->'metadata') = 'object'
        THEN q.original_row->'metadata'
      ELSE '{}'::jsonb
    END AS metadata,
    q.original_row AS raw_row
FROM public.wrong_mpesa_transactions_quarantine q;

COMMENT ON VIEW public.unified_wrong_mpesa_transactions IS
'Unified read-only view for live wrong_mpesa_transactions and quarantine rows.';
