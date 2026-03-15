import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/components/ui/use-toast'
import { Search, CheckCircle, XCircle, User, RefreshCw, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

interface WrongMpesaTransaction {
  id: string
  mpesa_receipt_number: string
  phone_number: string
  amount: number
  sender_name: string
  transaction_date: string
  status: 'pending' | 'matched' | 'reversed' | 'ignored'
  matched_member_id?: string
  matched_at?: string
  notes?: string
  matched_member?: {
    name: string
    member_number: string
  }
}

interface Member {
  id: string
  member_number: string
  name: string
  phone_number: string
}

export function SuspenseManagement() {
  const [transactions, setTransactions] = useState<WrongMpesaTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchPhone, setSearchPhone] = useState('')
  const [isMatching, setIsMatching] = useState(false)
  const [tableExists, setTableExists] = useState(false)
  
  // Member search dialog state
  const [selectedTransaction, setSelectedTransaction] = useState<WrongMpesaTransaction | null>(null)
  const [memberSearchOpen, setMemberSearchOpen] = useState(false)
  const [memberSearchTerm, setMemberSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const checkTableExists = async () => {
    try {
      const { data, error } = await supabase
        .from('wrong_mpesa_transactions')
        .select('id')
        .limit(1)
      
      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist
          setTableExists(false)
          return false
        }
        throw error
      }
      
      setTableExists(true)
      return true
    } catch (error: any) {
      console.error('Error checking table:', error)
      setTableExists(false)
      return false
    }
  }

  const fetchSuspenseTransactions = async () => {
    const exists = await checkTableExists()
    if (!exists) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('wrong_mpesa_transactions')
        .select(`
          *,
          matched_member:matched_member_id (
            id,
            name,
            member_number
          )
        `)
        .order('transaction_date', { ascending: false })

      if (error) throw error

      setTransactions(data || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading suspense transactions',
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAutoMatch = async () => {
    setIsMatching(true)
    try {
      const { data, error } = await supabase.rpc('match_suspense_transactions')

      if (error) throw error

      const matchCount = typeof data === 'number' ? data : 0

      toast({
        title: 'Auto-match complete',
        description: `${matchCount} transaction(s) matched and processed`,
      })

      await fetchSuspenseTransactions()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Auto-match failed',
        description: error.message,
      })
    } finally {
      setIsMatching(false)
    }
  }

  const handleManualMatch = async (memberId: string) => {
    if (!selectedTransaction) return

    setIsMatching(true)
    try {
      // Update suspense record
      const { error: updateError } = await supabase
        .from('wrong_mpesa_transactions')
        .update({
          status: 'matched',
          matched_member_id: memberId,
          matched_at: new Date().toISOString(),
        })
        .eq('id', selectedTransaction.id)

      if (updateError) throw updateError

      // Create wallet funding transaction
      const { error: txError } = await supabase.from('transactions').insert({
        member_id: memberId,
        amount: selectedTransaction.amount,
        transaction_type: 'wallet_funding',
        mpesa_reference: selectedTransaction.mpesa_receipt_number,
        description: `M-Pesa payment matched from suspense (${selectedTransaction.phone_number})`,
        status: 'completed',
        created_at: selectedTransaction.transaction_date,
      })

      if (txError) throw txError

      // Update member wallet balance
      const { error: balanceError } = await supabase.rpc('update_wallet_balance', {
        p_member_id: memberId,
        p_amount: selectedTransaction.amount,
        p_transaction_type: 'deposit',
      })

      if (balanceError) throw balanceError

      toast({
        title: 'Transaction matched successfully',
        description: `Payment allocated to member account`,
      })

      setMemberSearchOpen(false)
      setSelectedTransaction(null)
      await fetchSuspenseTransactions()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Match failed',
        description: error.message,
      })
    } finally {
      setIsMatching(false)
    }
  }

  const handleReverse = async (transactionId: string) => {
    if (!confirm('Are you sure you want to mark this transaction as reversed?')) return

    try {
      const { error } = await supabase
        .from('wrong_mpesa_transactions')
        .update({ status: 'reversed' })
        .eq('id', transactionId)

      if (error) throw error

      toast({
        title: 'Transaction marked as reversed',
        description: 'This transaction will no longer appear in pending list',
      })

      await fetchSuspenseTransactions()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reversal failed',
        description: error.message,
      })
    }
  }

  const handleIgnore = async (transactionId: string) => {
    if (!confirm('Mark this transaction as ignored?')) return

    try {
      const { error } = await supabase
        .from('wrong_mpesa_transactions')
        .update({ status: 'ignored' })
        .eq('id', transactionId)

      if (error) throw error

      toast({
        title: 'Transaction ignored',
      })

      await fetchSuspenseTransactions()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to ignore transaction',
        description: error.message,
      })
    }
  }

  const openMemberSearch = (transaction: WrongMpesaTransaction) => {
    setSelectedTransaction(transaction)
    setMemberSearchTerm('')
    setSearchResults([])
    setMemberSearchOpen(true)
  }

  const searchMembers = async () => {
    if (!memberSearchTerm.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, member_number, name, phone_number')
        .or(`phone_number.ilike.%${memberSearchTerm}%,member_number.ilike.%${memberSearchTerm}%,name.ilike.%${memberSearchTerm}%`)
        .limit(10)

      if (error) throw error

      setSearchResults(data || [])
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Search failed',
        description: error.message,
      })
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    fetchSuspenseTransactions()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (memberSearchOpen) {
        searchMembers()
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [memberSearchTerm, memberSearchOpen])

  const filteredTransactions = transactions.filter((t) =>
    (t.phone_number?.includes(searchPhone) ?? false) ||
    (t.mpesa_receipt_number?.toLowerCase().includes(searchPhone.toLowerCase()) ?? false)
  )

  const pendingCount = transactions.filter((t) => t.status === 'pending').length

  return (
    <>
      {!tableExists ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <CardTitle className="text-red-900">Suspense Account Table Not Found</CardTitle>
                <CardDescription className="text-red-700">
                  The required database table needs to be created first
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-red-800">
                The <code className="bg-red-100 px-2 py-1 rounded">wrong_mpesa_transactions</code> table doesn't exist in your database yet.
                Please run the SQL migration to create it.
              </p>
              
              <div className="bg-white border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2">How to fix:</h4>
                <ol className="text-sm text-red-800 space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new" target="_blank" rel="noopener noreferrer" className="underline font-medium">Supabase SQL Editor</a></li>
                  <li>Copy the SQL below</li>
                  <li>Paste and click <strong>Run</strong></li>
                  <li>Refresh this page</li>
                </ol>
              </div>

              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs font-mono">
{`CREATE TABLE IF NOT EXISTS wrong_mpesa_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mpesa_receipt_number VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    sender_name VARCHAR(255),
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'reversed', 'ignored')),
    matched_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    matched_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_phone ON wrong_mpesa_transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_status ON wrong_mpesa_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_matched ON wrong_mpesa_transactions(matched_member_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_wrong_mpesa_updated_at') THEN
        CREATE TRIGGER update_wrong_mpesa_updated_at
            BEFORE UPDATE ON wrong_mpesa_transactions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;`}
                </pre>
              </div>

              <Button onClick={fetchSuspenseTransactions} className="bg-red-600 hover:bg-red-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Suspense Account Management</CardTitle>
              <CardDescription>
                Manage unmatched M-Pesa payments and allocate to member accounts
              </CardDescription>
            </div>
            <Button onClick={handleAutoMatch} disabled={isMatching || pendingCount === 0}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isMatching ? 'animate-spin' : ''}`} />
              Auto-Match All ({pendingCount} pending)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone number or M-Pesa receipt..."
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>M-Pesa Receipt</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading suspense transactions...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No suspense transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">{tx.mpesa_receipt_number}</TableCell>
                      <TableCell>{tx.phone_number}</TableCell>
                      <TableCell className="text-right font-medium">
                        KES {tx.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {new Date(tx.transaction_date).toLocaleDateString('en-KE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tx.status === 'pending'
                              ? 'secondary'
                              : tx.status === 'matched'
                                ? 'default'
                                : tx.status === 'reversed'
                                  ? 'destructive'
                                  : 'outline'
                          }
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {tx.matched_member ? (
                          <div>
                            <p className="font-medium">{tx.matched_member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.matched_member.member_number}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unmatched</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openMemberSearch(tx)}
                            >
                              <User className="mr-1 h-3 w-3" />
                              Match
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReverse(tx.id)}
                              title="Mark as reversed"
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleIgnore(tx.id)}
                              title="Mark as ignored"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Member Search Dialog */}
      <Dialog open={memberSearchOpen} onOpenChange={setMemberSearchOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Match to Member</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Transaction Details */}
            {selectedTransaction && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p>
                  <strong>Amount:</strong> KES {selectedTransaction.amount.toLocaleString()}
                </p>
                <p>
                  <strong>Phone:</strong> {selectedTransaction.phone_number}
                </p>
                <p>
                  <strong>Receipt:</strong> {selectedTransaction.mpesa_receipt_number}
                </p>
              </div>
            )}

            {/* Search Input */}
            <div className="space-y-2">
              <Label>Search Member</Label>
              <Input
                placeholder="Search by name, member number, or phone..."
                value={memberSearchTerm}
                onChange={(e) => setMemberSearchTerm(e.target.value)}
              />
            </div>

            {/* Search Results */}
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {memberSearchTerm ? 'No members found' : 'Start typing to search'}
                </div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((member) => (
                    <button
                      key={member.id}
                      className="w-full p-3 text-left hover:bg-muted transition-colors flex items-center justify-between"
                      onClick={() => handleManualMatch(member.id)}
                      disabled={isMatching}
                    >
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.member_number} • {member.phone_number}
                        </p>
                      </div>
                      <User className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberSearchOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
