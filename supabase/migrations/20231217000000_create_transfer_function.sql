-- Create a function to handle fund transfers between members
CREATE OR REPLACE FUNCTION public.transfer_funds(
  from_member_id uuid,
  to_member_id uuid,
  amount numeric,
  reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  from_balance numeric;
  to_balance numeric;
  from_member_name text;
  to_member_name text;
  from_member_number text;
  to_member_number text;
  transaction_id uuid;
  result jsonb;
BEGIN
  -- Start a transaction
  BEGIN
    -- Get sender's current balance and lock the row
    SELECT wallet_balance, name, member_number 
    INTO from_balance, from_member_name, from_member_number
    FROM members 
    WHERE id = from_member_id
    FOR UPDATE;
    
    -- Check if sender has sufficient balance
    IF from_balance < amount THEN
      RAISE EXCEPTION 'Insufficient funds for transfer';
    END IF;
    
    -- Get recipient's current balance and lock the row
    SELECT wallet_balance, name, member_number 
    INTO to_balance, to_member_name, to_member_number
    FROM members 
    WHERE id = to_member_id
    FOR UPDATE;
    
    -- Update sender's balance
    UPDATE members 
    SET wallet_balance = wallet_balance - amount
    WHERE id = from_member_id
    RETURNING wallet_balance INTO from_balance;
    
    -- Update recipient's balance
    UPDATE members 
    SET wallet_balance = wallet_balance + amount
    WHERE id = to_member_id
    RETURNING wallet_balance INTO to_balance;
    
    -- Create a transaction record for the sender (debit)
    INSERT INTO transactions (
      member_id,
      amount,
      transaction_type,
      description,
      reference,
      created_at
    ) VALUES (
      from_member_id,
      -amount, -- Negative amount for debit
      'wallet_transfer',
      COALESCE(reference, 'Transfer to ' || to_member_number),
      'TRF-' || gen_random_uuid(),
      NOW()
    )
    RETURNING id INTO transaction_id;
    
    -- Create a transaction record for the recipient (credit)
    INSERT INTO transactions (
      member_id,
      amount,
      transaction_type,
      description,
      reference,
      related_transaction_id,
      created_at
    ) VALUES (
      to_member_id,
      amount, -- Positive amount for credit
      'wallet_transfer',
      COALESCE(reference, 'Transfer from ' || from_member_number),
      'TRF-' || transaction_id,
      transaction_id,
      NOW()
    );
    
    -- Return success response
    result := jsonb_build_object(
      'success', true,
      'transaction_id', transaction_id,
      'from_balance', from_balance,
      'to_balance', to_balance,
      'message', 'Transfer completed successfully'
    );
    
    -- Commit the transaction
    RETURN result;
    
  EXCEPTION WHEN OTHERS THEN
    -- Rollback the transaction on error
    RAISE EXCEPTION 'Transfer failed: %', SQLERRM;
  END;
END;
$$;
