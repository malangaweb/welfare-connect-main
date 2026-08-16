-- Wrongful-inactivation remediation for members caught by the OLD frozen
-- case-default streak rule.
--
-- The old rule froze "unpaid at own finalization" in case_defaulters and never
-- forgave a member who paid late but BEFORE the next case finalised. Under the
-- new consecutive-unpaid rule (20260816010000) these 17 members currently
-- score 0-1 (not 2), so they should be active. They remain inactive because
-- GOING-FORWARD-ONLY was the agreed policy.
--
-- For each member we:
--   1) reverse any COMPLETED auto_reinstatement_penalty charge (funds return
--      to the member's wallet; already-reversed rows are skipped),
--   2) reactivate to 'active' (local app.auto_wallet_reactivation=true
--      satisfies trg_block_manual_inactive_reactivation),
--   3) record a correction_wrongful_discipline transition,
--   4) reset member_default_streaks to 0.
--
-- Member 345 (KARISA CHARO THUVA) was corrected directly on 2026-08-16 and is
-- not in this list.

DO $$
DECLARE
  v_member_ids UUID[] := ARRAY[
    '5f30b6ce-ef68-4efc-a2cf-efc2616bbeae'::UUID, -- 1078 SOPHIA NZINGO SIRYA
    'db710e53-d530-4155-998e-4e28ef01b54b'::UUID, -- 1109 KAREMBO KAINGU JEFWA
    '2f771eb6-7172-471d-af11-91b89a87abbf'::UUID, -- 1190 REBECCA MLEWA TUMBO
    'a9f99313-e65d-431d-a897-d09ec6364c4d'::UUID, -- 1287 WINNIIE KAHATHI THOYA
    '55d293dc-6c02-419a-a90f-0d239a8733cb'::UUID, -- 1356 WILSON KARABU CHARO
    '282f631e-4a96-4a1e-ace4-1991d4903846'::UUID, -- 1381 KABWERE KAZUNGU
    'efae210c-4b8d-4ced-b267-9064281e7883'::UUID, -- 1443 PRISCAR UMAZI KITI
    'ecc9421f-71d2-4498-8c05-be265988f965'::UUID, -- 1464 KAHUNDA KARISA THUVA
    '6bf8c304-bfa1-4626-abb7-4ce5024803bc'::UUID, -- 175 HAJRA ABDALLA OMAR
    '13be9ef3-94b7-4074-861d-04fb7f795fe8'::UUID, -- 250 CHARO PITE CHOME
    'eb0ba131-050b-4580-8cd6-70354d0d85aa'::UUID, -- 440 SAMUEL NGALA MBOE
    '7ad9320d-e214-4b13-a023-fcf3cfa9b1a1'::UUID, -- 617 ESTHER FIKIRI KAZUNGU
    '5f93664b-4ad1-4bf4-b704-bce6f000b712'::UUID, -- 757 ESTHER FIKIRI KAZUNGU
    '11ab6a67-3a17-4a5b-8a66-e5b0759e7e3d'::UUID, -- 834 TUNDA ENOS MAYAA
    '3a7698af-0aed-4ab9-bfe7-f04c3d3ecca0'::UUID, -- 880 KADZO KALAMA MASHA
    'c811c46e-0b90-4104-81bb-7b605365790c'::UUID, -- 894 DAMA KAZUNGU KENGA
    'ddd954da-0696-4b32-add4-e522f1e7e700'::UUID  -- 955 ELIZABETH DAMA KATANA
  ];
  v_r RECORD;
  v_penalty RECORD;
  v_old_status TEXT;
  v_old_active BOOLEAN;
BEGIN
  PERFORM set_config('app.auto_wallet_reactivation', 'true', true);

  FOR v_r IN SELECT m.id, m.status, m.is_active, m.member_number, m.name
             FROM public.members m
             WHERE m.id = ANY(v_member_ids)
  LOOP
    -- 1) Revert completed auto_reinstatement_penalty charges.
    FOR v_penalty IN
      SELECT t.id, t.amount FROM public.transactions t
      WHERE t.member_id = v_r.id
        AND t.transaction_type = 'penalty'
        AND COALESCE(t.status,'completed') = 'completed'
        AND COALESCE(t.metadata->>'source','') = 'auto_reinstatement_penalty'
    LOOP
      UPDATE public.transactions
      SET status = 'reversed',
          metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
            'reversed_at', to_jsonb(now()),
            'reversal_reason', 'Wrongful inactivation corrected by consecutive-unpaid-streak fix'
          )
      WHERE id = v_penalty.id;

      INSERT INTO public.transactions (
        member_id, amount, transaction_type, description, status, metadata, reference, created_at
      ) VALUES (
        v_r.id, -v_penalty.amount, 'reversal_memo',
        'REVERSAL MEMO: Automatic reinstatement penalty payment (Reason: Wrongful inactivation corrected by consecutive-unpaid-streak fix)',
        'completed',
        jsonb_build_object(
          'reversed_transaction_id', v_penalty.id,
          'reversal_reason', 'Wrongful inactivation corrected by consecutive-unpaid-streak fix'
        ),
        'REV-' || v_penalty.id::TEXT, now()
      );
    END LOOP;

    -- 2) Reactivate.
    v_old_status := v_r.status;
    v_old_active := v_r.is_active;

    UPDATE public.members
    SET status = 'active',
        is_active = TRUE,
        probation_end_date = NULL,
        updated_at = now()
    WHERE id = v_r.id;

    -- 3) Transition record.
    INSERT INTO public.member_status_transitions (
      member_id, from_status, to_status, from_is_active, to_is_active,
      reason, details, performed_by_role
    ) VALUES (
      v_r.id, v_old_status, 'active', v_old_active, TRUE,
      'correction_wrongful_discipline',
      jsonb_build_object(
        'note', 'Member wrongly inactivated by old frozen-case-default streak rule; reactivated under consecutive-unpaid fix (2026-08-16). Penalties reverted.',
        'source', 'consecutive_unpaid_fix_20260816',
        'original_reason', 'auto_inactive_two_consecutive_defaults'
      ),
      'system'
    );

    -- 4) Reset streak counter.
    INSERT INTO public.member_default_streaks (member_id, current_streak, last_case_id, last_defaulted, updated_at)
    VALUES (v_r.id, 0, NULL, FALSE, now())
    ON CONFLICT (member_id) DO UPDATE SET
      current_streak = 0, last_defaulted = FALSE, updated_at = now();

    RAISE NOTICE 'Corrected #% (%) -> active', v_r.member_number, v_r.name;
  END LOOP;
END;
$$;