import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/lib/types";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Search, User } from "lucide-react";

type MemberSearchResult = {
  id: string;
  name: string;
  member_number: string;
};

interface TransferBetweenMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromMember: Member | null;
  onTransferSuccess: () => void;
}

export function TransferBetweenMembersDialog({
  open,
  onOpenChange,
  fromMember,
  onTransferSuccess,
}: TransferBetweenMembersDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);

  const availableBalance = useMemo(() => {
    if (!fromMember) return 0;
    const n = Number(fromMember.walletBalance);
    return Number.isFinite(n) ? n : 0;
  }, [fromMember]);

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      setAmount("");
      setReference("");
      setSearchQuery("");
      setSearchResults([]);
      setSelectedMember(null);
      setIsSearching(false);
      return;
    }

    // When the dialog opens (or fromMember changes), reset selection/search.
    setAmount("");
    setReference("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedMember(null);
  }, [open, fromMember?.id]);

  useEffect(() => {
    const runSearch = async () => {
      if (!open || !fromMember) return;
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setIsSearching(true);
        const { data, error } = await supabase
          .from("members")
          .select("id, name, member_number")
          .or(`name.ilike.%${searchQuery}%,member_number.ilike.%${searchQuery}%`)
          .neq("id", fromMember.id)
          .limit(5);

        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        // Avoid spamming toasts; search is interactive.
        console.error("Error searching members:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceMs = 300;
    const t = setTimeout(runSearch, debounceMs);
    return () => clearTimeout(t);
  }, [searchQuery, fromMember, open]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromMember) {
      toast.error("Sender required", { description: "Pick a sender member to transfer from." });
      return;
    }

    if (!selectedMember) {
      toast.error("Recipient required", { description: "Please select a recipient for the transfer." });
      return;
    }

    if (!amount || isNaN(parseFloat(amount))) {
      toast.error("Invalid amount", { description: "Please enter a valid positive number." });
      return;
    }

    const numAmount = parseFloat(amount);
    if (numAmount <= 0) {
      toast.error("Invalid amount", { description: "Please enter a value greater than 0." });
      return;
    }

    if (numAmount > availableBalance) {
      toast.error("Insufficient funds", {
        description: `You only have KES ${availableBalance.toLocaleString()} available.`,
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const referenceText = reference.trim() ? reference.trim() : null;

      const primaryArgs = {
        from_member_id: fromMember.id,
        to_member_id: selectedMember.id,
        amount: numAmount,
        reference_text: referenceText,
      } as any;

      const fallbackArgs = {
        from_member_id: fromMember.id,
        to_member_id: selectedMember.id,
        amount: numAmount,
        reference: referenceText,
      } as any;

      const { error: primaryError } = await (supabase.rpc as any)("transfer_funds", primaryArgs);
      if (primaryError) {
        const { error: fallbackError } = await (supabase.rpc as any)(
          "transfer_funds",
          fallbackArgs
        );
        if (fallbackError) throw fallbackError;
      }

      toast.success("Transfer successful", {
        description: `KES ${numAmount.toLocaleString()} has been transferred to ${selectedMember.name}.`,
      });

      onTransferSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Transfer error:", err);
      toast.error("Transfer failed", {
        description: err instanceof Error ? err.message : "An error occurred during the transfer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transfer Funds</DialogTitle>
          <DialogDescription>
            Transfer wallet balance from{" "}
            <span className="font-medium">{fromMember ? `#${fromMember.memberNumber} (${fromMember.name})` : "a member"}</span>{" "}
            to another member.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleTransfer}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="search">Search Recipient</Label>
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
                  disabled={!fromMember || isSubmitting}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Search className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                  {searchResults.map((member) => (
                    <div
                      key={member.id}
                      className={`p-2 hover:bg-gray-100 cursor-pointer ${
                        selectedMember?.id === member.id ? "bg-blue-50" : ""
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
            </div>

            {selectedMember && (
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-center">
                  <User className="h-4 w-4 mr-2 text-gray-500" />
                  <div>
                    <div className="font-medium">{selectedMember.name}</div>
                    <div className="text-sm text-gray-500">#{selectedMember.member_number}</div>
                  </div>
                </div>
              </div>
            )}

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
                disabled={!fromMember || isSubmitting}
              />
              <p className="text-xs text-gray-500">Available: KES {availableBalance.toLocaleString()}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference (Optional)</Label>
              <Input
                id="reference"
                placeholder="e.g. Loan repayment"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={!fromMember || isSubmitting}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!fromMember || !selectedMember || !amount || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferring...
                </>
              ) : (
                "Transfer Funds"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

