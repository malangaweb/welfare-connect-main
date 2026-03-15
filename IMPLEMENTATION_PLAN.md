# Malanga Welfare - Implementation Plan

**Date:** March 14, 2026
**Status:** Gap Analysis Complete
**Priority:** Critical Features First

---

## Executive Summary

This document outlines the remaining work needed to complete the Malanga Welfare system based on the comprehensive audit report. The system has a solid foundation with database schema, authentication, and basic CRUD operations. However, several critical features need implementation.

---

## Current State Analysis

### ✅ What's Already Working

| Feature | Status | Location |
|---------|--------|----------|
| Admin Authentication | ✅ Working | `src/pages/Login.tsx` - bcrypt passwords |
| Member Authentication | ✅ Working | `src/pages/MemberLogin.tsx` - phone number based |
| Database Schema | ✅ Complete | `db-schema.sql` - all core tables |
| Member Management | ✅ Basic CRUD | `src/pages/Members.tsx`, `MemberForm.tsx` |
| Transaction Recording | ✅ Working | `src/pages/Transactions.tsx` |
| Dashboard | ✅ Working | `src/pages/Dashboard.tsx` - with caching |
| Accounts View | ✅ Working | `src/pages/Accounts.tsx` |
| Settings | ✅ Working | `src/pages/Settings.tsx` |
| M-Pesa Client Library | ✅ Implemented | `src/integrations/mpesa/client.ts` |
| M-Pesa Webhook Handler | ✅ Implemented | `src/integrations/mpesa/webhook-handler.ts` |
| Database Functions | ✅ Created | Migrations 20260314000002, 20260314000003 |

### ❌ Critical Gaps Identified

| Feature | Priority | Effort | Status |
|---------|----------|--------|--------|
| M-Pesa Edge Functions | 🔴 Critical | Medium | Not deployed |
| Transaction Reversal UI | 🔴 Critical | Small | Missing |
| Suspense Account Management | 🔴 Critical | Medium | Missing UI |
| Member Status Management | 🔴 Critical | Small | Missing UI |
| Probation Auto-Calculation | 🟠 High | Small | DB ready, no auto-job |
| Dead Member Handling | 🟠 High | Small | Missing UI |
| Case Management Enhancements | 🟠 High | Medium | Basic only |
| Fiscal Reports | 🟠 High | Large | Missing |
| Compliance Reports | 🟡 Medium | Large | Missing |
| B2C Reversal Integration | 🔴 Critical | Medium | Partial |

---

## Phase 1: Critical Payment Features (Week 1-2)

### 1.1 Deploy M-Pesa Edge Functions

**Files to Create:**

