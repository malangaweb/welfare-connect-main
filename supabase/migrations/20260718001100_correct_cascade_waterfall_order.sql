-- Correct the old penalty-first cascade order for all 46 affected members.
--
-- The old waterfall (Jul 16-17) paid penalty BEFORE cases. In the correct
-- waterfall, cases are paid first, then penalty. This migration:
--   1. Deletes all cascade-generated penalty + arrears transactions (Jul 16-18).
--   2. Deletes all heal refund wallet_funding transactions.
--   3. Deletes all heal/cascade auto_wallet_reactivation transitions.
--   4. Resets the wallet to its pre-cascade balance + real member deposits.
--   5. Sets each member inactive and creates a fresh auto_inactive transition.
--   6. Runs the correct (cases-first, penalty-last) waterfall on each member.

-- ── Affected member UUIDs (46 total) ────────────────────────────────────────

CREATE TEMP TABLE tmp_cascade_members (
  id UUID PRIMARY KEY,
  member_number INT,
  name TEXT,
  status TEXT,
  wallet_balance NUMERIC
);

INSERT INTO tmp_cascade_members VALUES
  ('e425198c-91d0-4f32-896c-8e862452f401', 1041, 'DAVID MUNGUMBA MOLE', 'probation', 0),
  ('089d4ae2-47e3-4316-be64-9797cbca4957', 1043, 'ESTHER KACHE SADHI', 'probation', 0),
  ('c3fa4b19-690c-4d32-ad6d-7cfebf78becf', 1056, 'NZARO KALAMA JEFA', 'inactive', 0),
  ('fccd5be6-f4ca-438d-a307-1ced96f630a6', 1057, 'KADII KAZUNGU JEFWA', 'inactive', 0),
  ('ee959910-4058-41b9-99be-1cbcb1b0f9d3', 1126, 'ROBERT YAA', 'probation', 0),
  ('80a461ef-b072-4617-baf6-7213a2ae117d', 1132, 'WILLIAM ROMAN KARISA', 'probation', 0),
  ('8a92e899-aeb5-476b-b374-82999d8bd745', 1162, 'KHAMISI TSUMA KITSAO', 'inactive', 0),
  ('73f7ab86-2e44-4976-a35b-98ca44ea76eb', 1180, 'PAUL KAZUNGU MAKOKO ', 'inactive', 0),
  ('69b032bc-65a6-4e32-87aa-bd55587f6014', 1183, 'KADENGE RANDU MFALME ', 'inactive', 0),
  ('492dad3e-feac-4717-8ce3-1cd4ba93e35d', 1230, 'IRENE FESTUS CHIPONDA', 'probation', 20),
  ('6c70c64c-fd14-4017-8a59-8c663043f910', 1252, 'DHAHABU KAHINDI RIMBA', 'probation', 0),
  ('cbf9b3e0-618f-4832-8a2a-86f1bd27cf19', 1300, 'TSOFA TINGA KALU', 'inactive', 0),
  ('c838059c-3cbe-4586-be89-77ce07c50ef3', 1308, 'RAPHAEL NYALE KARISA', 'probation', 0),
  ('500d2458-b227-40d1-b992-c337585514a7', 1377, 'KHAMISI SANGA MWACHAI', 'probation', 0),
  ('0044c13f-a786-4b72-bd6d-0858d7022991', 1401, 'JOHN MELE NDORO ', 'probation', 160),
  ('8959907f-dc85-4b3a-8f5e-246a298c1cad', 1404, 'FRANCIS MURIUNGI NATUMO', 'inactive', 0),
  ('1d890032-628e-4d0b-8c64-9f87f01da568', 1417, 'NYEVU KARISA TSAKA', 'probation', 0),
  ('1109f89b-f1c2-4e1f-be29-f37dbe9fe762', 1418, 'ESTHER KARISA TSAKA', 'inactive', 0),
  ('f3bb6a5e-8f42-4146-976e-d65bbc903cbb', 1421, 'MARY JOHN CHARO', 'inactive', 0),
  ('364a3b63-5264-48af-a50b-49384d54515e', 1430, 'JOELY NGALE JOHARI', 'inactive', 0),
  ('732029a4-ba91-4d6f-8531-64d987aaa044', 1431, 'ESTHER BAYA MSANZU', 'inactive', 0),
  ('71593880-ed09-4b11-87fe-f8d4ea902738', 1432, 'JUMWA KIDHUKU MGALE', 'inactive', 0),
  ('c2e4de39-8c42-4440-98fa-f232070582e6', 153, 'EMILY KADZO CHARO', 'inactive', 0),
  ('018c0947-4755-46f3-9b16-886e5cd37e2a', 160, 'LINET WASI KARISA', 'probation', 0),
  ('79f4b3ed-8d9a-4cb2-baeb-4af8e329d7c1', 190, 'THOMAS NGALA KENGA', 'probation', 0),
  ('9a1d0758-0402-4dde-843c-5b9df9b48692', 199, 'KAHINDI KAGUMBA MKENGA', 'probation', 0),
  ('600db773-001e-4a59-9b0c-2f0ee7dce1db', 203, 'VINCENT KARISA KAREMA', 'probation', 0),
  ('c0da787d-2458-43b1-8f94-54d34807ebca', 228, 'WILSON MANGI KALAMA', 'probation', 0),
  ('459ae887-8cfd-4968-8a52-3f0f7f682b7e', 285, 'GRACE MBEYU MUYE', 'probation', 0),
  ('b8007054-4bc6-49ce-af69-80d06d2ff64e', 305, 'KARISA KAZUNGU MAKEMBA', 'probation', 0),
  ('8937cbb0-7e28-4ddc-9ce6-9948e700b311', 312, 'JONATHAN KATANA NGWADO', 'inactive', 0),
  ('8f3a5f3c-897a-4a12-847c-2926bc0d8deb', 316, 'SYLVESTER MWAMURE THOYA', 'inactive', 0),
  ('f887a91b-abda-4340-b24c-32828d3a8d2d', 376, 'NZINGO KITSAO MAGUNDA', 'probation', 0),
  ('289ccfde-d06c-44ae-bb3a-520e95be935a', 471, 'BENJAMIN KAZUNGU CHARO', 'probation', 0),
  ('9cde4a08-3722-4d7a-83c4-6245fc42b683', 473, 'NGUMBAO MATO NGOMBILO', 'probation', 0),
  ('5fc8ae01-c0a7-4beb-a743-17f0f2731d6f', 477, 'JOSHUA BOMBA NGALA', 'probation', 0),
  ('540ec3ca-74ea-4011-a41a-674300de1e7c', 641, 'FURAHA SAMSON RUWA', 'inactive', 0),
  ('3083cbf6-b6d1-49c8-beba-212ce13aab19', 670, 'DZENDERE KARISA SARO', 'inactive', 0),
  ('839da1fe-cb9f-4840-9e2b-0b136225aac4', 694, 'ELIZABETH IHA NYUNDO', 'inactive', 0),
  ('5f93664b-4ad1-4bf4-b704-bce6f000b712', 757, 'ESTHER FIKIRI KAZUNGU', 'inactive', 0),
  ('e8b7d22f-a9ae-4682-b97d-c466b55de20c', 797, 'ENOSH KITSAO MKARE', 'probation', 0),
  ('eb660afe-f3e5-4bbc-8d22-b6a183cc1f27', 821, 'FRANCIS KAHINDI NGUWA', 'inactive', 0),
  ('3a7698af-0aed-4ab9-bfe7-f04c3d3ecca0', 880, 'KADZO KALAMA MASHA', 'probation', 0),
  ('fb8eace4-b7f0-465c-8118-67e2dbe9b097', 912, 'SHADRACK SAFARI KARISA', 'inactive', 0),
  ('ed05ed6d-241e-4a70-8f21-98c8f835a772', 967, 'KADZOSI SULUBU CHARO ', 'inactive', 0),
  ('fce18cb2-42a0-43f5-be14-6a28746c54cd', 992, 'LEAH BAYA JAPHET', 'inactive', 0);

