import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface Member {
  id: string;
  name: string;
  member_number: string;
}

interface TransferToMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: any;
  onSuccess: () => void;
}

export function TransferToMemberDialog({ open, onOpenChange, transaction, onSuccess }: TransferToMemberDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open]);

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, name, member_number')
        .order('name');

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load members. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = members.filter(
    (member) =>
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.member_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTransfer = async () => {
    if (!selectedMemberId || !transaction) return;

    setIsTransferring(true);
    try {
      // Start a transaction
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('name, member_number')
        .eq('id', selectedMemberId)
        .single();

      if (memberError) throw memberError;

      // Create a new transaction record
      const { error: txError } = await supabase.from('transactions').insert([
        {
          member_id: selectedMemberId,
          amount: transaction.amount,
          transaction_type: 'mpesa',
          description: memberData.member_number, // Using member number as description
          mpesa_reference: transaction.mpesaReference,
          created_at: new Date().toISOString(),
          case_id: null
        },
      ]);

      if (txError) throw txError;

      // Update the original wrong_mpesa_transaction
      const { error: updateError } = await supabase
        .from('wrong_mpesa_transactions')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          notes: `Transferred to member ${memberData.name} (${memberData.member_number})`
        })
        .eq('id', transaction.id);

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: `Transaction successfully transferred to ${memberData.name}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error transferring transaction:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to transfer transaction. Please try again.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transfer to Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Transaction Details</Label>
            <div className="rounded-md border p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-medium">KES {transaction?.amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Reference</p>
                  <p className="font-medium">{transaction?.mpesaReference || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">
                    {transaction?.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="font-medium">{transaction?.status || 'N/A'}</p>
                </div>
              </div>
              {transaction?.description && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="text-sm">{transaction.description}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Search Member</Label>
            <Input
              id="search"
              placeholder="Search by name or member number"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="max-h-60 overflow-y-auto border rounded-md">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading members...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No members found</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Member #</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{member.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{member.member_number}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <Button
                          size="sm"
                          onClick={() => setSelectedMemberId(member.id)}
                          variant={selectedMemberId === member.id ? 'default' : 'outline'}
                        >
                          {selectedMemberId === member.id ? 'Selected' : 'Select'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isTransferring}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={!selectedMemberId || isTransferring}>
            {isTransferring ? 'Transferring...' : 'Transfer to Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
