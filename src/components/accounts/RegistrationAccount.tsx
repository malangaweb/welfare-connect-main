import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import FeeCollectionDialog from './FeeCollectionDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

const RegistrationAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);
  const [defaultFee, setDefaultFee] = useState(1000); // Default registration fee amount

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      // First, try to get the default registration fee from settings if available
      const { data: settingsData } = await supabase
        .from('settings')
        .select('registration_fee')
        .single();
        
      if (settingsData?.registration_fee) {
        setDefaultFee(settingsData.registration_fee);
      }
      
      // Then get the transactions
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_type', 'registration')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our Transaction type
      const formattedData: Transaction[] = (data || []).map(item => ({
        id: item.id,
        memberId: item.member_id,
        caseId: item.case_id,
        amount: Number(item.amount),
        transactionType: item.transaction_type as 'registration',
        mpesaReference: item.mpesa_reference,
        createdAt: new Date(item.created_at),
        description: item.description || 'Registration fee',
      }));

      setTransactions(formattedData);
      
      // Calculate totals
      const credits = formattedData.reduce((acc, tx) => acc + tx.amount, 0);
      setTotalCredits(credits);
      setTotalBalance(credits); // For registration account, balance is just the sum of credits
      setTotalDebits(0); // No debits in registration account
    } catch (error) {
      console.error('Error fetching registration transactions:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load registration transactions."
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Handle successful fee collection
  const handleFeeCollectionSuccess = () => {
    fetchTransactions();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AccountSummaryCard 
          title="Registration Fees Account" 
          balance={totalBalance}
          credits={totalCredits}
          debits={totalDebits}
          isLoading={isLoading}
        />
        <div className="pl-4">
          <FeeCollectionDialog 
            feeType="registration"
            buttonLabel="Collect Registration Fee"
            defaultAmount={defaultFee}
            onSuccess={handleFeeCollectionSuccess}
          />
        </div>
      </div>
      
      <AccountTransactionsList 
        transactions={transactions}
        title="Registration Fees"
      />
    </div>
  );
};

export default RegistrationAccount;
