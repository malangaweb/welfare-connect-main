-- Wallet balance = sum of completed transactions only (trigger-aligned helpers).
-- Removes double-counting with update_wallet_balance RPC after inserts.

CREATE OR REPLACE FUNCTION update_member_wallet_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
    v_new_balance DECIMAL(15,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_member_id := OLD.member_id;
    ELSE
        v_member_id := NEW.member_id;
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN (
                'registration',
                'renewal',
                'contribution',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(amount)
            WHEN transaction_type IN ('reversal_memo') THEN 0
            ELSE amount
        END
    ), 0) INTO v_new_balance
    FROM transactions
    WHERE member_id = v_member_id
      AND COALESCE(status, 'completed') = 'completed';

    UPDATE members
    SET wallet_balance = v_new_balance
    WHERE id = v_member_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_member_wallet_balance_trigger() IS
'Sets members.wallet_balance from completed transactions only. reversal_memo rows are audit-only (zero wallet effect).';

CREATE OR REPLACE FUNCTION calculate_wallet_balance(p_member_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN (
                'registration',
                'renewal',
                'contribution',
                'penalty',
                'arrears',
                'case_wallet_deduction'
            ) THEN -ABS(amount)
            WHEN transaction_type IN ('reversal_memo') THEN 0
            ELSE amount
        END
    ), 0) INTO balance
    FROM transactions
    WHERE member_id = p_member_id
      AND COALESCE(status, 'completed') = 'completed';

    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_wallet_balance(UUID) IS
'Ledger-aligned wallet total (completed rows only). Matches update_member_wallet_balance_trigger.';

