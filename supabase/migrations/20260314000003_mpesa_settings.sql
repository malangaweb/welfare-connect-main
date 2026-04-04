-- Migration: Add M-Pesa Settings and ensure settings table exists
-- Date: 2026-03-14

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name TEXT NOT NULL DEFAULT 'Malanga Welfare Society',
    organization_email TEXT,
    organization_phone TEXT,
    registration_fee NUMERIC DEFAULT 500,
    renewal_fee NUMERIC DEFAULT 200,
    penalty_amount NUMERIC DEFAULT 300,
    paybill_number TEXT,
    member_id_start INT DEFAULT 1,
    case_id_start INT DEFAULT 1,
    
    -- M-Pesa API Configuration
    mpesa_consumer_key TEXT,
    mpesa_consumer_secret TEXT,
    mpesa_passkey TEXT,
    mpesa_shortcode TEXT,
    mpesa_initiator_name TEXT,
    mpesa_initiator_password TEXT,
    mpesa_env TEXT DEFAULT 'sandbox' CHECK (mpesa_env IN ('sandbox', 'production')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure updated_at trigger exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_settings_updated_at') THEN
        CREATE TRIGGER update_settings_updated_at
            BEFORE UPDATE ON settings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Insert default settings if empty
INSERT INTO settings (id, organization_name)
SELECT gen_random_uuid(), 'Malanga Welfare Society'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Add missing columns if table already existed (idempotency)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_consumer_key TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_consumer_secret TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_passkey TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_shortcode TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_initiator_name TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_initiator_password TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mpesa_env TEXT DEFAULT 'sandbox';

-- Add check constraint if missing
DO $$
BEGIN
    ALTER TABLE settings ADD CONSTRAINT settings_mpesa_env_check CHECK (mpesa_env IN ('sandbox', 'production'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
