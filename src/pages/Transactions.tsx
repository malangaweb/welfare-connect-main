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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';

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
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [newCaseId, setNewCaseId] = useState('');
  const [cases, setCases] = useState<{ id: string; caseNumber: string }[]>([]);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get('memberId');
  
  const fetchTransactions = async () => {
    try {
      let query = supabase.from('transactions').select('*').order('created_at', { ascending: false });
      if (memberId) {
        query = query.eq('member_id', memberId);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        const formattedTransactions: Transaction[] = data.map(t => ({
          id: t.id,
          memberId: t.member_id,
          caseId: t.case_id || undefined,
          amount: ['registration', 'renewal', 'penalty', 'contribution', 'arrears'].includes(String(t.transaction_type || '').toLowerCase())
            ? -Math.abs(Number(t.amount) || 0)
            : Number(t.amount),
          transactionType: t.transaction_type as "contribution" | "registration" | "renewal" | "penalty" | "arrears" | "wallet_funding" | "disbursement",
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

  useEffect(() => {
    fetchTransactions();
  }, []);
  
  // Fetch cases for contribution editing
  useEffect(() => {
    if (editingTx && editingTx.transactionType === 'contribution') {
      supabase
        .from('cases')
        .select('id, case_number')
        .then(({ data }) => {
          setCases((data || []).map(c => ({ id: c.id, caseNumber: c.case_number })));
        });
    }
  }, [editingTx]);
  
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
  
  // Edit handler
  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setNewDescription(tx.description);
    setNewCaseId(tx.caseId || '');
  };

  // Save handler
  const handleSave = async () => {
    let description = newDescription;
    let updateObj: any = { description };
    if (editingTx?.transactionType === 'contribution' && newCaseId) {
      const selectedCase = cases.find(c => c.id === newCaseId);
      description = `Contribution for case: Case ${selectedCase?.caseNumber || ''}`;
      updateObj = { ...updateObj, description, case_id: newCaseId };
    }
    try {
      const { error } = await supabase
        .from('transactions')
        .update(updateObj)
        .eq('id', editingTx?.id);
      if (error) throw error;
      await fetchTransactions();
      setEditingTx(null);
      toast({ title: 'Success', description: 'Transaction updated.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update transaction.' });
    }
  };
  
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
          renderAction={(tx) => (
            <Button variant="outline" size="sm" onClick={() => handleEdit(tx)}>
              Edit
            </Button>
          )}
        />

        {/* Edit Transaction Dialog */}
        <Dialog open={!!editingTx} onOpenChange={() => setEditingTx(null)}>
          <DialogContent className="max-w-md bg-gradient-to-br from-white via-blue-50 to-gray-100 rounded-2xl shadow-xl p-0">
            <div className="p-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold mb-2 text-primary">Edit Transaction</DialogTitle>
              </DialogHeader>
              {editingTx && (
                <div className="space-y-6 mt-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label className="text-sm font-semibold">Type</Label>
                      <div className="font-medium text-base mt-1 text-muted-foreground">{editingTx.transactionType}</div>
                    </div>
                    {editingTx.transactionType === 'contribution' && (
                      <div>
                        <Label htmlFor="case" className="text-sm font-semibold">Case Number</Label>
                        <select
                          id="case"
                          className="w-full border rounded-lg p-2 mt-1 bg-white"
                          value={newCaseId}
                          onChange={e => setNewCaseId(e.target.value)}
                        >
                          <option value="">Select Case</option>
                          {cases.map(c => (
                            <option key={c.id} value={c.id}>{c.caseNumber}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="desc" className="text-sm font-semibold">Description</Label>
                      <select
                        id="desc"
                        className="w-full border rounded-lg p-2 mt-1 bg-white"
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                      >
                        <option value="Registration fee">Registration fee</option>
                        <option value="Renewal">Renewal</option>
                        <option value="Penalty">Penalty</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="mt-8 flex justify-end gap-4">
                <Button variant="outline" className="rounded-lg px-6 py-2" onClick={() => setEditingTx(null)}>Cancel</Button>
                <Button className="rounded-lg px-6 py-2 font-semibold" onClick={handleSave}>Save</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
