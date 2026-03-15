import { useState, useEffect, useRef, useMemo } from 'react';
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
import { TransactionReversalDialog } from '@/components/transactions/TransactionReversalDialog';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Transaction } from '@/lib/types';
import { supabase, supabaseAdmin } from '@/integrations/supabase/client';
import { persistentCache } from '@/lib/cache';
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
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get('memberId');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    // ⚡ Instant load: Start with cached data if it exists
    const cacheKey = memberId ? `transactions-${memberId}-${page}` : `transactions-all-${page}`;
    const cached = persistentCache.get<Transaction[]>(cacheKey);
    return cached || [];
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterType, setFilterType] = useState('all');
  
  // States for transaction editing
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [newCaseId, setNewCaseId] = useState('');
  const [cases, setCases] = useState<{id: string, caseNumber: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // States for transaction reversal
  const [reversalTx, setReversalTx] = useState<Transaction | null>(null);
  const [reversalDialogOpen, setReversalDialogOpen] = useState(false);

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };
  
  const fetchTransactions = async (pageNum: number = page) => {
    try {
      const cacheKey = memberId ? `transactions-${memberId}-${pageNum}` : `transactions-all-${pageNum}`;
      if (!persistentCache.has(cacheKey)) {
        setLoading(true);
      }

      let query = supabase.from('transactions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
        
      if (memberId) {
        query = query.eq('member_id', memberId);
      }
      
      const from = (pageNum - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      
      if (count !== null) {
        setTotalPages(Math.ceil(count / pageSize));
      }

      if (data) {
        const formattedTransactions: Transaction[] = data.map((t: any) => ({
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
        // Cache result for 5 mins
        persistentCache.set(cacheKey, formattedTransactions, 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(page);
  }, [page, memberId]); // Re-fetch on page or memberId change
  
  // Fetch cases for contribution editing
  useEffect(() => {
    if (editingTx && editingTx.transactionType === 'contribution') {
      (supabase as any)
        .from('cases')
        .select('id, case_number')
        .then(({ data }: any) => {
          setCases((data || []).map(c => ({ id: c.id, caseNumber: c.case_number })));
        });
    }
  }, [editingTx]);
  
  // Filter transactions based on search term and type
  const filteredTransactions = useMemo(() => transactions.filter(transaction => {
    const q = debouncedSearch.toLowerCase();
    const matchesSearch = 
      q === '' || 
      transaction.description.toLowerCase().includes(q) ||
      transaction.mpesaReference?.toLowerCase().includes(q);
      
    const matchesType = 
      filterType === 'all' || 
      transaction.transactionType === filterType;
      
    return matchesSearch && matchesType;
  }), [transactions, debouncedSearch, filterType]);
  
  // Edit handler
  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setNewDescription(tx.description);
    setNewCaseId(tx.caseId || '');
  };

  // Save handler
  const handleSave = async () => {
    if (!editingTx) return;
    
    setIsSaving(true);
    let description = newDescription;
    if (editingTx.transactionType === 'contribution' && newCaseId) {
      const selectedCase = cases.find(c => c.id === newCaseId);
      description = `Contribution for case: Case ${selectedCase?.caseNumber || ''}`;
    }
    try {
      // Using type assertion to work around Supabase type inference issues
      const supabaseAny = supabaseAdmin as any;
      const { error } = await supabaseAny
        .from('transactions')
        .update({
          description,
          case_id: newCaseId || undefined
        })
        .eq('id', editingTx.id);
      if (error) throw error;
      await fetchTransactions();
      setEditingTx(null);
      toast({ title: 'Success', description: 'Transaction updated.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update transaction.' });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Revert handler - opens reversal dialog
  const handleRevert = (tx: Transaction) => {
    setReversalTx(tx)
    setReversalDialogOpen(true)
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
              onChange={(e) => handleSearchChange(e.target.value)}
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(tx)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRevert(tx)}>
                Revert
              </Button>
            </div>
          )}
        />

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-8 pb-8">
            <Button 
              variant="outline" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <span className="text-sm font-medium">
              Page {page} of {totalPages}
            </span>
            <Button 
              variant="outline" 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next
            </Button>
          </div>
        )}

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
                <Button variant="outline" className="rounded-lg px-6 py-2" onClick={() => setEditingTx(null)} disabled={isSaving}>Cancel</Button>
                <Button className="rounded-lg px-6 py-2 font-semibold" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transaction Reversal Dialog */}
        <TransactionReversalDialog
          transaction={reversalTx}
          open={reversalDialogOpen}
          onOpenChange={(open) => {
            setReversalDialogOpen(open)
            if (!open) setReversalTx(null)
          }}
          onSuccess={() => {
            fetchTransactions()
            toast({
              title: 'Reversal successful',
              description: 'Transaction has been reversed',
            })
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
