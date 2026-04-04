-- Add dependants parameter to insert_member function
-- This allows saving dependants when registering a new member

CREATE OR REPLACE FUNCTION insert_member(
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
    p_dependants JSONB DEFAULT '[]',
    p_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_member_id UUID;
    v_pin_hash TEXT;
BEGIN
    -- Hash PIN if provided
    IF p_pin IS NOT NULL AND p_pin <> '' THEN
        v_pin_hash := crypt(p_pin, gen_salt('bf', 12));
    END IF;

    INSERT INTO members (
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
        p_dependants,
        p_wallet_balance,
        p_is_active,
        p_registration_date,
        v_pin_hash,
        CASE
            WHEN p_registration_date + INTERVAL '90 days' <= CURRENT_DATE THEN 'active'
            ELSE 'probation'
        END,
        p_registration_date + INTERVAL '90 days'
    ) RETURNING id INTO v_member_id;

    RETURN jsonb_build_object('success', true, 'id', v_member_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
