-- Add reference column to transactions table if it doesn't exist
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reference VARCHAR(255);

-- Add an index on reference for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
