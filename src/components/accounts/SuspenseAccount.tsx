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
      // First, get all members to check their names and member numbers
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, name, member_number');
        
      if (membersError) throw membersError;
      
      // Create a list of all member identifiers (names and member numbers)
      const memberIdentifiers = membersData.map(member => ({
        id: member.id,
        name: member.name.toLowerCase(),
        memberNumber: member.member_number.toLowerCase()
      }));
      
      // Get all transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (transactionsError) throw transactionsError;
      
      // Filter transactions that are not associated with any member
      const suspenseTransactions = (transactionsData || []).filter(tx => {
        const description = tx.description?.toLowerCase() || '';
        
        // Check if the description contains any member name or member number
        const isAssociatedWithMember = memberIdentifiers.some(member => 
          description.includes(member.name) || 
          description.includes(member.memberNumber) ||
          description.includes(member.id)
        );
        
        // Also check if the transaction has a member_id but the description doesn't match any member
        const hasMemberId = tx.member_id && tx.member_id !== 'unknown';
        const memberExists = hasMemberId ? memberIdentifiers.find(m => m.id === tx.member_id) : false;
        
        // Transaction is in suspense if:
        // 1. Description doesn't contain any member identifier, OR
        // 2. Has member_id but that member doesn't exist in our system, OR
        // 3. Description is empty or unclear
        return !isAssociatedWithMember || 
               (hasMemberId && !memberExists) || 
               !description || 
               description.trim() === '';
      });
      
      // Transform data to match Transaction type
      const transformedData = suspenseTransactions.map(tx => ({
        id: tx.id,
        memberId: tx.member_id || 'unknown',
        amount: tx.amount,
        transactionType: 'suspense' as const,
        mpesaReference: tx.mpesa_reference,
        createdAt: new Date(tx.created_at),
        description: tx.description || 'No description provided'
      }));
      
      setTransactions(transformedData);
      
      // Calculate totals
      const credits = transformedData.reduce((sum, tx) => sum + tx.amount, 0);
      setTotalBalance(credits);
      setTotalCredits(credits);
      setTotalDebits(0);
      
      console.log('Suspense transactions found:', transformedData.length);
      console.log('Member identifiers:', memberIdentifiers.length);
      
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
        title="Suspense Account"
      />
    </div>
  );
};

export default SuspenseAccount;
