
import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import { DbTransaction } from '@/lib/db-types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import { supabase } from '@/integrations/supabase/client';
import { TRANSACTION_LIST_COLUMNS } from '@/lib/supabaseSelectColumns';

const PenaltyAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);

  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase
          .from('transactions')
          .select(TRANSACTION_LIST_COLUMNS)
          .eq('transaction_type', 'penalty')
          .in('status', ['completed', 'success'])
          .order('created_at', { ascending: false })) as { data: DbTransaction[] | null; error: any };

        if (error) throw error;

        // Transform the data to match our Transaction type
        const formattedData: Transaction[] = (data || []).map(item => ({
          id: item.id,
          memberId: item.member_id,
          caseId: item.case_id,
          amount: Number(item.amount),
          transactionType: item.transaction_type as 'penalty',
          mpesaReference: item.mpesa_reference,
          createdAt: new Date(item.created_at),
          description: item.description || 'Penalty fee for account reactivation',
        }));

        setTransactions(formattedData);
        
        // Calculate totals
        const credits = formattedData.reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
        setTotalCredits(credits);
        setTotalBalance(credits); // For penalty account, balance is just the sum of credits
        setTotalDebits(0); // No debits in penalty account typically
      } catch (error) {
        console.error('Error fetching penalty transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  return (
    <div className="space-y-6">
      <AccountSummaryCard 
        title="Penalty Fees Account" 
        balance={totalBalance}
        credits={totalCredits}
        debits={totalDebits}
      />
      
      <AccountTransactionsList 
        transactions={transactions}
        title="Penalty Fees"
      />
    </div>
  );
};

export default PenaltyAccount;
