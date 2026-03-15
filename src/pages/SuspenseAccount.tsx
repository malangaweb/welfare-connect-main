import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface SuspenseTransaction {
  id: string;
  mpesa_receipt_number: string;
  phone_number: string;
  amount: number;
  sender_name: string;
  transaction_date: string;
  status: 'pending' | 'matched' | 'reversed' | 'ignored';
  notes: string;
}

const SuspenseAccount = () => {
  const [transactions, setTransactions] = useState<SuspenseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [matching, setMatching] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wrong_mpesa_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching suspense transactions:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleAutoMatch = async () => {
    setMatching(true);
    try {
      const { data, error } = await (supabase as any).rpc('match_suspense_transactions');
      if (error) throw error;
      
      toast({
        title: 'Auto-matching complete',
        description: `Successfully matched ${data} transactions to members.`,
      });
      fetchTransactions();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Match failed', description: error.message });
    } finally {
      setMatching(false);
    }
  };

  const filteredTransactions = transactions.filter(t => 
    t.mpesa_receipt_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone_number.includes(searchTerm) ||
    t.sender_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Suspense Account</h1>
            <p className="text-muted-foreground">Manage M-Pesa payments that couldn't be automatically linked to members.</p>
          </div>
          <Button onClick={handleAutoMatch} disabled={matching} className="bg-blue-600 hover:bg-blue-700">
            {matching ? (
              <>
                <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                Matching...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Run Auto-Match
              </>
            )}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by receipt, phone or sender..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8">
                <RotateCcw className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Sender / Phone</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No suspense transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          {new Date(tx.transaction_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold">{tx.mpesa_receipt_number}</TableCell>
                        <TableCell>
                          <div className="font-medium">{tx.sender_name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{tx.phone_number}</div>
                        </TableCell>
                        <TableCell className="font-bold">KSh {tx.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={
                            tx.status === 'pending' ? 'outline' : 
                            tx.status === 'matched' ? 'success' as any :
                            tx.status === 'reversed' ? 'destructive' : 'secondary'
                          }>
                            {tx.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Details</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SuspenseAccount;
