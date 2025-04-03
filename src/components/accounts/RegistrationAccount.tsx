
import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import { supabase } from '@/integrations/supabase/client';

const RegistrationAccount = () => {
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
          .eq('transaction_type', 'registration')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform the data to match our Transaction type
        const formattedData: Transaction[] = data.map(item => ({
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  // For demo purposes, using mock data if needed
  const mockTransactions: Transaction[] = [
    {
      id: '1',
      memberId: '1',
      amount: 1000,
      transactionType: 'registration',
      createdAt: new Date('2023-09-05'),
      description: 'Registration fee for John Doe',
    },
    {
      id: '2',
      memberId: '2',
      amount: 1000,
      transactionType: 'registration',
      createdAt: new Date('2023-08-20'),
      description: 'Registration fee for Jane Smith',
    },
  ];

  // Use mock data if no real data is available yet
  const displayTransactions = transactions.length > 0 ? transactions : mockTransactions;

  return (
    <div className="space-y-6">
      <AccountSummaryCard 
        title="Registration Fees Account" 
        balance={totalBalance}
        credits={totalCredits}
        debits={totalDebits}
      />
      
      <AccountTransactionsList 
        transactions={displayTransactions}
        title="Registration Fees"
      />
    </div>
  );
};

export default RegistrationAccount;
