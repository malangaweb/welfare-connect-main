import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { supabase } from '@/integrations/supabase/client'
import { Transaction } from '@/lib/types'
import { Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface TransactionReversalDialogProps {
  transaction: Transaction | null
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

  if (!transaction) return null

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

      // Check if user has permission
      const userRole = currentUser?.role
      const isAdminRole = ['super_admin', 'treasurer', 'chairperson'].includes(userRole)
      
      if (!isAdminRole) {
        throw new Error('You do not have permission to reverse transactions')
      }

      // If M-Pesa reversal requested and transaction was via M-Pesa
      if (useMpesaReversal && transaction.payment_method === 'mpesa') {
        // Get member phone number
        const { data: member } = await supabase
          .from('members')
          .select('phone_number')
          .eq('id', transaction.member_id)
          .single()

        if (!member?.phone_number) {
          throw new Error('Member phone number not found')
        }

        // Initiate M-Pesa B2C reversal
        const { error: b2cError } = await supabase.functions.invoke('mpesa-b2c', {
          body: {
            phone: member.phone_number,
            amount: Math.abs(transaction.amount),
            memberId: transaction.member_id,
            reason: `Reversal: ${reason}`,
            isReversal: true,
            transactionId: transaction.id,
          },
        })

        if (b2cError) {
          console.error('B2C reversal error:', b2cError)
          // Continue with local reversal even if M-Pesa fails
          toast({
            title: 'Warning',
            description: 'M-Pesa reversal failed. Proceeding with local reversal only.',
            variant: 'destructive',
          })
        }
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
        throw new Error(result.message || 'Reversal failed')
      }

      toast({
        title: 'Reversal successful',
        description: 'Transaction has been reversed successfully',
      })

      // Reset form
      setReason('')
      setUseMpesaReversal(false)
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Reversal error:', error)
      toast({
        variant: 'destructive',
        title: 'Reversal failed',
        description: error.message || 'An error occurred during reversal',
      })
    } finally {
      setIsReversing(false)
    }
  }

  const canReverse = transaction.status !== 'reversed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reverse Transaction</DialogTitle>
          <DialogDescription>
            This will create a reversing entry and adjust the member's wallet balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction Details */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-semibold">
                KES {Math.abs(transaction.amount).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Type</span>
              <span className="capitalize">{transaction.transaction_type.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Payment Method</span>
              <span className="capitalize">{transaction.payment_method || 'cash'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Date</span>
              <span>
                {new Date(transaction.created_at).toLocaleDateString('en-KE', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {transaction.status === 'reversed' && (
              <div className="pt-2 border-t">
                <span className="text-xs text-red-600 font-medium">
                  ⚠️ This transaction has already been reversed
                </span>
              </div>
            )}
          </div>

          {/* Reversal Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reversal Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Wrong amount entered, Duplicate payment, Incorrect member..."
              className="min-h-[100px]"
              disabled={isReversing || !canReverse}
            />
          </div>

          {/* M-Pesa Reversal Option */}
          {transaction.payment_method === 'mpesa' && canReverse && (
            <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <Switch
                id="mpesa-reversal"
                checked={useMpesaReversal}
                onCheckedChange={setUseMpesaReversal}
                disabled={isReversing}
              />
              <div className="space-y-1">
                <Label htmlFor="mpesa-reversal" className="text-sm font-medium cursor-pointer">
                  Process M-Pesa reversal
                </Label>
                <p className="text-xs text-muted-foreground">
                  This will send the money back to the member's M-Pesa account via B2C payment.
                </p>
              </div>
            </div>
          )}

          {/* Warning */}
          {canReverse && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-800">
                ⚠️ <strong>Warning:</strong> This action cannot be undone. A reversal entry will be
                created in the transaction log.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setReason('')
              setUseMpesaReversal(false)
              onOpenChange(false)
            }}
            disabled={isReversing}
          >
            Cancel
          </Button>
          <Button
            variant={canReverse ? 'destructive' : 'secondary'}
            onClick={handleReversal}
            disabled={isReversing || !canReverse}
          >
            {isReversing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Reverse Transaction'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
