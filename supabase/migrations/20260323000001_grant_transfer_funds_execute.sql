-- Grant execute permission for wallet-to-wallet transfers
-- (needed because transfer_funds was created without an explicit GRANT)
GRANT EXECUTE ON FUNCTION public.transfer_funds(uuid, uuid, numeric, text) TO authenticated;