1. `supabase/functions/mpesa-stk-push/index.ts`
```typescript
// STK Push endpoint for initiating M-Pesa payments
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { phone, amount, accountReference, memberId } = await req.json()
  
  // Get M-Pesa config from settings
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )
  
  const { data: settings } = await supabase
    .from('settings')
    .select('mpesa_consumer_key, mpesa_consumer_secret, mpesa_passkey, mpesa_shortcode, mpesa_env')
    .single()
  
  // Get access token
  const token = await getMpesaToken(settings)
  
  // Initiate STK Push
  const response = await stkPush(token, {
    BusinessShortCode: settings.mpesa_shortcode,
    Password: generateMpesaPassword(settings),
    Timestamp: generateTimestamp(),
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: formatPhone(phone),
    PartyB: settings.mpesa_shortcode,
    PhoneNumber: formatPhone(phone),
    CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`,
    AccountReference: accountReference,
    TransactionDesc: `Welfare Payment - ${memberId}`
  })
  
  // Create pending transaction
  await supabase.from('transactions').insert({
    member_id: memberId,
    amount: amount,
    transaction_type: 'wallet_funding',
    payment_method: 'mpesa',
    reference: response.CheckoutRequestID,
    status: 'pending',
    description: `M-Pesa STK Push - ${accountReference}`
  })
  
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
})
```

2. `supabase/functions/mpesa-callback/index.ts`
```typescript
// Webhook handler for M-Pesa callbacks
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const callback = await req.json()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const stkCallback = callback.Body.stkCallback
  
  if (stkCallback.ResultCode === 0) {
    // Payment successful - extract metadata
    const metadata = stkCallback.CallbackMetadata.Item.reduce((acc, item) => ({
      ...acc,
      [item.Name]: item.Value
    }), {})
    
    // Update transaction
    await supabase.from('transactions').update({
      status: 'completed',
      mpesa_reference: metadata.MpesaReceiptNumber,
      metadata: { mpesa_receipt: metadata.MpesaReceiptNumber }
    }).eq('reference', stkCallback.CheckoutRequestID)
    
    // Update member wallet
    await supabase.rpc('update_wallet_balance', {
      p_member_id: metadata.AccountReference,
      p_amount: metadata.Amount,
      p_transaction_type: 'deposit'
    })
  } else {
    // Payment failed
    await supabase.from('transactions').update({
      status: 'failed',
      metadata: { reason: stkCallback.ResultDesc }
    }).eq('reference', stkCallback.CheckoutRequestID)
  }
  
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }))
})
```

3. `supabase/functions/mpesa-b2c/index.ts`
```typescript
// B2C payment for disbursements and reversals
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { phone, amount, memberId, reason, isReversal } = await req.json()
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )
  
  const { data: settings } = await supabase
    .from('settings')
    .select('mpesa_*')
    .single()
  
  const token = await getMpesaToken(settings)
  
  const payload = {
    InitiatorName: settings.mpesa_initiator_name,
    SecurityCredential: await encryptCredential(settings.mpesa_initiator_password),
    CommandID: isReversal ? 'BusinessPayment' : 'SalaryPayment',
    Amount: amount,
    PartyA: settings.mpesa_shortcode,
    PartyB: formatPhone(phone),
    Remarks: reason,
    QueueTimeOutURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-timeout`,
    ResultURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-b2c-callback`,
    Occasion: isReversal ? 'REVERSAL' : 'DISBURSEMENT'
  }
  
  const response = await fetch(
    `${settings.mpesa_env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'}/mpesa/b2c/v1/paymentrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  )
  
  return new Response(JSON.stringify(await response.json()))
})
```

**Deployment Steps:**
```bash
# Login to Supabase
npx supabase login

# Link project
npx supabase link --project-ref your-project-ref

# Deploy functions
npx supabase functions deploy mpesa-stk-push
npx supabase functions deploy mpesa-callback
npx supabase functions deploy mpesa-b2c
npx supabase functions deploy mpesa-b2c-callback

# Set secrets
npx supabase secrets set MPESA_CONSUMER_KEY="your-key"
npx supabase secrets set MPESA_CONSUMER_SECRET="your-secret"
npx supabase secrets set MPESA_PASSKEY="your-passkey"
npx supabase secrets set MPESA_SHORTCODE="174379"
```

---

### 1.2 Transaction Reversal UI

**File to Create:** `src/components/transactions/TransactionReversalDialog.tsx`

```typescript
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Transaction } from '@/lib/types'

interface TransactionReversalDialogProps {
  transaction: Transaction
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function TransactionReversalDialog({
  transaction,
  open,
  onOpenChange,
  onSuccess,
}: TransactionReversalDialogProps) {
  const [reason, setReason] = useState('')
  const [isReversing, setIsReversing] = useState(false)
  const [useMpesaReversal, setUseMpesaReversal] = useState(false)

  const handleReversal = async () => {
    if (!reason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Reversal failed',
        description: 'Please provide a reason for reversal',
      })
      return
    }

    setIsReversing(true)

    try {
      // Get current user
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')

      if (useMpesaReversal && transaction.payment_method === 'mpesa') {
        // Initiate M-Pesa B2C reversal
        const { error: b2cError } = await supabase.functions.invoke('mpesa-b2c', {
          body: {
            phone: transaction.member?.phone_number,
            amount: Math.abs(transaction.amount),
            memberId: transaction.member_id,
            reason: `Reversal: ${reason}`,
            isReversal: true,
          },
        })

        if (b2cError) throw b2cError
      }

      // Call database reversal function
      const { data, error } = await supabase.rpc('revert_transaction', {
        p_transaction_id: transaction.id,
        p_admin_id: currentUser.id,
        p_reason: reason,
      })

      if (error) throw error

      const result = data as any
      if (!result.success) {
        throw new Error(result.message)
      }

      toast({
        title: 'Reversal successful',
        description: 'Transaction has been reversed',
      })

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reversal failed',
        description: error.message,
      })
    } finally {
      setIsReversing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">Transaction Details</p>
            <p className="text-sm text-muted-foreground">
              Amount: KES {Math.abs(transaction.amount).toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Type: {transaction.transaction_type}
            </p>
            <p className="text-sm text-muted-foreground">
              Date: {new Date(transaction.created_at).toLocaleDateString()}
            </p>
          </div>

          <div>
            <Label htmlFor="reason">Reversal Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Wrong amount entered, Duplicate payment..."
              className="mt-1"
            />
          </div>

          {transaction.payment_method === 'mpesa' && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="mpesa-reversal"
                checked={useMpesaReversal}
                onChange={(e) => setUseMpesaReversal(e.target.checked)}
              />
              <label htmlFor="mpesa-reversal" className="text-sm">
                Process M-Pesa reversal (send money back via M-Pesa)
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleReversal}
            disabled={isReversing}
          >
            {isReversing ? 'Processing...' : 'Reverse Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Update:** `src/pages/Transactions.tsx` - Add reversal button to each transaction row

---

### 1.3 Suspense Account Management UI

**File to Create:** `src/components/accounts/SuspenseManagement.tsx`

```typescript
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/components/ui/use-toast'
import { Search, CheckCircle, XCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'

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
  member?: {
    name: string
    member_number: string
  }
}

export function SuspenseManagement() {
  const [transactions, setTransactions] = useState<WrongMpesaTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchPhone, setSearchPhone] = useState('')

  const fetchSuspenseTransactions = async () => {
    const { data, error } = await supabase
      .from('wrong_mpesa_transactions')
      .select('*, member(name, member_number)')
      .order('transaction_date', { ascending: false })

    if (error) {
      toast({ variant: 'destructive', title: 'Error loading suspense transactions' })
      return
    }

    setTransactions(data || [])
    setLoading(false)
  }

  const handleAutoMatch = async () => {
    const { data, error } = await supabase.rpc('match_suspense_transactions')

    if (error) {
      toast({ variant: 'destructive', title: 'Auto-match failed', description: error.message })
      return
    }

    toast({
      title: 'Auto-match complete',
      description: `${data} transactions matched`,
    })

    fetchSuspenseTransactions()
  }

  const handleManualMatch = async (transactionId: string, memberId: string) => {
    const { error } = await supabase
      .from('wrong_mpesa_transactions')
      .update({
        status: 'matched',
        matched_member_id: memberId,
        matched_at: new Date().toISOString(),
      })
      .eq('id', transactionId)

    if (error) {
      toast({ variant: 'destructive', title: 'Match failed' })
      return
    }

    // Create wallet funding transaction
    const tx = transactions.find(t => t.id === transactionId)
    await supabase.from('transactions').insert({
      member_id: memberId,
      amount: tx?.amount,
      transaction_type: 'wallet_funding',
      mpesa_reference: tx?.mpesa_receipt_number,
      description: `Manual match from suspense (${tx?.phone_number})`,
      status: 'completed',
    })

    toast({ title: 'Transaction matched successfully' })
    fetchSuspenseTransactions()
  }

  const handleReverse = async (transactionId: string) => {
    if (!confirm('Are you sure you want to mark this as reversed?')) return

    const { error } = await supabase
      .from('wrong_mpesa_transactions')
      .update({ status: 'reversed' })
      .eq('id', transactionId)

    if (error) {
      toast({ variant: 'destructive', title: 'Reversal failed' })
      return
    }

    toast({ title: 'Transaction marked as reversed' })
    fetchSuspenseTransactions()
  }

  useEffect(() => {
    fetchSuspenseTransactions()
  }, [])

  const filteredTransactions = transactions.filter(t =>
    t.phone_number.includes(searchPhone)
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Suspense Account Management</CardTitle>
        <Button onClick={handleAutoMatch}>
          <CheckCircle className="mr-2 h-4 w-4" />
          Auto-Match All
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by phone number..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt #</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-medium">{tx.mpesa_receipt_number}</TableCell>
                <TableCell>{tx.phone_number}</TableCell>
                <TableCell>KES {tx.amount.toLocaleString()}</TableCell>
                <TableCell>{new Date(tx.transaction_date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={tx.status === 'pending' ? 'secondary' : 'default'}>
                    {tx.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {tx.member ? (
                    <div>
                      <p className="font-medium">{tx.member.name}</p>
                      <p className="text-xs text-muted-foreground">{tx.member.member_number}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Unmatched</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {tx.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Open member search dialog
                          }}
                        >
                          Match
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReverse(tx.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

---

## Phase 2: Member Management (Week 2-3)

### 2.1 Member Status & Probation Management

**Update:** `src/pages/Members.tsx` - Add status column and actions

**File to Create:** `src/components/members/MemberStatusBadge.tsx`

```typescript
import { Badge } from '@/components/ui/badge'
import { Member } from '@/lib/types'

interface MemberStatusBadgeProps {
  member: Member
}

export function MemberStatusBadge({ member }: MemberStatusBadgeProps) {
  const getProbationStatus = () => {
    const registrationDate = new Date(member.registrationDate)
    const probationEnd = new Date(registrationDate)
    probationEnd.setDate(probationEnd.getDate() + 90)

    const now = new Date()
    const daysRemaining = Math.ceil((probationEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysRemaining > 0) {
      return {
        status: 'probation',
        label: `Probation (${daysRemaining}d left)`,
        variant: 'secondary' as const,
      }
    }

    return {
      status: 'active',
      label: 'Active',
      variant: 'default' as const,
    }
  }

  if (member.status === 'deceased') {
    return <Badge variant="destructive">Deceased</Badge>
  }

  if (member.status === 'inactive') {
    return <Badge variant="secondary">Inactive</Badge>
  }

  const probationInfo = getProbationStatus()
  return <Badge variant={probationInfo.variant}>{probationInfo.label}</Badge>
}
```

**File to Create:** `src/components/members/MemberActionsDialog.tsx`

```typescript
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Member } from '@/lib/types'

interface MemberActionsDialogProps {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function MemberActionsDialog({
  member,
  open,
  onOpenChange,
  onSuccess,
}: MemberActionsDialogProps) {
  const [newStatus, setNewStatus] = useState(member.status)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleStatusChange = async () => {
    setIsProcessing(true)

    try {
      const { error } = await supabase
        .from('members')
        .update({
          status: newStatus,
          is_active: newStatus !== 'inactive' && newStatus !== 'deceased',
        })
        .eq('id', member.id)

      if (error) throw error

      toast({
        title: 'Status updated',
        description: `Member status changed to ${newStatus}`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteMember = async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return

    setIsProcessing(true)

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')

      const { data, error } = await supabase.rpc('safe_delete_member', {
        p_member_id: member.id,
        p_admin_id: currentUser.id,
      })

      if (error) throw error

      const result = data as any
      if (!result.success) {
        throw new Error(result.message)
      }

      toast({ title: result.message })
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Member: {member.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Member Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="probation">Probation</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="deceased">Deceased</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Current Status</p>
            <p className="text-sm">
              Wallet Balance: KES {member.walletBalance.toLocaleString()}
            </p>
            <p className="text-sm">
              Registration Date: {new Date(member.registrationDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStatusChange} disabled={isProcessing}>
            {isProcessing ? 'Updating...' : 'Update Status'}
          </Button>
          {member.walletBalance === 0 && (
            <Button variant="destructive" onClick={handleDeleteMember} disabled={isProcessing}>
              {isProcessing ? 'Deleting...' : 'Delete Member'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

### 2.2 Auto-Update Probation Status Job

**File to Create:** `supabase/functions/update-probation-status/index.ts`

```typescript
// Cron job to auto-update member probation status
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Update members whose probation has ended
  const { error } = await supabase.rpc(`
    UPDATE members
    SET status = 'active'
    WHERE status = 'probation'
    AND probation_end_date <= CURRENT_DATE
  `)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }))
})
```

**Setup Cron:**
```bash
# Add to crontab or use a service like Cronitor
0 0 * * * curl -X POST https://your-project.supabase.co/functions/v1/update-probation-status
```

---

## Phase 3: Reports & Analytics (Week 3-4)

### 3.1 Fiscal Reports

**File to Create:** `src/pages/FiscalReports.tsx`

Features:
- Monthly contribution summaries
- Annual financial statements
- Case fund utilization reports
- Wallet balance summaries
- Export to PDF/Excel

### 3.2 Compliance Reports

**File to Create:** `src/pages/ComplianceReports.tsx`

Features:
- Member registration compliance
- Payment trail audit
- Disbursement authorization trail
- Statutory reporting templates

---

## Phase 4: Case Management (Week 4)

### 4.1 Case Management Enhancements

**Updates needed:**
- Add case status workflow (draft → active → finalized → closed)
- Add disbursement tracking
- Add case document attachments
- Add case beneficiary management

---

## Database Migration Checklist

Run these in order:

```sql
-- 1. Ensure all tables exist (already done via 20260314000003)

-- 2. Add any missing indexes
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_reversed ON transactions(status) WHERE status = 'reversed';
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_probation ON members(status, probation_end_date);

-- 3. Create view for active defaulters
CREATE OR REPLACE VIEW active_defaulters AS
SELECT
  m.id,
  m.member_number,
  m.name,
  m.phone_number,
  m.status,
  m.wallet_balance,
  m.registration_date,
  m.probation_end_date
FROM members m
WHERE m.wallet_balance < 0
  AND m.is_active = true
  AND m.status NOT IN ('deceased', 'inactive');

-- 4. Create view for probation members
CREATE OR REPLACE VIEW members_on_probation AS
SELECT
  id,
  member_number,
  name,
  phone_number,
  registration_date,
  probation_end_date,
  CURRENT_DATE - probation_end_date as days_overdue
FROM members
WHERE status = 'probation'
ORDER BY probation_end_date;
```

---

## Testing Checklist

### M-Pesa Integration
- [ ] STK Push initiates successfully
- [ ] Callback received and processed
- [ ] Wallet balance updates correctly
- [ ] B2C payment sends successfully
- [ ] B2C reversal works
- [ ] Failed payments handled gracefully

### Transaction Reversal
- [ ] Reversal dialog opens
- [ ] Reason is required
- [ ] Original transaction marked as reversed
- [ ] Reversal transaction created
- [ ] Wallet balance adjusted
- [ ] Audit log entry created

### Suspense Account
- [ ] Wrong payments logged
- [ ] Auto-match finds members by phone
- [ ] Manual match works
- [ ] Matched payments create transactions

### Member Management
- [ ] Status changes work
- [ ] Probation calculated correctly
- [ ] Deceased members handled
- [ ] Delete only when balance is zero

---

## Summary

**Total Estimated Effort:** 4-6 weeks
**Critical Path:** M-Pesa deployment → Transaction reversal → Suspense management
**Risk Areas:** M-Pesa API integration, B2C credential encryption

**Next Steps:**
1. Deploy M-Pesa Edge Functions
2. Build Transaction Reversal UI
3. Build Suspense Account Management UI
4. Implement Member Status Management
5. Set up probation auto-update job
6. Build comprehensive reports
