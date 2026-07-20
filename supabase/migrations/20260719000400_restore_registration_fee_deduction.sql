-- Restore registration-fee deductions during member creation.
--
-- The original NewMember flow inserted a registration transaction when the
-- "Fee Payment Status" checkbox was checked. That behavior was lost when
-- member creation moved into insert_member(). This overload keeps member
-- creation and the registration debit atomic.

CREATE OR REPLACE FUNCTION public.insert_member(
    p_member_number TEXT,
    p_name TEXT,
    p_gender TEXT,
    p_date_of_birth DATE,
    p_national_id_number TEXT,
    p_phone_number TEXT,
    p_email_address TEXT,
    p_residence TEXT,
    p_next_of_kin JSONB,
    p_wallet_balance NUMERIC,
    p_is_active BOOLEAN,
    p_registration_date DATE,
    p_dependants JSONB,
    p_pin TEXT,
    p_registration_fee NUMERIC,
    p_fee_paid BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member_id UUID;
    v_pin_hash TEXT;
    v_registration_fee NUMERIC := GREATEST(COALESCE(p_registration_fee, 0), 0);
BEGIN
    IF p_pin IS NOT NULL AND p_pin <> '' THEN
        v_pin_hash := crypt(p_pin, gen_salt('bf', 12));
    END IF;

    INSERT INTO public.members (
        member_number,
        name,
        gender,
        date_of_birth,
        national_id_number,
        phone_number,
        email_address,
        residence,
        next_of_kin,
        dependants,
        wallet_balance,
        is_active,
        registration_date,
        pin_hash,
        status,
        probation_end_date
    ) VALUES (
        p_member_number,
        p_name,
        p_gender,
        p_date_of_birth,
        p_national_id_number,
        p_phone_number,
        p_email_address,
        p_residence,
        p_next_of_kin,
        COALESCE(p_dependants, '[]'::JSONB),
        COALESCE(p_wallet_balance, 0),
        p_is_active,
        p_registration_date,
        v_pin_hash,
        CASE
            WHEN p_registration_date + INTERVAL '90 days' <= CURRENT_DATE THEN 'active'
            ELSE 'probation'
        END,
        p_registration_date + INTERVAL '90 days'
    ) RETURNING id INTO v_member_id;

    IF COALESCE(p_fee_paid, FALSE) AND v_registration_fee > 0 THEN
        INSERT INTO public.transactions (
            member_id,
            amount,
            transaction_type,
            payment_method,
            status,
            description,
            metadata
        ) VALUES (
            v_member_id,
            -v_registration_fee,
            'registration',
            'manual',
            'completed',
            'Registration fee payment',
            jsonb_build_object(
                'source', 'member_registration',
                'fee_paid', TRUE,
                'registration_fee', v_registration_fee
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'id', v_member_id,
        'registration_fee_deducted', COALESCE(p_fee_paid, FALSE) AND v_registration_fee > 0,
        'registration_fee', v_registration_fee
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_member(
    TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, JSONB,
    NUMERIC, BOOLEAN, DATE, JSONB, TEXT, NUMERIC, BOOLEAN
) TO anon, authenticated, service_role;