CREATE OR REPLACE FUNCTION get_member_wallet_balance(member_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN calculate_wallet_balance(member_id);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION refresh_all_member_wallet_balances()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE members m
    SET wallet_balance = calculate_wallet_balance(m.id)
    WHERE m.id IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recompute stored balances after rule change
UPDATE members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;

-- Dashboard: include case wallet pay-ins toward case pool / contributions metric
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
    total_members        INT,
    active_members       INT,
    defaulters_count     INT,
    total_wallet_balance NUMERIC,
    active_cases         INT,
    total_contributions  NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT                                                           AS total_members,
        COUNT(*) FILTER (WHERE m.is_active = true)::INT                        AS active_members,
        COUNT(*) FILTER (WHERE m.wallet_balance < 0)::INT                      AS defaulters_count,
        COALESCE(SUM(m.wallet_balance), 0)::NUMERIC                            AS total_wallet_balance,
        (SELECT COUNT(*)::INT FROM cases WHERE is_active = true)               AS active_cases,
        (SELECT COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC
           FROM transactions t
          WHERE t.transaction_type IN ('contribution', 'case_wallet_deduction')
            AND COALESCE(t.status, 'completed') = 'completed')                 AS total_contributions
    FROM members m;
END;
$$ LANGUAGE plpgsql STABLE;

-- Reversal: ledger-only — mark original reversed (excluded from wallet sum), insert audit row (zero wallet effect)
CREATE OR REPLACE FUNCTION revert_transaction(p_transaction_id UUID, p_admin_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_tx RECORD;
    v_memo_id UUID;
BEGIN
    SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaction not found');
    END IF;

    IF v_tx.status = 'reversed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaction already reversed');
    END IF;

    UPDATE transactions
    SET status = 'reversed',
        metadata = COALESCE(v_tx.metadata, '{}'::jsonb) || jsonb_build_object(
            'reversed_at', to_jsonb(NOW()),
            'reversal_reason', p_reason,
            'reversed_by_admin_id', p_admin_id
        )
    WHERE id = p_transaction_id;

    INSERT INTO transactions (
        member_id,
        amount,
        transaction_type,
        description,
        status,
        metadata,
        reference,
        created_at
    ) VALUES (
        v_tx.member_id,
        -v_tx.amount,
        'reversal_memo',
        'REVERSAL MEMO: ' || COALESCE(v_tx.description, '') || ' (Reason: ' || p_reason || ')',
        'completed',
        jsonb_build_object(
            'reversed_transaction_id', p_transaction_id,
            'reversal_reason', p_reason,
            'admin_id', p_admin_id
        ),
        'REV-' || v_tx.id::text,
        NOW()
    ) RETURNING id INTO v_memo_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, metadata)
    VALUES (
        p_admin_id,
        'UPDATE',
        'transactions',
        p_transaction_id,
        jsonb_build_object('action', 'reversal', 'reversal_memo_id', v_memo_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transaction reversed successfully',
        'reversal_memo_id', v_memo_id,
        'original_transaction_id', p_transaction_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Suspense auto-match: rely on trigger only (no update_wallet_balance)
CREATE OR REPLACE FUNCTION match_suspense_transactions()
RETURNS INT AS $$
DECLARE
    v_match_count INT := 0;
    v_row RECORD;
    v_member_id UUID;
    v_reference TEXT;
    v_left_part TEXT;
    v_right_part TEXT;
    v_member_number TEXT;
    v_has_case BOOLEAN;
BEGIN
    FOR v_row IN SELECT * FROM wrong_mpesa_transactions WHERE status = 'pending' LOOP
        v_member_id := NULL;
        v_reference := v_row.reference;
        v_has_case := FALSE;

        IF v_reference IS NULL OR v_reference = '' THEN
            CONTINUE;
        END IF;

        IF POSITION('#' IN v_reference) > 0 THEN
            v_left_part := UPPER(SPLIT_PART(v_reference, '#', 1));
            v_right_part := UPPER(SPLIT_PART(v_reference, '#', 2));

            IF v_left_part LIKE 'C%' AND v_right_part NOT LIKE 'C%' THEN
                v_has_case := TRUE;
                v_member_number := REPLACE(v_right_part, 'M', '');
            ELSIF v_right_part LIKE 'C%' AND v_left_part NOT LIKE 'C%' THEN
                v_has_case := TRUE;
                v_member_number := REPLACE(v_left_part, 'M', '');
            ELSIF v_left_part NOT LIKE 'C%' AND v_right_part NOT LIKE 'C%' THEN
                v_member_number := REPLACE(v_right_part, 'M', '');
                IF v_right_part ~ '^[0-9]+$' AND v_left_part LIKE 'M%' THEN
                    v_member_number := REPLACE(v_left_part, 'M', '');
                END IF;
            ELSE
                CONTINUE;
            END IF;
        ELSE
            v_member_number := UPPER(v_reference);
            IF v_member_number LIKE 'C%' THEN
                CONTINUE;
            END IF;
            v_member_number := REPLACE(v_member_number, 'M', '');
        END IF;

        v_member_number := REGEXP_REPLACE(v_member_number, '[^0-9]', '', 'g');

        IF v_member_number = '' THEN
            CONTINUE;
        END IF;

        SELECT id INTO v_member_id
        FROM members
        WHERE member_number = v_member_number
        LIMIT 1;

        IF v_member_id IS NULL THEN
            SELECT id INTO v_member_id
            FROM members
            WHERE member_number = LTRIM(v_member_number, '0')
            LIMIT 1;
        END IF;

        IF v_member_id IS NOT NULL THEN
            UPDATE wrong_mpesa_transactions
            SET
              status = 'matched',
              matched_member_id = v_member_id,
              matched_at = NOW(),
              matched_by = auth.uid()
            WHERE id = v_row.id;

            IF v_has_case THEN
                INSERT INTO transactions (
                    member_id,
                    amount,
                    transaction_type,
                    mpesa_reference,
                    description,
                    status,
                    created_at
                ) VALUES (
                    v_member_id,
                    v_row.amount,
                    'wallet_funding',
                    v_row.mpesa_receipt_number,
                    'M-Pesa Payment matched from suspense - Ref: ' || COALESCE(v_row.reference, 'N/A') || ' (Member+Case)',
                    'completed',
                    v_row.transaction_date
                );
            ELSE
                INSERT INTO transactions (
                    member_id,
                    amount,
                    transaction_type,
                    mpesa_reference,
                    description,
                    status,
                    created_at
                ) VALUES (
                    v_member_id,
                    v_row.amount,
                    'wallet_funding',
                    v_row.mpesa_receipt_number,
                    'M-Pesa Payment matched from suspense - Ref: ' || COALESCE(v_row.reference, 'N/A'),
                    'completed',
                    v_row.transaction_date
                );
            END IF;

            INSERT INTO audit_logs (
                user_id,
                action,
                table_name,
                record_id,
                status,
                metadata
            ) VALUES (
                auth.uid(),
                'SUSPENSE_AUTO_MATCH',
                'wrong_mpesa_transactions',
                v_row.id,
                'success',
                jsonb_build_object(
                    'member_id', v_member_id,
                    'member_number', v_member_number,
                    'amount', v_row.amount,
                    'mpesa_receipt', v_row.mpesa_receipt_number,
                    'reference', v_row.reference,
                    'has_case', v_has_case
                )
            );

            v_match_count := v_match_count + 1;
        END IF;
    END LOOP;

    RETURN v_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION match_suspense_transactions() IS
'Auto-matches suspense to members by BillRefNumber. Wallet updates via transactions trigger only.';

COMMENT ON FUNCTION update_wallet_balance(UUID, numeric, text) IS
'DEPRECATED for post-insert use: prefer transactions + trigger. Safe for rare manual adjustments without a ledger row.';

GRANT EXECUTE ON FUNCTION calculate_wallet_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_member_wallet_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_all_member_wallet_balances() TO authenticated, service_role;
