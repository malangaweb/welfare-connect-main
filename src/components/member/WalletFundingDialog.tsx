import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];

const WalletFundingDialog = ({
  memberId,
  memberName,
  onFundingSuccess,
}: WalletFundingDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [accountReference, setAccountReference] = useState("");

  const handleFundWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate amount
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast.error("Invalid amount", {
        description: "Please enter a valid positive number.",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Convert amount to a number
      const numAmount = parseFloat(amount);

      // 1. Create transaction payload
      // Note: We no longer need to fetch current balance or calculate new balance
      // The database trigger will handle wallet updates automatically
      const transactionPayload: TransactionInsert = {
        member_id: memberId,
        amount: numAmount,
        transaction_type: "wallet_funding",
        payment_method: reference ? "mpesa" : "manual",
        status: "completed",
        // `mpesa_reference` is the M-Pesa receipt/confirmation code when provided
        mpesa_reference: reference || null,
        // `reference` is an auxiliary reference such as Paybill account reference / member number
        reference: accountReference || null,
        description: `Wallet funding - ${reference || "Manual addition by admin"}`,
        created_at: new Date().toISOString(),
        metadata: {
          source: "manual",
          entry_type: "wallet_funding_dialog",
          mpesa_reference: reference || null,
          account_reference: accountReference || null,
        },
      };
      
      // 2. Create a transaction record
      // Note: A database trigger automatically updates the member's wallet_balance
      const { error: transactionError } = await (supabase.from("transactions") as any).insert(
        transactionPayload
      );

      if (transactionError) throw transactionError;

      toast.success("Wallet funded successfully", {
        description: `KES ${numAmount.toLocaleString()} has been added to ${memberName}'s wallet.`,
      });
      
      // Reset form and close dialog
      setAmount("");
      setReference("");
      setAccountReference("");
      setOpen(false);
      
      // Call the success callback
      onFundingSuccess();
    } catch (error) {
      console.error("Error funding wallet:", error);
      toast.error("Failed to fund wallet", {
        description: "Please try again.",
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

          <div className="space-y-2">
            <Label htmlFor="accountReference">Account Reference (optional)</Label>
            <Input
              id="accountReference"
              placeholder="e.g. member number / paybill account reference"
              value={accountReference}
              onChange={(e) => setAccountReference(e.target.value)}
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
