import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, User, Calendar, Phone, Mail, Home, FileText } from "lucide-react";
import { memberLinks, memberLogout } from "./memberLinks";

const MemberDashboard = () => {
  const [member, setMember] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    const fetchData = async () => {
      // Fetch member details
      const { data: memberData } = await supabase
        .from("members")
        .select("*")
        .eq("id", member_id)
        .single();

      // Fetch all transactions for the member
      const { data: allTransData } = await supabase
        .from("transactions")
        .select("*")
        .eq("member_id", member_id)
        .order("created_at", { ascending: false });

      setMember(memberData);
      setTransactions(allTransData || []);
      // Calculate wallet balance as sum of all transaction amounts
      const balance = (allTransData || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      setWalletBalance(balance);
      setLoading(false);
    };
    fetchData();
  }, [navigate]);

  if (loading) {
    return (
      <DashboardLayout
        customLinks={memberLinks}
        customLogout={() => memberLogout(navigate)}
      >
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
      <DashboardLayout
        customLinks={memberLinks}
        customLogout={() => memberLogout(navigate)}
      >
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
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
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
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate('/member/transactions')}
                  className="text-xs"
                >
                  View History
                </Button>
              </div>
              <CardDescription>Your current account balance</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">
                KES {walletBalance.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Last updated: {new Date().toLocaleDateString()}
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
                        <td className="py-3 px-2 font-medium text-green-600">KES {t.amount?.toLocaleString()}</td>
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
