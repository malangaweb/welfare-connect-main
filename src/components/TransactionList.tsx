import { useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  RefreshCw,
  UserPlus,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { Transaction } from '@/lib/types';
import TransactionDetailModal from './TransactionDetailModal';
import { Skeleton } from '@/components/ui/skeleton';

interface TransactionListProps {
  transactions: Transaction[];
  loading?: boolean;
}

const TransactionList = ({ transactions, loading = false }: TransactionListProps) => {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'contribution':
        return <ArrowUpRight className="h-4 w-4 text-green-500" />;
      case 'disbursement':
        return <ArrowDownLeft className="h-4 w-4 text-red-500" />;
      case 'registration':
        return <UserPlus className="h-4 w-4 text-blue-500" />;
      case 'renewal':
        return <RefreshCw className="h-4 w-4 text-purple-500" />;
      case 'penalty':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'wallet_funding':
        return <Wallet className="h-4 w-4 text-emerald-500" />;
      default:
        return <CreditCard className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTransactionTitle = (type: string) => {
    switch (type) {
      case 'contribution':
        return 'Case Contribution';
      case 'disbursement':
        return 'Case Disbursement';
      case 'registration':
        return 'Registration Fee';
      case 'renewal':
        return 'Annual Renewal';
      case 'penalty':
        return 'Penalty Payment';
      case 'wallet_funding':
        return 'Wallet Funding';
      default:
        return 'Transaction';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div>
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="text-right">
                <Skeleton className="h-5 w-24 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {transactions.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-muted-foreground">No transactions found</p>
        </div>
      ) : (
        transactions.map((transaction) => (
          <div 
            key={transaction.id} 
            className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/10 transition-colors cursor-pointer"
            onClick={() => handleTransactionClick(transaction)}
          >
            <div className="flex items-center space-x-4">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                {getTransactionIcon(transaction.transactionType)}
              </div>
              <div>
                <p className="font-medium">{getTransactionTitle(transaction.transactionType)}</p>
                <p className="text-sm text-muted-foreground">{transaction.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-medium ${
                ['contribution', 'registration', 'renewal', 'penalty', 'wallet_funding'].includes(transaction.transactionType) 
                  ? 'text-green-600' 
                  : 'text-red-600'
              }`}>
                {['contribution', 'registration', 'renewal', 'penalty', 'wallet_funding'].includes(transaction.transactionType) ? '+' : '-'}
                KES {transaction.amount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(transaction.createdAt, 'MMM d, yyyy HH:mm')}
              </p>
              {transaction.mpesaReference && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ref: {transaction.mpesaReference}
                </p>
              )}
            </div>
          </div>
        ))
      )}

      <TransactionDetailModal 
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default TransactionList;
