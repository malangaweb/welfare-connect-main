import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import FeeCollectionDialog from './FeeCollectionDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

const RenewalAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);
  const [defaultFee, setDefaultFee] = useState(500); // Default renewal fee amount

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      // First, try to get the default renewal fee from settings if available
      const { data: settingsData } = await supabase
        .from('settings')
        .select('renewal_fee')
        .single();
        
      if (settingsData?.renewal_fee) {
        setDefaultFee(settingsData.renewal_fee);
      }
      
      // Then get the transactions
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_type', 'renewal')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our Transaction type
      const formattedData: Transaction[] = (data || []).map(item => ({
        id: item.id,
        memberId: item.member_id,
        caseId: item.case_id,
        amount: Number(item.amount),
        transactionType: item.transaction_type as 'renewal',
        mpesaReference: item.mpesa_reference,
        createdAt: new Date(item.created_at),
        description: item.description || 'Annual renewal fee',
      }));

      setTransactions(formattedData);
      
      // Calculate totals
      const credits = formattedData.reduce((acc, tx) => acc + tx.amount, 0);
      setTotalCredits(credits);
      setTotalBalance(credits); // For renewal account, balance is just the sum of credits
      setTotalDebits(0); // No debits in renewal account typically
    } catch (error) {
      console.error('Error fetching renewal transactions:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load renewal transactions."
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
          title="Renewal Fees Account" 
          balance={totalBalance}
          credits={totalCredits}
          debits={totalDebits}
          isLoading={isLoading}
        />
        <div className="pl-4">
          <FeeCollectionDialog 
            feeType="renewal"
            buttonLabel="Collect Renewal Fee"
            defaultAmount={defaultFee}
            onSuccess={handleFeeCollectionSuccess}
          />
        </div>
      </div>
      
      <AccountTransactionsList 
        transactions={transactions}
        title="Renewal Fees"
      />
    </div>
  );
};

export default RenewalAccount;
