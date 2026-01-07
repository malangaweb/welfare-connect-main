import { useEffect, useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { memberLinks, memberLogout } from "./memberLinks";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, Loader2, CheckCircle, Clock, AlertCircle, CreditCard, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MemberCases = () => {
  const [cases, setCases] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filteredCases, setFilteredCases] = useState<any[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    
    const fetchData = async () => {
      try {
        // Fetch ALL cases, not just those associated with this member
        const { data: casesData } = await supabase
          .from("cases")
          .select("*")
          .order("created_at", { ascending: false });
        // Fetch all members to get count
        const { data: membersData } = await supabase
          .from("members")
          .select("*");
        setMemberCount((membersData || []).length);
        // Fetch all transactions
        const { data: transactionsData } = await supabase
          .from("transactions")
          .select("amount, description, case_id, created_at");
        setTransactions(transactionsData || []);
        // Map cases to include calculated actual_amount and expected_amount
        const mappedCases = (casesData || []).map(c => {
          // Calculate collected amount for this case
          let collected = 0;
          if (transactionsData && c.case_number) {
            collected = transactionsData
              .filter(tx => tx.description && tx.description.toLowerCase().includes(c.case_number.toLowerCase()))
              .reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
          }
          return {
            ...c,
            actual_amount: collected,
            expected_amount: c.contribution_per_member * (membersData ? membersData.length : 0),
          };
        });
        setCases(mappedCases);
        setFilteredCases(mappedCases);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate]);

  useEffect(() => {
    // Apply filters
    let filtered = [...cases];
    
    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.case_number?.toString().includes(searchQuery) ||
        c.case_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.affected_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(c => {
        if (statusFilter === "open") return c.is_active && !c.is_finalized;
        if (statusFilter === "closed") return c.is_finalized;
        if (statusFilter === "draft") return !c.is_active && !c.is_finalized;
        return true;
      });
    }
    
    setFilteredCases(filtered);
  }, [searchQuery, statusFilter, cases]);

  const getCaseTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case "education":
        return "bg-blue-100 text-blue-800 hover:bg-blue-100";
      case "sickness":
        return "bg-amber-100 text-amber-800 hover:bg-amber-100";
      case "death":
        return "bg-purple-100 text-purple-800 hover:bg-purple-100";
      default:
        return "";
    }
  };
  
  const getStatusColor = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return "bg-green-100 text-green-800 hover:bg-green-100";
    if (isActive) return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    return "bg-gray-100 text-gray-800 hover:bg-gray-100";
  };
  
  const getStatusText = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return "Closed";
    if (isActive) return "Open";
    return "Draft";
  };

  const getStatusIcon = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (isActive) return <Clock className="h-4 w-4 text-emerald-600" />;
    return <AlertCircle className="h-4 w-4 text-gray-600" />;
  };

  // Check if member has contributed to this case
  const hasContributed = (caseId: string) => {
    return transactions.some(t => t.case_id === caseId);
  };

  // Get contributions for a case
  const getContributionsForCase = (caseId: string) => {
    return transactions.filter(t => t.case_id === caseId);
  };

  // Calculate progress for a case
  const calculateProgress = (caseItem: any) => {
    if (!caseItem.expected_amount || caseItem.expected_amount === 0) return 0;
    return (caseItem.actual_amount / caseItem.expected_amount) * 100;
  };

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">All Cases</h1>
          <p className="text-muted-foreground">View all cases and your contributions</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        ) : (
          <Tabs defaultValue="all" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="all">All Cases</TabsTrigger>
              <TabsTrigger value="contributions">My Contributions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cases List</CardTitle>
                  <CardDescription>View all active and closed cases</CardDescription>
                  
                  <div className="mt-4 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Search cases..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                      <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                
                <CardContent>
                  {filteredCases.length === 0 ? (
                    <div className="text-center py-12 border rounded-lg bg-muted/10">
                      <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Cases Found</h3>
                      <p className="text-muted-foreground">
                        {searchQuery || statusFilter !== "all" 
                          ? "Try adjusting your filters" 
                          : "There are no cases to display at this time."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredCases.map((c) => (
                        <Card key={c.id} className={`overflow-hidden hover:shadow-md transition-shadow ${hasContributed(c.id) ? 'border-primary/30' : ''}`}>
                          <CardHeader className="pb-2 border-b">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium">Case #{c.case_number}</h3>
                                <Badge variant="outline" className={getCaseTypeColor(c.case_type)}>
                                  {c.case_type}
                                </Badge>
                                <Badge variant="outline" className={getStatusColor(c.is_active, c.is_finalized)}>
                                  {getStatusText(c.is_active, c.is_finalized)}
                                </Badge>
                                {hasContributed(c.id) && (
                                  <Badge variant="secondary">You Contributed</Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="pt-4">
                            <div className="space-y-4">
                              <div className="flex items-start gap-2">
                                <User className="h-4 w-4 text-muted-foreground mt-1" />
                                <div>
                                  <div className="text-sm text-muted-foreground">Affected Member</div>
                                  <div className="font-medium">{c.affected_name || "Unknown"}</div>
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                                <div>
                                  <div className="text-sm text-muted-foreground">Time Period</div>
                                  <div className="font-medium">
                                    {format(new Date(c.start_date), "MMM d, yyyy")} - {format(new Date(c.end_date), "MMM d, yyyy")}
                                  </div>
                                </div>
                              </div>
                              
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm">Collection Progress</span>
                                  <span className="text-sm font-medium">{Math.round(calculateProgress(c))}%</span>
                                </div>
                                <Progress value={calculateProgress(c)} className="h-2" />
                                <div className="mt-2 flex justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    KES {(c.actual_amount || 0).toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground">
                                    KES {(c.expected_amount || 0).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between pt-2">
                                <div>
                                  <div className="text-sm text-muted-foreground">Per Member</div>
                                  <div className="font-semibold">KES {(c.contribution_per_member || 0).toLocaleString()}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {getStatusIcon(c.is_active, c.is_finalized)}
                                  <span className="text-sm font-medium">
                                    {getStatusText(c.is_active, c.is_finalized)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                          
                          <CardFooter className="border-t bg-muted/5 p-4 flex justify-between items-center">
                            <div className="text-sm text-muted-foreground">
                              {c.created_at ? `Created ${format(new Date(c.created_at), "MMM d, yyyy")}` : ""}
                            </div>
                            {hasContributed(c.id) && (
                              <Badge variant="outline" className="bg-primary/10">
                                {getContributionsForCase(c.id).length} Contribution{getContributionsForCase(c.id).length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
                
                <CardFooter className="border-t px-6 py-4 flex justify-between bg-muted/5">
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredCases.length} of {cases.length} cases
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}>
                    Reset Filters
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            
            <TabsContent value="contributions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">My Contributions</CardTitle>
                  <CardDescription>Your contribution history across all cases</CardDescription>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <div className="text-center py-12 border rounded-lg bg-muted/10">
                      <CreditCard className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Contributions Found</h3>
                      <p className="text-muted-foreground">
                        You haven't made any contributions yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {transactions.map((t) => {
                        // Find the related case
                        const relatedCase = cases.find(c => c.id === t.case_id);
                        
                        return (
                          <div key={t.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-2">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <CreditCard className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="font-medium">{t.description || "Contribution"}</div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {format(new Date(t.created_at), "MMM d, yyyy")}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                              {relatedCase && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-sm text-muted-foreground">Case:</span>
                                  <Badge variant="outline" className={getCaseTypeColor(relatedCase.case_type)}>
                                    {relatedCase.case_type} #{relatedCase.case_number}
                                  </Badge>
                                  <Badge variant="outline" className={getStatusColor(relatedCase.is_active, relatedCase.is_finalized)}>
                                    {getStatusText(relatedCase.is_active, relatedCase.is_finalized)}
                                  </Badge>
                                </div>
                              )}
                              
                              <div className={`${(Number(t.amount) || 0) < 0 ? 'text-red-600' : 'text-green-600'} font-semibold whitespace-nowrap`}>
                                {(Number(t.amount) || 0) < 0 ? '-' : '+'} KES {Math.abs(Number(t.amount) || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MemberCases;
