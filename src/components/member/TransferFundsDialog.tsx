import * as React from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Search, User } from "lucide-react";
import { Label } from "@/components/ui/label";
interface TransferFundsDialogProps {
  memberId: string;
  memberName: string;
  currentBalance: number;
  onTransferSuccess: () => void;
}

interface MemberSearchResult {
  id: string;
  name: string;
  member_number: string;
}

const TransferFundsDialog = ({
  memberId,
  memberName,
  currentBalance,
  onTransferSuccess,
}: TransferFundsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Debounce search to avoid too many requests
  useEffect(() => {
    const searchMembers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setIsSearching(true);
        const { data, error } = await supabase
          .from('members')
          .select('id, name, member_number')
          .or(`name.ilike.%${searchQuery}%,member_number.ilike.%${searchQuery}%`)
          .neq('id', memberId) // Exclude current member
          .limit(5);

        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching members:', error);
        // Don't show error toast for every keystroke, only log to console
      } finally {
        setIsSearching(false);
      }
    };

    // Set a delay for the search to avoid too many requests
    const delayDebounce = setTimeout(() => {
      searchMembers();
    }, 300); // 300ms delay

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, memberId]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!selectedMember) {
      toast.error("Recipient required", {
        description: "Please select a recipient for the transfer.",
      });
      return;
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast.error("Invalid amount", {
        description: "Please enter a valid positive number.",
      });
      return;
    }

    const numAmount = parseFloat(amount);
    
    if (numAmount > currentBalance) {
      toast.error("Insufficient funds", {
        description: `You only have KES ${currentBalance.toLocaleString()} available.`,
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      // Use `as any` to avoid depending on potentially outdated generated types.
      const referenceText = (reference || `Transfer to ${selectedMember.member_number}`).trim();

      // Use correct parameter name 'reference' for the database function
      const primaryArgs = {
        from_member_id: memberId,
        to_member_id: selectedMember.id,
        amount: numAmount,
        reference: referenceText,
      } as any;

      // Call the transfer_funds RPC function
      const { data: result, error: transferError } = await (supabase.rpc as any)('transfer_funds', primaryArgs);
      
      if (transferError) {
        console.error('Transfer RPC error:', transferError);
        throw new Error(transferError.message || 'Transfer failed');
      }
      
      // Check if the function returned an error
      if (result && result.success === false) {
        throw new Error(result.message || 'Transfer failed');
      }

      toast.success("Transfer successful", {
        description: `KES ${numAmount.toLocaleString()} has been transferred to ${selectedMember.name}.`,
      });
      
      // Reset form and close dialog
      setAmount("");
      setReference("");
      setSearchQuery("");
      setSelectedMember(null);
      setSearchResults([]);
      setOpen(false);
      
      // Call the success callback
      onTransferSuccess();
    } catch (error) {
      console.error('Transfer error:', error);
      toast.error("Transfer failed", {
        description: error instanceof Error ? error.message : "An error occurred during the transfer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full mt-2">
          <ArrowRight className="mr-2 h-4 w-4" />
          Transfer to Another Member
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[425px]">
        <form onSubmit={handleTransfer}>
          <DialogHeader>
            <DialogTitle>Transfer Funds</DialogTitle>
            <DialogDescription>
              Transfer funds from {memberName}'s wallet to another member.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search Member</Label>
              <div className="relative">
                <div className="relative">
                  <Input
                    id="search"
                    placeholder="Start typing name or member number"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (!e.target.value.trim()) {
                        setSearchResults([]);
                        setSelectedMember(null);
                      }
                    }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Search className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {searchQuery && !selectedMember && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchResults.length > 0 
                      ? `${searchResults.length} member${searchResults.length === 1 ? '' : 's'} found`
                      : 'No members found'}
                  </p>
                )}
              </div>
              
              {searchResults.length > 0 && (
                <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                  {searchResults.map((member) => (
                    <div 
                      key={member.id}
                      className={`p-2 hover:bg-gray-100 cursor-pointer ${
                        selectedMember?.id === member.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedMember(member);
                        setSearchResults([]);
                        setSearchQuery(`${member.name} (${member.member_number})`);
                      }}
                    >
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-500">#{member.member_number}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedMember && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-2 text-gray-500" />
                    <div>
                      <div className="font-medium">{selectedMember.name}</div>
                      <div className="text-sm text-gray-500">#{selectedMember.member_number}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (KES)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="Enter amount to transfer"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">
                Available: KES {currentBalance.toLocaleString()}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reference">Reference (Optional)</Label>
              <Input
                id="reference"
                placeholder="e.g. Loan repayment"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedMember || !amount}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Transferring...' : 'Transfer Funds'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferFundsDialog;
