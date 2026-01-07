import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import FeeCollectionDialog from './FeeCollectionDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

const RegistrationAccount = () => {
  const [defaultFee, setDefaultFee] = useState(1000); // Default registration fee amount
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchDefaultFee = async () => {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('registration_fee')
        .single();
      if (settingsData?.registration_fee) {
        setDefaultFee(settingsData.registration_fee);
      }
    };
    fetchDefaultFee();
  }, []);

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
        <div className="pl-4">
          <FeeCollectionDialog 
            feeType="registration"
            buttonLabel="Collect Registration Fee"
            defaultAmount={defaultFee}
            onSuccess={() => {}}
          />
        </div>
      </div>
      
      <AccountTransactionsList 
        title="Registration Fees"
      />
    </div>
  );
};

export default RegistrationAccount;
