
import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import { supabase } from '@/integrations/supabase/client';

const RenewalAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);

  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('transaction_type', 'renewal')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform the data to match our Transaction type
        const formattedData: Transaction[] = data.map(item => ({
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  // For demo purposes, using mock data if needed
  const mockTransactions: Transaction[] = [
    {
      id: '3',
      memberId: '1',
      amount: 500,
      transactionType: 'renewal',
      createdAt: new Date('2024-01-15'),
      description: 'Annual renewal fee for John Doe',
    },
    {
      id: '4',
      memberId: '2',
      amount: 500,
      transactionType: 'renewal',
      createdAt: new Date('2024-02-20'),
      description: 'Annual renewal fee for Jane Smith',
    },
  ];

  // Use mock data if no real data is available yet
  const displayTransactions = transactions.length > 0 ? transactions : mockTransactions;

  return (
    <div className="space-y-6">
      <AccountSummaryCard 
        title="Renewal Fees Account" 
        balance={totalBalance}
        credits={totalCredits}
        debits={totalDebits}
      />
      
      <AccountTransactionsList 
        transactions={displayTransactions}
        title="Renewal Fees"
      />
    </div>
  );
};

export default RenewalAccount;
