import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import AccountTransactionsList from './AccountTransactionsList';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

const SuspenseAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);

  const fetchSuspenseTransactions = async () => {
    setIsLoading(true);
    
    try {
      // In a real implementation, you would fetch actual suspense transactions
      // For now, we'll query transactions marked as suspense
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_type', 'suspense')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Transform data to match Transaction type
      const transformedData = (data || []).map(tx => ({
        id: tx.id,
        memberId: tx.member_id || 'unknown',
        amount: tx.amount,
        transactionType: tx.transaction_type,
        mpesaReference: tx.mpesa_reference,
        createdAt: new Date(tx.created_at),
        description: tx.description
      }));
      
      setTransactions(transformedData);
      
      // Calculate totals
      const credits = transformedData.reduce((sum, tx) => sum + tx.amount, 0);
      setTotalBalance(credits);
      setTotalCredits(credits);
      setTotalDebits(0);
    } catch (error) {
      console.error('Error fetching suspense transactions:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load suspense transactions."
      });
      
      // Use mock data if fetching fails
      setTransactions(mockTransactions);
      setTotalBalance(mockBalance);
      setTotalCredits(mockCredits);
      setTotalDebits(mockDebits);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuspenseTransactions();
  }, []);

  // Handle successful transaction assignment
  const handleTransactionAssigned = () => {
    toast({
      title: "Success",
      description: "Transaction has been assigned to the member."
    });
    fetchSuspenseTransactions();
  };

  // Mock data for suspense account (fallback)
  const mockTransactions: Transaction[] = [
    {
      id: '7',
      memberId: '12345', // This could be a temporary ID until member is identified
      amount: 2000,
      transactionType: 'suspense',
      mpesaReference: 'XYZ789012',
      createdAt: new Date('2024-01-20'),
      description: 'Unidentified payment - incorrect member number',
    },
    {
      id: '8',
      memberId: '67890', // This could be a temporary ID until member is identified
      amount: 1500,
      transactionType: 'suspense',
      mpesaReference: 'ABC456789',
      createdAt: new Date('2024-02-15'),
      description: 'Unidentified payment - missing details',
    },
  ];

  // Mock calculations for suspense account
  const mockBalance = 3500;
  const mockCredits = 3500;
  const mockDebits = 0;

  return (
    <div className="space-y-6">
      <AccountSummaryCard 
        title="Suspense Account" 
        balance={totalBalance}
        credits={totalCredits}
        debits={totalDebits}
        isLoading={isLoading}
      />
      
      <AccountTransactionsList 
        transactions={transactions}
        title="Suspense Account"
        isSuspenseAccount={true}
        onTransactionAssigned={handleTransactionAssigned}
      />
    </div>
  );
};

export default SuspenseAccount;
