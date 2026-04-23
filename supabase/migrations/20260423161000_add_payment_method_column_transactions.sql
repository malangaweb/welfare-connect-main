-- Restore compatibility with app/functions that read/write transactions.payment_method.
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN public.transactions.payment_method IS
'Optional payment channel/method (e.g. mpesa, wallet, cash, manual).';
