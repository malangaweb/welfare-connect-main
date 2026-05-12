import * as React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { getAppToken } from "@/lib/appAuth";

interface WalletFundingDialogProps {
  memberId: string;
  memberName: string;
  memberPhone?: string;
  onFundingSuccess: () => void;
}

const WalletFundingDialog = ({
  memberId,
  memberName,
  memberPhone,
  onFundingSuccess,
}: WalletFundingDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [accountReference, setAccountReference] = useState("");

  useEffect(() => {
    if (!open) return;
    if (phone.trim()) return;
    setPhone(String(memberPhone || "").trim());
  }, [open, memberPhone, phone]);

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

      const normalizedPhone = String(phone || "").replace(/\D/g, "");
      if (normalizedPhone.length < 10) {
        throw new Error("Enter a valid M-Pesa phone number.");
      }

      const appToken = getAppToken();
      if (!appToken) {
        throw new Error("Session expired. Please login again.");
      }

      const configuredBaseUrl = String(import.meta.env.VITE_MLG_API_BASE_URL || "").trim();
      const normalizedBaseUrl = configuredBaseUrl.replace(/\/+$/, "");
      const endpoint = normalizedBaseUrl
        ? `${normalizedBaseUrl}/stk_push.php`
        : "/mlg/stk_push.php";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-token": appToken,
        },
        body: JSON.stringify({
          memberId,
          phone: normalizedPhone,
          amount: numAmount,
          accountReference: accountReference || memberId,
          transactionDesc: `Wallet top-up for ${memberName}`,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          String((result as { error?: unknown }).error || "").trim() ||
          `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      toast.success("STK Push sent", {
        description: `Prompt sent to ${normalizedPhone}. Complete payment with M-Pesa PIN.`,
      });
      
      // Reset form and close dialog
      setAmount("");
      setPhone("");
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
            <Label htmlFor="phone">M-Pesa Phone *</Label>
            <Input
              id="phone"
              placeholder="07xx xxx xxx or 2547xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              STK push will be sent to this phone number.
            </p>
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
