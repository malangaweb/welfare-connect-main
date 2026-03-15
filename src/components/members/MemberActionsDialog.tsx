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
import { Loader2, AlertTriangle } from 'lucide-react'

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
  const [newStatus, setNewStatus] = useState(member.status || 'active')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleStatusChange = async () => {
    setIsProcessing(true)

    try {
      const { error } = await supabase
        .from('members')
        .update({
          status: newStatus,
          is_active: newStatus !== 'inactive' && newStatus !== 'deceased',
          updated_at: new Date().toISOString(),
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

      toast({
        title: result.message,
        variant: result.success ? 'default' : 'destructive',
      })

      if (result.success) {
        onSuccess()
        onOpenChange(false)
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message,
      })
    } finally {
      setIsProcessing(false)
      setShowDeleteConfirm(false)
    }
  }

  const canDelete = member.walletBalance === 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Member</DialogTitle>
            <DialogDescription>
              Update member status or remove from system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Member Info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="font-medium">{member.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Member Number</span>
                <span className="font-medium">{member.memberNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Phone</span>
                <span className="font-medium">{member.phoneNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Current Status</span>
                <span className="capitalize">{member.status || 'active'}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">Wallet Balance</span>
                <span
                  className={`font-semibold ${
                    member.walletBalance < 0
                      ? 'text-red-600'
                      : member.walletBalance > 0
                        ? 'text-green-600'
                        : ''
                  }`}
                >
                  KES {member.walletBalance.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Status Change */}
            <div className="space-y-2">
              <Label htmlFor="status">Member Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="probation">Probation</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="deceased">Deceased</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Changing status to Inactive or Deceased will deactivate the member's account
              </p>
            </div>

            {/* Delete Option */}
            {!showDeleteConfirm ? (
              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={!canDelete}
                  className="w-full"
                >
                  {canDelete ? 'Delete Member' : 'Cannot Delete (Non-zero Balance)'}
                </Button>
                {!canDelete && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Member must have zero wallet balance to be deleted
                  </p>
                )}
              </div>
            ) : (
              <div className="pt-4 border-t space-y-3">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Confirm Deletion</p>
                    <p className="text-xs text-red-700 mt-1">
                      This will permanently remove {member.name} from the system. This action cannot
                      be undone.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteMember}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-start">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleStatusChange} disabled={isProcessing}>
              {isProcessing ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
