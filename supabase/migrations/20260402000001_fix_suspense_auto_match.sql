-- =====================================================
-- MIGRATION: Fix suspense auto-match to use BillRefNumber
-- =====================================================
-- Since M-Pesa sends hashed phone numbers, we can't match by phone.
-- Instead, we match by the account/reference number (BillRefNumber)
-- which contains member numbers like M011, 45, etc.
-- 
-- Reference formats handled:
--   - "M011" or "45" → member only → auto-match to member
--   - "C045" → case only → SKIP (needs manual review)
--   - "45#C001" or "M011#C001" → member + case → auto-match to member
--   - "079970#M299" → phone + member → auto-match to member
-- =====================================================

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
        
        -- Skip if no reference
        IF v_reference IS NULL OR v_reference = '' THEN
            CONTINUE;
        END IF;
        
        -- Check if reference contains '#' (compound reference)
        IF POSITION('#' IN v_reference) > 0 THEN
            -- Split by '#'
            v_left_part := UPPER(SPLIT_PART(v_reference, '#', 1));
            v_right_part := UPPER(SPLIT_PART(v_reference, '#', 2));
            
            -- Pattern: Member#Case (e.g., M011#C001 or 45#C001)
            IF v_left_part LIKE 'C%' AND v_right_part NOT LIKE 'C%' THEN
                -- Case#Member format (reverse)
                v_has_case := TRUE;
                v_member_number := REPLACE(v_right_part, 'M', '');
            ELSIF v_right_part LIKE 'C%' AND v_left_part NOT LIKE 'C%' THEN
                -- Member#Case format
                v_has_case := TRUE;
                v_member_number := REPLACE(v_left_part, 'M', '');
            ELSIF v_left_part NOT LIKE 'C%' AND v_right_part NOT LIKE 'C%' THEN
                -- Member#Member or Phone#Member format
                -- Try right part first (usually the member in Phone#Member)
                v_member_number := REPLACE(v_right_part, 'M', '');
                -- If right part is all digits and left has M, try left
                IF v_right_part ~ '^[0-9]+$' AND v_left_part LIKE 'M%' THEN
                    v_member_number := REPLACE(v_left_part, 'M', '');
                END IF;
            ELSE
                -- Both are cases or unknown format - skip
                CONTINUE;
            END IF;
        ELSE
            -- No '#' - single reference
            v_member_number := UPPER(v_reference);
            
            -- If it starts with 'C', it's a case-only reference - skip auto-match
            IF v_member_number LIKE 'C%' THEN
                CONTINUE;
            END IF;
            
            -- Remove 'M' prefix if present
            v_member_number := REPLACE(v_member_number, 'M', '');
        END IF;
        
        -- Remove any non-digit characters from member number
        v_member_number := REGEXP_REPLACE(v_member_number, '[^0-9]', '', 'g');
        
        -- Skip if no member number extracted or it's empty
        IF v_member_number = '' THEN
            CONTINUE;
        END IF;
        
        -- Try to find member by member_number (with leading zeros preserved)
        SELECT id INTO v_member_id
        FROM members
        WHERE member_number = v_member_number
        LIMIT 1;
        
        -- If not found, try without leading zeros
        IF v_member_id IS NULL THEN
            SELECT id INTO v_member_id
            FROM members
            WHERE member_number = LTRIM(v_member_number, '0')
            LIMIT 1;
        END IF;
        
        IF v_member_id IS NOT NULL THEN
            -- Build description based on whether there's a case
            v_member_id := v_member_id;
            
            -- Update suspense record with match details
            UPDATE wrong_mpesa_transactions
            SET
              status = 'matched',
              matched_member_id = v_member_id,
              matched_at = NOW(),
              matched_by = auth.uid()
            WHERE id = v_row.id;

            -- Create transaction (wallet funding or contribution if case exists)
            IF v_has_case THEN
                -- For member+case, we'd need to also link to case
                -- For now, create as wallet funding with note
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

            -- Update member balance using RPC function
            PERFORM update_wallet_balance(
                v_member_id,
                v_row.amount,
                'deposit'
            );

            -- Log the auto-match action
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

COMMENT ON FUNCTION match_suspense_transactions() IS 'Auto-matches suspense transactions to members by BillRefNumber (account reference). Handles: member-only (M011, 45), member+case (45#C001), phone+member (079970#M299). Skips case-only (C045) for manual review.';
