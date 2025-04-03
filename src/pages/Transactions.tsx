
import { useState, useEffect } from 'react';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TransactionList from '@/components/TransactionList';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Transaction } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

const transactionTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'contribution', label: 'Contribution' },
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'registration', label: 'Registration' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'wallet_funding', label: 'Wallet Funding' },
];

const Transactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  // Fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        
        if (data) {
          const formattedTransactions: Transaction[] = data.map(t => ({
            id: t.id,
            memberId: t.member_id,
            caseId: t.case_id || undefined,
            amount: Number(t.amount),
            transactionType: t.transaction_type as "contribution" | "registration" | "renewal" | "penalty" | "wallet_funding" | "disbursement",
            mpesaReference: t.mpesa_reference || undefined,
            createdAt: new Date(t.created_at),
            description: t.description || '',
          }));
          
          setTransactions(formattedTransactions);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTransactions();
  }, []);
  
  // Filter transactions based on search term and type
  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = 
      searchTerm === '' || 
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.mpesaReference?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesType = 
      filterType === 'all' || 
      transaction.transactionType === filterType;
      
    return matchesSearch && matchesType;
  });
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Transaction
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search transactions..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select 
            defaultValue="all" 
            onValueChange={(value) => setFilterType(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {transactionTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <TransactionList 
          transactions={filteredTransactions} 
          loading={loading} 
        />
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
