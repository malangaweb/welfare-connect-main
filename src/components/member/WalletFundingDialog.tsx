import * as React from "react";
import { useState } from "react";
import { toast } from "@/components/ui/use-toast";
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
import { Wallet, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface WalletFundingDialogProps {
  memberId: string;
  memberName: string;
  onFundingSuccess: () => void;
}

const WalletFundingDialog = ({
  memberId,
  memberName,
  onFundingSuccess,
}: WalletFundingDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const handleFundWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate amount
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid positive number.",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Convert amount to a number
      const numAmount = parseFloat(amount);
      
      // 1. Get current wallet balance from member
      const { data: memberData, error: fetchError } = await supabase
        .from("members")
        .select("wallet_balance")
        .eq("id", memberId)
        .single();
        
      if (fetchError) throw fetchError;
      
      // Calculate new balance
      const currentBalance = memberData?.wallet_balance || 0;
      const newBalance = currentBalance + numAmount;
      
      // 2. Create a transaction record
      const { error: transactionError } = await supabase
        .from("transactions")
        .insert({
          member_id: memberId,
          amount: numAmount,
          transaction_type: "wallet_funding",
          mpesa_reference: reference || null,
          description: `Wallet funding - ${reference || "Manual addition by admin"}`,
          created_at: new Date().toISOString(),
        });

      if (transactionError) throw transactionError;
      
      // 3. Update member's wallet balance directly
      const { error: updateError } = await supabase
        .from("members")
        .update({ wallet_balance: newBalance })
        .eq("id", memberId);

      if (updateError) throw updateError;
      
      toast({
        title: "Wallet funded successfully",
        description: `KES ${numAmount.toLocaleString()} has been added to ${memberName}'s wallet.`,
      });
      
      // Reset form and close dialog
      setAmount("");
      setReference("");
      setOpen(false);
      
      // Call the success callback
      onFundingSuccess();
    } catch (error) {
      console.error("Error funding wallet:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fund wallet. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Wallet className="mr-2 h-4 w-4" />
          Add Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fund Member Wallet</DialogTitle>
          <DialogDescription>
            Add funds to {memberName}'s wallet balance.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleFundWallet} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input 
              id="amount"
              placeholder="Enter amount" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input 
              id="reference"
              placeholder="e.g. MPESA reference" 
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Fund Wallet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WalletFundingDialog; 