-- ── Step 1: delete cascade/heal transitions ─────────────────────────────────

DELETE FROM public.member_status_transitions
WHERE member_id = ANY(SELECT id FROM tmp_cascade_members)
  AND reason = 'auto_wallet_reactivation'
  AND created_at >= '2026-07-16T00:00:00Z'
  AND created_at <= '2026-07-18T23:59:59Z';

DELETE FROM public.member_status_transitions
WHERE member_id = ANY(SELECT id FROM tmp_cascade_members)
  AND reason = 'auto_inactive_two_consecutive_defaults'
  AND created_at >= '2026-07-16T00:00:00Z'
  AND created_at <= '2026-07-18T23:59:59Z';

-- ── Step 2: delete cascade penalty + arrears transactions ───────────────────

DELETE FROM public.transactions
WHERE member_id = ANY(SELECT id FROM tmp_cascade_members)
  AND transaction_type IN ('penalty', 'arrears')
  AND metadata->>'source' IN ('auto_reinstatement_penalty', 'auto_wallet_payment_waterfall')
  AND created_at >= '2026-07-16T00:00:00Z';

-- ── Step 3: delete heal refund wallet_funding ──────────────────────────────

DELETE FROM public.transactions
WHERE member_id = ANY(SELECT id FROM tmp_cascade_members)
  AND transaction_type = 'wallet_funding'
  AND metadata->>'source' = 'cascade_bug_refund';

-- ── Step 4: set guard to suppress sweep trigger during correction ───────────

SET session app.auto_wallet_reactivation = 'true';

-- ── Step 5: reset all affected members to inactive ─────────────────────────

UPDATE public.members m
SET status = 'inactive',
    is_active = FALSE,
    updated_at = now()
FROM tmp_cascade_members t
WHERE m.id = t.id;

-- ── Step 6: create a fresh auto_inactive transition per member ─────────────

INSERT INTO public.member_status_transitions
  (member_id, from_status, to_status, from_is_active, to_is_active,
   reason, details, performed_by_role)
SELECT
  t.id,
  t.status AS from_status,
  'inactive' AS to_status,
  CASE WHEN t.status IN ('active', 'probation') THEN TRUE ELSE FALSE END AS from_is_active,
  FALSE AS to_is_active,
  'auto_inactive_two_consecutive_defaults',
  jsonb_build_object(
    'source', 'cascade_correction',
    'prior_status', t.status,
    'migration', '20260718001100'
  ),
  'system'
FROM tmp_cascade_members t;

-- ── Step 7: apply the correct cases-first waterfall for each member ─────────

DO $$
DECLARE
  v_member_id UUID;
  v_result JSONB;
  v_count INT := 0;
BEGIN
  FOR v_member_id IN SELECT id FROM tmp_cascade_members ORDER BY id LOOP
    v_result := public.apply_wallet_payment_waterfall(v_member_id);
    v_count := v_count + 1;
    IF v_count <= 46 THEN
      RAISE NOTICE '[%/%] Member % → %', v_count, 46, v_member_id, v_result;
    END IF;
  END LOOP;
END;
$$;

-- Guard is session-level and auto-cleans when the session ends.

DROP TABLE IF EXISTS tmp_cascade_members;
