import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import { supabase } from '@/integrations/supabase/client';

const RegistrationAccount = () => {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchTotal = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount')
        .ilike('description', 'Registration%');
      if (!error && data) {
        const sum = data.reduce((acc, tx) => acc + Math.abs(Number(tx.amount) || 0), 0);
        setTotal(sum);
      }
    };
    fetchTotal();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AccountSummaryCard 
          title="Registration Fees Account" 
          balance={total}
          credits={total}
          debits={0}
          isLoading={false}
        />
      </div>
      
      <AccountTransactionsList 
        title="Registration Fees"
      />
    </div>
  );
};

export default RegistrationAccount;
