import { useEffect, useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { memberLinks, memberLogout } from "./memberLinks";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ArrowUpRight, ArrowDownLeft, Calendar, Loader2, Clock, DollarSign, Filter } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MemberTransactions = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    supabase
      .from("transactions")
      .select("*")
      .eq("member_id", member_id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTransactions(data || []);
        setFilteredTransactions(data || []);
        
        // Calculate totals
        let credits = 0;
        let debits = 0;
        data?.forEach(t => {
          if (t.transaction_type === "contribution" || t.transaction_type === "deposit") {
            credits += (t.amount || 0);
          } else {
            debits += (t.amount || 0);
          }
        });
        setTotalCredit(credits);
        setTotalDebit(debits);
        
        setLoading(false);
      });
  }, [navigate]);

  useEffect(() => {
    // Filter transactions based on search query and type filter
    let filtered = [...transactions];
    
    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.transaction_type?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (typeFilter !== "all") {
      filtered = filtered.filter(t => t.transaction_type === typeFilter);
    }
    
    setFilteredTransactions(filtered);
  }, [searchQuery, typeFilter, transactions]);

  const getTransactionTypeIcon = (type: string) => {
    if (type === "contribution" || type === "deposit") {
      return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    }
    return <ArrowDownLeft className="h-4 w-4 text-red-500" />;
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case "contribution":
        return "bg-blue-100 text-blue-800";
      case "deposit":
        return "bg-green-100 text-green-800";
      case "disbursement":
        return "bg-amber-100 text-amber-800";
      case "withdrawal":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getInitials = (description: string) => {
    if (!description) return "TX";
    const words = description.split(" ");
    if (words.length === 1) return description.substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount?.toLocaleString() || "0"}`;
  };

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">My Transactions</h1>
          <p className="text-muted-foreground">View and track your financial activities</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Transactions Card */}
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Total Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{transactions.length}</div>
                  <p className="text-sm text-muted-foreground mt-1">All time transactions</p>
                </CardContent>
              </Card>
              
              {/* Total Credits Card */}
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/10 dark:to-green-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowUpRight className="h-5 w-5 text-green-600" />
                    Total Credits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{formatCurrency(totalCredit)}</div>
                  <p className="text-sm text-muted-foreground mt-1">Deposits & Contributions</p>
                </CardContent>
              </Card>
              
              {/* Total Debits Card */}
              <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/10 dark:to-red-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowDownLeft className="h-5 w-5 text-red-600" />
                    Total Debits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">{formatCurrency(totalDebit)}</div>
                  <p className="text-sm text-muted-foreground mt-1">Withdrawals & Disbursements</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Transaction History
                  </div>
                  <div className="text-sm font-normal">
                    <Badge variant="outline">
                      {filteredTransactions.length} Transaction{filteredTransactions.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>All your financial activities</CardDescription>
                
                <div className="mt-4 flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                    <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="contribution">Contributions</SelectItem>
                      <SelectItem value="deposit">Deposits</SelectItem>
                      <SelectItem value="withdrawal">Withdrawals</SelectItem>
                      <SelectItem value="disbursement">Disbursements</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              
              <CardContent>
                <Tabs defaultValue="list" className="mt-2">
                  <TabsList className="grid grid-cols-2 w-[200px] mb-4">
                    <TabsTrigger value="list">List</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="list" className="space-y-0">
                    {filteredTransactions.length === 0 ? (
                      <div className="text-center py-12 border rounded-lg bg-muted/10">
                        <CreditCard className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Transactions Found</h3>
                        <p className="text-muted-foreground">
                          {searchQuery || typeFilter !== "all" 
                            ? "Try adjusting your filters" 
                            : "You don't have any transactions in your account yet."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredTransactions.map((t) => (
                          <div key={t.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-4">
                              <Avatar className="h-10 w-10 border">
                                <AvatarFallback className={`
                                  ${t.transaction_type === "contribution" ? "bg-blue-100 text-blue-800" : ""}
                                  ${t.transaction_type === "deposit" ? "bg-green-100 text-green-800" : ""}
                                  ${t.transaction_type === "withdrawal" ? "bg-red-100 text-red-800" : ""}
                                  ${t.transaction_type === "disbursement" ? "bg-amber-100 text-amber-800" : ""}
                                  ${!["contribution", "deposit", "withdrawal", "disbursement"].includes(t.transaction_type) ? "bg-gray-100 text-gray-800" : ""}
                                `}>
                                  {getInitials(t.description)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{t.description || t.transaction_type}</div>
                                <div className="flex items-center text-sm text-muted-foreground">
                                  <Calendar className="h-3.5 w-3.5 mr-1" />
                                  {format(new Date(t.created_at), "MMM d, yyyy • h:mm a")}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={t.transaction_type === "contribution" || t.transaction_type === "deposit" 
                                ? "text-green-600 font-semibold" 
                                : "text-red-600 font-semibold"}>
                                {t.transaction_type === "contribution" || t.transaction_type === "deposit" ? "+" : "-"}
                                KES {t.amount?.toLocaleString()}
                              </div>
                              <Badge variant="outline" className={getTransactionTypeColor(t.transaction_type)}>
                                {t.transaction_type}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="timeline" className="relative">
                    {filteredTransactions.length === 0 ? (
                      <div className="text-center py-12 border rounded-lg bg-muted/10">
                        <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Timeline Data</h3>
                        <p className="text-muted-foreground">
                          {searchQuery || typeFilter !== "all" 
                            ? "Try adjusting your filters" 
                            : "You don't have any transactions to display in the timeline."}
                        </p>
                      </div>
                    ) : (
                      <div className="relative pl-8 border-l-2 border-muted pb-10 pt-2 ml-4">
                        {filteredTransactions.map((t, index) => (
                          <div key={t.id} className="mb-8 relative">
                            <div className="absolute -left-[2.7rem] w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              {getTransactionTypeIcon(t.transaction_type)}
                            </div>
                            <div className="mb-1 text-sm text-muted-foreground">
                              {format(new Date(t.created_at), "MMMM d, yyyy • h:mm a")}
                            </div>
                            <Card className="overflow-hidden">
                              <CardHeader className="py-3 px-4 bg-muted/10 flex flex-row justify-between items-center">
                                <div className="font-medium">{t.description || t.transaction_type}</div>
                                <Badge variant="outline" className={getTransactionTypeColor(t.transaction_type)}>
                                  {t.transaction_type}
                                </Badge>
                              </CardHeader>
                              <CardContent className="py-3 px-4">
                                <div className="flex justify-between items-center">
                                  <div className="text-sm text-muted-foreground">Amount</div>
                                  <div className={t.transaction_type === "contribution" || t.transaction_type === "deposit" 
                                    ? "text-green-600 font-semibold" 
                                    : "text-red-600 font-semibold"}>
                                    {t.transaction_type === "contribution" || t.transaction_type === "deposit" ? "+" : "-"}
                                    KES {t.amount?.toLocaleString()}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
              
              <CardFooter className="border-t px-6 py-4 flex justify-between bg-muted/5">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredTransactions.length} of {transactions.length} transactions
                </div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("all");
                }}>
                  Reset Filters
                </Button>
              </CardFooter>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MemberTransactions;
