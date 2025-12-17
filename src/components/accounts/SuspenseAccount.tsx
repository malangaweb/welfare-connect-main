import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/types';
import AccountSummaryCard from './AccountSummaryCard';
import { TransferToMemberDialog } from './TransferToMemberDialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import AccountTransactionsList from './AccountTransactionsList';

const SuspenseAccount = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalDebits, setTotalDebits] = useState(0);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const fetchSuspenseTransactions = async () => {
    setIsLoading(true);
    
    try {
      console.log('Fetching all wrong M-PESA transactions...');
      // Fetch all unresolved wrong M-PESA transactions
      const { data: allTransactions, error } = await supabase
        .from('wrong_mpesa_transactions')
        .select('*')
        .is('resolved_at', null)  // Only get unresolved transactions
        .order('created_at', { ascending: false });
        
      console.log('All M-PESA transactions:', allTransactions);
      
      if (error) {
        console.error('Error fetching transactions:', error);
        throw error;
      }
      
      // Transform transactions to match the expected format
      const transactions = (allTransactions || []).map(tx => ({
        id: tx.id,
        memberId: tx.member_id || 'unknown',
        amount: Number(tx.trans_amount) || 0,
        transactionType: 'suspense' as const,
        mpesaReference: tx.trans_id,
        createdAt: new Date(tx.trans_time || tx.created_at),
        description: `M-PESA ${tx.transaction_type || 'transaction'} - ${tx.error_reason || 'No error'}`,
        status: tx.resolved_at ? 'RESOLVED' : 'PENDING_REVIEW',
        phoneNumber: tx.msisdn || 'N/A',
        payerName: [tx.first_name, tx.middle_name, tx.last_name].filter(Boolean).join(' ') || 'Unknown Payer',
        // Include additional fields that might be useful
        billRefNumber: tx.bill_ref_number,
        businessShortCode: tx.business_shortcode,
        orgAccountBalance: tx.org_account_balance,
        rawData: tx.raw_payload
      }));
      
      // Calculate totals (only from pending transactions)
      const pendingTransactions = transactions.filter(tx => !tx.resolved_at);
      const total = pendingTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      setTotalBalance(total);
      setTotalCredits(total);
      setTotalDebits(0);
      
      console.log('Processed transactions:', transactions);
      setTransactions(transactions);
      
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


  // Fallback data in case of errors
  const mockTransactions: Transaction[] = [];
  const mockBalance = 0;
  const mockCredits = 0;
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
      
      <div className="border rounded-lg p-4 bg-white">
        <h3 className="text-lg font-medium mb-4">Suspense Transactions</h3>
        {isLoading ? (
          <div className="text-center py-4">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No transactions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {tx.mpesaReference || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tx.payerName}
                    </td>
                 
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      KES {tx.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge 
                        variant={tx.resolved_at ? 'success' : 'warning'}
                        className="capitalize"
                      >
                        {tx.resolved_at ? 'resolved' : 'pending'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {tx.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {!tx.resolved_at && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedTransaction(tx);
                            setTransferDialogOpen(true);
                          }}
                        >
                          Transfer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TransferToMemberDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transaction={selectedTransaction}
        onSuccess={fetchSuspenseTransactions}
      />
    </div>
  );
};

export default SuspenseAccount;
