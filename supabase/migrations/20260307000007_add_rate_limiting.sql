-- Migration: Add rate limiting functions for authentication
-- Date: 2026-03-07
-- Purpose: Implement rate limiting to prevent brute force attacks
-- Phase: 4 (Security Hardening)

-- ============================================
-- LOGIN RATE LIMITING
-- ============================================

-- Create a table to track login attempts
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- username or email
  ip_address INET NOT NULL,
  attempt_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  was_successful BOOLEAN DEFAULT FALSE
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_time 
  ON login_attempts(identifier, attempt_time DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
  ON login_attempts(ip_address, attempt_time DESC);

-- Function to check if login is rate limited
CREATE OR REPLACE FUNCTION is_login_rate_limited(
  p_identifier TEXT,
  p_ip_address INET,
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 15
)
RETURNS TABLE (
  is_limited BOOLEAN,
  attempts_count INT,
  lockout_until TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_recent_attempts INT;
  v_lockout_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Count failed attempts in the last N minutes
  v_recent_attempts := COUNT(*)::INT FROM login_attempts
    WHERE identifier = p_identifier
    AND attempt_time > NOW() - (p_lockout_minutes || ' minutes')::INTERVAL
    AND was_successful = FALSE;

  IF v_recent_attempts >= p_max_attempts THEN
    v_lockout_time := (
      SELECT attempt_time + (p_lockout_minutes || ' minutes')::INTERVAL
      FROM login_attempts
      WHERE identifier = p_identifier
      AND attempt_time > NOW() - (p_lockout_minutes || ' minutes')::INTERVAL
      AND was_successful = FALSE
      ORDER BY attempt_time DESC
      LIMIT 1
    );
    RETURN QUERY SELECT TRUE, v_recent_attempts, v_lockout_time;
  ELSE
    RETURN QUERY SELECT FALSE, v_recent_attempts, NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_identifier TEXT,
  p_ip_address INET,
  p_was_successful BOOLEAN
)
RETURNS void AS $$
BEGIN
  INSERT INTO login_attempts (identifier, ip_address, was_successful, attempt_time)
  VALUES (p_identifier, p_ip_address, p_was_successful, CURRENT_TIMESTAMP);
  
  -- Clean up old records (older than 1 day)
  DELETE FROM login_attempts 
  WHERE attempt_time < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PIN ATTEMPT RATE LIMITING (for members)
-- ============================================

-- Function to check if member PIN is rate limited
CREATE OR REPLACE FUNCTION is_member_pin_locked(p_member_id UUID)
RETURNS TABLE (
  is_locked BOOLEAN,
  locked_until TIMESTAMP WITH TIME ZONE,
  attempts INT
) AS $$
BEGIN
  RETURN QUERY SELECT
    (pin_locked_until > CURRENT_TIMESTAMP),
    pin_locked_until,
    pin_attempts
  FROM members
  WHERE id = p_member_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to increment PIN attempts and lock if needed
CREATE OR REPLACE FUNCTION increment_pin_attempts(
  p_member_id UUID,
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 15
)
RETURNS void AS $$
DECLARE
  v_current_attempts INT;
BEGIN
  UPDATE members
  SET pin_attempts = pin_attempts + 1
  WHERE id = p_member_id;

  SELECT pin_attempts INTO v_current_attempts FROM members WHERE id = p_member_id;

  -- Lock account if max attempts reached
  IF v_current_attempts >= p_max_attempts THEN
    UPDATE members
    SET pin_locked_until = NOW() + (p_lockout_minutes || ' minutes')::INTERVAL
    WHERE id = p_member_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to reset PIN attempts on successful login
CREATE OR REPLACE FUNCTION reset_pin_attempts(p_member_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE members
  SET 
    pin_attempts = 0,
    pin_locked_until = NULL,
    last_login = CURRENT_TIMESTAMP
  WHERE id = p_member_id;
END;
$$ LANGUAGE plpgsql;