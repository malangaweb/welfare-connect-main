import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, User, Calendar, Phone, Mail, Home, FileText, ArrowRight } from "lucide-react";
import { memberLinks, memberLogout } from "./memberLinks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { invokeWithAppToken } from "@/lib/appAuth";

type ActiveCaseSummary = {
  id: string;
  case_number: string;
  case_type: string;
  contribution_per_member: number;
  paid: boolean;
};

const MemberDashboard = () => {
  const [member, setMember] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeCasesSummary, setActiveCasesSummary] = useState<ActiveCaseSummary[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [pinData, setPinData] = useState({ oldPin: "", newPin: "", confirmPin: "" });
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [payToCaseOpen, setPayToCaseOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [isPayingCase, setIsPayingCase] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }

    try {
      const summary = await invokeWithAppToken<any>("api-member-summary", {
        member_id,
      });
      const memberData = summary?.member;
      const allTransData = summary?.recent_transactions || [];

      setMember(memberData);
      setTransactions(allTransData || []);
      setActiveCasesSummary(summary?.active_cases_summary || []);
      // Prefer stored wallet_balance maintained by DB triggers; fallback to calculated sum
      const balanceFromMember = Number(memberData?.wallet_balance) || 0;
      const balanceFromTx = (allTransData || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      setWalletBalance(Number.isFinite(balanceFromMember) ? balanceFromMember : balanceFromTx);
    } catch (error) {
      console.error("Error fetching data:", error);
      if (error instanceof Error && /session expired/i.test(error.message)) {
        window.location.href = "/member/login";
        return;
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load member data. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [navigate]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const { data, error } = await supabase
        .from('members')
        .select('id, name, member_number')
        .or(`name.ilike.%${query}%,member_number.ilike.%${query}%`)
        .neq('id', member?.id) // Exclude current member
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching members:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to search for members. Please try again.",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedMember || !transferAmount) return;
    
    const numAmount = parseFloat(transferAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid positive number.",
      });
      return;
    }

    if (numAmount > walletBalance) {
      toast({
        variant: "destructive",
        title: "Insufficient funds",
        description: `You only have KES ${walletBalance.toLocaleString()} available.`,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      const referenceValue = `Transfer to ${selectedMember.member_number}`;
      const primaryArgs = {
        from_member_id: member.id,
        to_member_id: selectedMember.id,
        amount: numAmount,
        // Try `reference_text` first (some deployments may use this)
        reference_text: referenceValue,
      } as any;
      const fallbackArgs = {
        from_member_id: member.id,
        to_member_id: selectedMember.id,
        amount: numAmount,
        reference: referenceValue,
      } as any;

      const { error: primaryError } = await (supabase.rpc as any)('transfer_funds', primaryArgs);
      if (primaryError) {
        const { error: fallbackError } = await (supabase.rpc as any)('transfer_funds', fallbackArgs);
        if (fallbackError) throw fallbackError;
      }

      toast({
        title: "Transfer successful",
        description: `KES ${numAmount.toLocaleString()} has been transferred to ${selectedMember.name}.`,
      });

      // Refresh data
      await fetchData();
      setTransferOpen(false);
      setTransferAmount("");
      setSearchQuery("");
      setSelectedMember(null);
      setSearchResults([]);
      
    } catch (error) {
      console.error('Transfer error:', error);
      toast({
        variant: "destructive",
        title: "Transfer failed",
        description: error instanceof Error ? error.message : "An error occurred during the transfer.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePin = async () => {
    if (pinData.newPin !== pinData.confirmPin) {
      toast({
        variant: "destructive",
        title: "PIN mismatch",
        description: "New PIN and confirmation PIN do not match.",
      });
      return;
    }
    
    if (pinData.newPin.length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid PIN",
        description: "PIN must be 6 digits.",
      });
      return;
    }

    try {
      setIsChangingPin(true);
      const { data, error } = await (supabase.rpc as any)('update_member_pin', {
        p_member_id: member.id,
        p_old_pin: pinData.oldPin,
        p_new_pin: pinData.newPin
      });

      if (error) throw error;
      
      const response = data as any;
      if (!response.success) {
        throw new Error(response.message);
      }

      toast({
        title: "Success",
        description: "Your login PIN has been updated successfully.",
      });
      
      setChangePinOpen(false);
      setPinData({ oldPin: "", newPin: "", confirmPin: "" });
      
    } catch (error) {
      console.error('Change PIN error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update PIN.",
      });
    } finally {
      setIsChangingPin(false);
    }
  };

  const handlePayToCase = async () => {
    if (!member?.id) return;
    if (!selectedCaseId) {
      toast({
        variant: "destructive",
        title: "Select case",
        description: "Choose a case to pay first.",
      });
      return;
    }

    const selectedCase = activeCasesSummary.find((c) => c.id === selectedCaseId);
    if (!selectedCase) {
      toast({
        variant: "destructive",
        title: "Case not found",
        description: "Please reselect case and try again.",
      });
      return;
    }

    if (selectedCase.paid) {
      toast({
        title: "Already paid",
        description: `You already paid case #${selectedCase.case_number}.`,
      });
      return;
    }

    const requiredAmount = Number(selectedCase.contribution_per_member) || 0;
    if (requiredAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid case amount",
        description: "This case has no valid contribution amount.",
      });
      return;
    }

    if (walletBalance < requiredAmount) {
      toast({
        variant: "destructive",
        title: "Insufficient funds",
        description: `Required KES ${requiredAmount.toLocaleString()}, but your wallet has KES ${walletBalance.toLocaleString()}.`,
      });
      return;
    }

    try {
      setIsPayingCase(true);

      const { data: existingPayment, error: checkError } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("member_id", member.id)
        .eq("case_id", selectedCaseId)
        .in("transaction_type", ["contribution", "case_wallet_deduction"])
        .limit(1);

      if (checkError) throw checkError;

      const isAlreadyPaid = (existingPayment || []).some((tx) => !tx.status || tx.status === "completed");
      if (isAlreadyPaid) {
        toast({
          title: "Already paid",
          description: `You already paid case #${selectedCase.case_number}.`,
        });
        return;
      }

      const { error: insertError } = await supabase.from("transactions").insert({
        member_id: member.id,
        case_id: selectedCaseId,
        amount: requiredAmount,
        transaction_type: "contribution",
        status: "completed",
        description: `Case contribution for case #${selectedCase.case_number} (member portal)`,
        metadata: {
          source: "member_portal_pay_to_case",
        },
      } as any);

      if (insertError) throw insertError;

      toast({
        title: "Payment successful",
        description: `KES ${requiredAmount.toLocaleString()} paid to case #${selectedCase.case_number}.`,
      });

      setPayToCaseOpen(false);
      setSelectedCaseId("");
      await fetchData();
    } catch (error) {
      console.error("Pay to case error:", error);
      toast({
        variant: "destructive",
        title: "Payment failed",
        description: error instanceof Error ? error.message : "Could not pay to case.",
      });
    } finally {
      setIsPayingCase(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout customLinks={memberLinks} customLogout={() => memberLogout(navigate)}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-40" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-44" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!member) {
    return (
      <DashboardLayout customLinks={memberLinks} customLogout={() => memberLogout(navigate)}>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="h-20 w-20 rounded-full bg-red-100 flex items-center justify-center">
            <User className="h-10 w-10 text-red-600" />
          </div>
          <p className="text-xl font-medium">Member not found</p>
          <p className="text-muted-foreground text-center max-w-md">
            We couldn't find your member information. Please contact an administrator if this problem persists.
          </p>
          <Button onClick={() => memberLogout(navigate)} variant="destructive">
            Logout
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout customLinks={memberLinks} customLogout={() => memberLogout(navigate)}>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {member.name}</h1>
            <p className="text-muted-foreground">Member Dashboard</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/member/transactions')}>
              <CreditCard className="h-4 w-4 mr-2" />
              View Transactions
            </Button>
            <Button onClick={() => memberLogout(navigate)} variant="destructive">
              Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5 pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Profile Information
                </CardTitle>
                <Badge variant="outline">{member.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <CardDescription>Your personal information</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Member Number</div>
                    <div className="font-medium">{member.member_number}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="font-medium">{member.email_address || "Not provided"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Phone</div>
                    <div className="font-medium">{member.phone_number || "Not provided"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Home className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Residence</div>
                    <div className="font-medium">{member.residence}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5 pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Wallet Balance
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => navigate('/member/transactions')}
                    className="text-xs"
                  >
                    View History
                  </Button>
                </div>
              </div>
              <CardDescription>Your current account balance</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">
                KES {walletBalance.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-1 mb-4">
                Last updated: {new Date().toLocaleDateString()}
              </div>
              
              <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Transfer to Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Transfer Funds</DialogTitle>
                    <DialogDescription>
                      Transfer funds to another member
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Search Member</Label>
                      <div className="relative">
                        <Input
                          placeholder="Search by name or member number"
                          value={searchQuery}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSearchQuery(value);
                            if (value) {
                              handleSearch(value);
                            } else {
                              setSearchResults([]);
                              setSelectedMember(null);
                            }
                          }}
                          className="pr-10"
                        />
                        {isSearching && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </div>
                        )}
                      </div>
                      
                      {searchResults.length > 0 && !selectedMember && (
                        <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                          {searchResults.map((member) => (
                            <div 
                              key={member.id}
                              className="p-2 hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                setSelectedMember(member);
                                setSearchQuery(`${member.name} (${member.member_number})`);
                                setSearchResults([]);
                              }}
                            >
                              <div className="font-medium">{member.name}</div>
                              <div className="text-sm text-muted-foreground">#{member.member_number}</div>
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
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        disabled={!selectedMember}
                      />
                      <p className="text-xs text-muted-foreground">
                        Available: KES {walletBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setTransferOpen(false);
                        setSearchQuery("");
                        setSelectedMember(null);
                        setTransferAmount("");
                      }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleTransfer}
                      disabled={!selectedMember || !transferAmount || isSubmitting}
                    >
                      {isSubmitting ? 'Transferring...' : 'Transfer'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={payToCaseOpen} onOpenChange={setPayToCaseOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay to Case
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Pay to Case</DialogTitle>
                    <DialogDescription>
                      Select a case and pay the required contribution from your wallet.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Select Case</Label>
                      <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                        <SelectTrigger>
                          <SelectValue placeholder={activeCasesSummary.length > 0 ? "Choose case" : "No open cases"} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeCasesSummary.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              #{c.case_number} - KES {Number(c.contribution_per_member || 0).toLocaleString()}
                              {c.paid ? " (Already paid)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedCaseId && (
                      <div className="rounded-md border p-3 text-sm">
                        {(() => {
                          const selectedCase = activeCasesSummary.find((c) => c.id === selectedCaseId);
                          if (!selectedCase) return null;

                          const requiredAmount = Number(selectedCase.contribution_per_member || 0);
                          const shortfall = Math.max(requiredAmount - walletBalance, 0);

                          return (
                            <div className="space-y-1">
                              <p>Required amount: <strong>KES {requiredAmount.toLocaleString()}</strong></p>
                              <p>Wallet balance: <strong>KES {walletBalance.toLocaleString()}</strong></p>
                              {selectedCase.paid ? (
                                <p className="text-amber-700">Already paid for this case.</p>
                              ) : shortfall > 0 ? (
                                <p className="text-red-600">Insufficient balance. Add KES {shortfall.toLocaleString()} more.</p>
                              ) : (
                                <p className="text-green-700">You have enough balance to pay this case.</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPayToCaseOpen(false);
                        setSelectedCaseId("");
                      }}
                      disabled={isPayingCase}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePayToCase}
                      disabled={!selectedCaseId || isPayingCase || activeCasesSummary.length === 0}
                    >
                      {isPayingCase ? "Paying..." : "Pay"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
          
          <Card className="overflow-hidden border-amber-100 bg-amber-50/10">
            <CardHeader className="bg-amber-100/50 pb-2">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-600" />
                Security Settings
              </CardTitle>
              <CardDescription>Manage your access credentials</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Keep your 6-digit PIN private. Change it regularly for better security.
                </p>
                
                <Dialog open={changePinOpen} onOpenChange={setChangePinOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full bg-white">
                      Change Login PIN
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Change Secret PIN</DialogTitle>
                      <DialogDescription>
                        Update your 6-digit access PIN
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Current PIN</Label>
                        <Input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••••"
                          value={pinData.oldPin}
                          onChange={(e) => setPinData({ ...pinData, oldPin: e.target.value.replace(/\D/g, '') })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>New 6-Digit PIN</Label>
                        <Input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••••"
                          value={pinData.newPin}
                          onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '') })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirm New PIN</Label>
                        <Input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••••"
                          value={pinData.confirmPin}
                          onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                        />
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setChangePinOpen(false)}>Cancel</Button>
                      <Button onClick={handleChangePin} disabled={isChangingPin || pinData.newPin.length !== 6}>
                        {isChangingPin ? "Updating..." : "Update PIN"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="bg-primary/5 pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Recent Transactions
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/member/transactions')}
                className="text-xs"
              >
                View All
              </Button>
            </div>
            <CardDescription>Your most recent transactions</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {transactions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                No transactions found. Start contributing to see your transactions here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 font-medium">Date</th>
                      <th className="py-3 px-2 font-medium">Amount</th>
                      <th className="py-3 px-2 font-medium">Type</th>
                      <th className="py-3 px-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 5).map((t) => (
                      <tr key={t.id} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-3 px-2">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className={`py-3 px-2 font-medium ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {t.amount < 0 ? '-' : '+'} KES {Math.abs(Number(t.amount))?.toLocaleString()}
                        </td>
                        <td className="py-3 px-2">{t.transaction_type}</td>
                        <td className="py-3 px-2">{t.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MemberDashboard;
