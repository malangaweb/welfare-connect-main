
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Transaction } from '@/lib/types';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  RefreshCw, 
  UserPlus, 
  AlertCircle, 
  CreditCard
} from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

const TransactionDetailModal = ({ transaction, isOpen, onClose }: TransactionDetailModalProps) => {
  if (!transaction) return null;

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'contribution':
        return <ArrowUpRight className="h-6 w-6 text-green-500" />;
      case 'disbursement':
        return <ArrowDownLeft className="h-6 w-6 text-red-500" />;
      case 'registration':
        return <UserPlus className="h-6 w-6 text-blue-500" />;
      case 'renewal':
        return <RefreshCw className="h-6 w-6 text-purple-500" />;
      case 'penalty':
        return <AlertCircle className="h-6 w-6 text-amber-500" />;
      case 'wallet_funding':
        return <Wallet className="h-6 w-6 text-emerald-500" />;
      default:
        return <CreditCard className="h-6 w-6 text-gray-500" />;
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

  const getTransactionTypeClass = (type: string) => {
    switch (type) {
      case 'contribution':
        return 'bg-green-100 text-green-800';
      case 'disbursement':
        return 'bg-red-100 text-red-800';
      case 'registration':
        return 'bg-blue-100 text-blue-800';
      case 'renewal':
        return 'bg-purple-100 text-purple-800';
      case 'penalty':
        return 'bg-amber-100 text-amber-800';
      case 'wallet_funding':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Transaction ID: {transaction.id.substring(0, 8)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              {getTransactionIcon(transaction.transactionType)}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Type</p>
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTransactionTypeClass(transaction.transactionType)}`}>
                  {getTransactionTitle(transaction.transactionType)}
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Amount</p>
              <p className={`font-semibold ${
                ['contribution', 'registration', 'renewal', 'penalty', 'wallet_funding'].includes(transaction.transactionType) 
                  ? 'text-green-600' 
                  : 'text-red-600'
              }`}>
                {['contribution', 'registration', 'renewal', 'penalty', 'wallet_funding'].includes(transaction.transactionType) ? '+' : '-'}
                KES {transaction.amount.toLocaleString()}
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p className="font-medium">{format(transaction.createdAt, 'PPP')}</p>
              <p className="text-xs text-muted-foreground">{format(transaction.createdAt, 'h:mm a')}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Member ID</p>
              <p className="font-medium">{transaction.memberId}</p>
            </div>
            
            {transaction.caseId && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Case ID</p>
                <p className="font-medium">{transaction.caseId}</p>
              </div>
            )}
            
            {transaction.mpesaReference && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">M-Pesa Reference</p>
                <p className="font-medium">{transaction.mpesaReference}</p>
              </div>
            )}
          </div>
          
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Description</p>
            <p className="text-sm">{transaction.description}</p>
          </div>
        </div>
        
        <DialogClose asChild>
          <Button className="w-full">Close</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDetailModal;
