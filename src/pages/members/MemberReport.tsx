import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { memberLinks, memberLogout } from "./memberLinks";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  Loader2, 
  TrendingUp, 
  Calendar, 
  CreditCard,
  PieChart, 
  ArrowUp, 
  ArrowDown,
  Download,
  User,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from "recharts";
import { format, subMonths, differenceInMonths, parseISO, startOfMonth, endOfMonth } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/components/ui/use-toast";

// Helper to group transactions by month
const groupByMonth = (transactions) => {
  const grouped = {};
  
  transactions.forEach(transaction => {
    const date = new Date(transaction.created_at);
    const month = format(date, "MMM yyyy");
    
    if (!grouped[month]) {
      grouped[month] = {
        month,
        contributions: 0,
        disbursements: 0,
        count: 0
      };
    }
    
    if (transaction.transaction_type === "contribution") {
      grouped[month].contributions += transaction.amount || 0;
    } else if (transaction.transaction_type === "disbursement") {
      grouped[month].disbursements += transaction.amount || 0;
    }
    
    grouped[month].count += 1;
  });
  
  // Convert to array and sort by date
  return Object.values(grouped).sort((a, b) => {
    return new Date(a.month) - new Date(b.month);
  });
};

// Helper to group cases by type
const groupCasesByType = (cases) => {
  const grouped = {};
  
  cases.forEach(caseItem => {
    const type = caseItem.case_type || "Unknown";
    
    if (!grouped[type]) {
      grouped[type] = {
        name: type,
        count: 0,
        value: 0
      };
    }
    
    grouped[type].count += 1;
    grouped[type].value += 1;
  });
  
  return Object.values(grouped);
};

// Helper to group contributions by case type
const groupContributionsByCaseType = (transactions, cases) => {
  const grouped = {};
  
  transactions.forEach(transaction => {
    const relatedCase = cases.find(c => c.id === transaction.case_id);
    const type = relatedCase?.case_type || "Other";
    
    if (!grouped[type]) {
      grouped[type] = {
        name: type,
        value: 0,
        color: getCaseTypeColor(type)
      };
    }
    
    grouped[type].value += transaction.amount || 0;
  });
  
  return Object.values(grouped);
};

// Colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// Helper to get a color for case type
const getCaseTypeColor = (type) => {
  switch (type?.toLowerCase()) {
    case "education":
      return "#0088FE";
    case "sickness":
      return "#00C49F";
    case "death":
      return "#FFBB28";
    default:
      return "#FF8042";
  }
};

const MemberReport = () => {
  const [member, setMember] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [casesByType, setCasesByType] = useState<any[]>([]);
  const [contributionsByType, setContributionsByType] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalContributions: 0,
    totalDisbursements: 0,
    activeCases: 0,
    completedCases: 0,
    averageContribution: 0,
    contributionCount: 0
  });
  
  const reportRef = useRef(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Filter for 'Contribution for case' transactions
  const caseContributionTransactions = (transactions || []).filter(
    t => t.description && t.description.toLowerCase().includes('contribution for case')
  );

  // Group for monthly chart
  const monthlyCaseContribData = groupByMonth(caseContributionTransactions);

  // Calculate total contributions for case
  const totalCaseContributions = caseContributionTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const caseContributionCount = caseContributionTransactions.length;

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    
    const fetchData = async () => {
      try {
        // Fetch member details
        const { data: memberData } = await supabase
          .from("members")
          .select("*")
          .eq("id", member_id)
          .single();
        
        // Fetch transactions for the past year
        const oneYearAgo = subMonths(new Date(), 12);
        const { data: transactionsData } = await supabase
          .from("transactions")
          .select("*")
          .eq("member_id", member_id)
          .gte("created_at", oneYearAgo.toISOString())
          .order("created_at", { ascending: true });
        
        // Fetch all cases
        const { data: casesData } = await supabase
          .from("cases")
          .select("*");
        
        setMember(memberData);
        setTransactions(transactionsData || []);
        setCases(casesData || []);
        
        // Process data for charts and stats
        // Only use 'Contribution for case' transactions for monthly chart and total contributions
        const filteredContribs = (transactionsData || []).filter(
          t => t.description && t.description.toLowerCase().includes('contribution for case')
        );
        setMonthlyData(groupByMonth(filteredContribs));
        
        const caseTypeData = groupCasesByType(
          (casesData || []).filter(c => c.affected_member_id === member_id)
        );
        setCasesByType(caseTypeData);
        
        const contribByType = groupContributionsByCaseType(transactionsData || [], casesData || []);
        setContributionsByType(contribByType);
        
        // Calculate statistics
        const totalContrib = filteredContribs.reduce((sum, t) => sum + (t.amount || 0), 0);
        const contribCount = filteredContribs.length;
        const totalDisb = (transactionsData || [])
          .filter(t => t.transaction_type === "disbursement")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        
        const activeCases = (casesData || [])
          .filter(c => c.is_active && !c.is_finalized && c.affected_member_id === member_id)
          .length;
        
        const completedCases = (casesData || [])
          .filter(c => c.is_finalized && c.affected_member_id === member_id)
          .length;
        
        setStats({
          totalContributions: totalContrib,
          totalDisbursements: totalDisb,
          activeCases,
          completedCases,
          averageContribution: contribCount > 0 ? totalContrib / contribCount : 0,
          contributionCount: contribCount
        });
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate]);

  const formatCurrency = (amount: number) => {
    return `KES ${amount?.toLocaleString() || "0"}`;
  };

  // Function to handle PDF export
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    
    setExporting(true);
    toast({
      title: "Preparing report",
      description: "Please wait while we generate your PDF..."
    });
    
    try {
      // Delay to let toast appear
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const reportElement = reportRef.current;
      const canvas = await html2canvas(reportElement, {
        scale: 1.5, // Higher scale for better quality
        useCORS: true, // To handle images from different origins
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL('image/png');
      
      // Create PDF with appropriate dimensions
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10; // Small margin at top
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      
      // Add page number and footer
      const totalPages = Math.ceil((imgHeight * ratio) / (pdfHeight - 20));
      
      // If content is longer than one page, create additional pages
      if (totalPages > 1) {
        let remainingHeight = imgHeight * ratio - (pdfHeight - 20);
        let sourceY = (pdfHeight - 20) / ratio;
        
        for (let i = 1; i < totalPages; i++) {
          pdf.addPage();
          
          const currentHeight = Math.min(pdfHeight - 20, remainingHeight);
          const currentHeightInPx = currentHeight / ratio;
          
          pdf.addImage(
            imgData, 
            'PNG', 
            imgX, 
            imgY, 
            imgWidth * ratio, 
            imgHeight * ratio,
            null, 
            'FAST',
            0,
            -sourceY
          );
          
          sourceY += currentHeightInPx;
          remainingHeight -= currentHeight;
        }
      }
      
      // Add metadata
      pdf.setProperties({
        title: `Financial Report - ${member?.name || 'Member'}`,
        subject: 'MCWG Financial Report',
        author: 'MCWG System',
        creator: 'MCWG System'
      });
      
      // Generate filename with date
      const fileName = `Financial_Report_${member?.name?.replace(/\s+/g, '_') || 'Member'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      
      // Save the PDF
      pdf.save(fileName);
      
      toast({
        title: "Report downloaded",
        description: "Your financial report has been downloaded successfully!",
        variant: "success"
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Export failed",
        description: "There was an error generating your report. Please try again.",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  // --- Wallet balance from all transactions ---
  const walletBalance = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // --- Net financial impact ---
  const netImpact = stats.totalContributions - stats.totalDisbursements;

  // --- Member's own cases ---
  const memberCases = cases.filter(c => c.affected_member_id === member?.id);

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-8">
        {/* Profile & Wallet Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {member?.name || 'Member'}
              </CardTitle>
              <CardDescription>Member #{member?.member_number}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">Email: <span className="font-medium text-foreground">{member?.email_address || 'Not provided'}</span></div>
              <div className="text-sm text-muted-foreground">Phone: <span className="font-medium text-foreground">{member?.phone_number || 'Not provided'}</span></div>
              <div className="text-sm text-muted-foreground">Residence: <span className="font-medium text-foreground">{member?.residence || 'Not provided'}</span></div>
              <div className="text-sm text-muted-foreground">National ID: <span className="font-medium text-foreground">{member?.national_id_number || 'Not provided'}</span></div>
              <div className="text-sm text-muted-foreground">Join Date: <span className="font-medium text-foreground">{member?.created_at ? new Date(member.created_at).toLocaleDateString() : 'Unknown'}</span></div>
              <Badge variant={member?.is_active ? 'outline' : 'destructive'}>{member?.is_active ? 'Active' : 'Inactive'}</Badge>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/10 dark:to-green-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                Wallet Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">KES {walletBalance.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground mt-1">Calculated from all transactions</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/10 dark:to-blue-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Net Financial Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${netImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>KES {netImpact.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground mt-1">Contributions minus Disbursements</div>
            </CardContent>
          </Card>
        </div>

        {/* Key Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Contributions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">KES {totalCaseContributions.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{caseContributionCount} payments (case contributions)</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Disbursements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">KES {stats.totalDisbursements.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Received in past 12 months</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{transactions.length}</div>
              <div className="text-sm text-muted-foreground">All time</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Contribution & Disbursement</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyCaseContribData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`KES ${value.toLocaleString()}`, undefined]} labelFormatter={(label) => `Month: ${label}`} />
                  <Legend />
                  <Area type="monotone" dataKey="contributions" name="Contributions" stackId="1" stroke="#4ade80" fill="#4ade80" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="disbursements" name="Disbursements" stackId="2" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contributions by Case Type</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={contributionsByType} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                    {contributionsByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`KES ${value.toLocaleString()}`, undefined]} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Transaction Count by Month */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Activity</CardTitle>
            <CardDescription>Number of transactions per month</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Transactions" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Last 5 transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No transactions available</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-1/4">Date</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-1/4">Type</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-1/4">Description</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground w-1/4">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions
                        .slice()
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .slice(0, 5)
                        .map((transaction, index) => (
                          <tr key={transaction.id} className={index % 2 ? "bg-muted/20" : ""}>
                            <td className="px-4 py-3 text-sm">{format(new Date(transaction.created_at), "MMM d, yyyy")}</td>
                            <td className="px-4 py-3 text-sm">
                              <Badge variant="outline" className={transaction.transaction_type === "contribution" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>{transaction.transaction_type}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm truncate">{transaction.description || "N/A"}</td>
                            <td className="px-4 py-3 text-sm font-medium text-right"><span className={transaction.transaction_type === "contribution" ? "text-green-600" : "text-blue-600"}>{`KES ${transaction.amount?.toLocaleString()}`}</span></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Case Summary */}
        <Card>
          <CardHeader>
            <CardTitle>My Cases</CardTitle>
            <CardDescription>Summary of your welfare cases</CardDescription>
          </CardHeader>
          <CardContent>
            {memberCases.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No cases found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="py-3 px-2 font-medium">Case Number</th>
                      <th className="py-3 px-2 font-medium">Type</th>
                      <th className="py-3 px-2 font-medium">Status</th>
                      <th className="py-3 px-2 font-medium">Start Date</th>
                      <th className="py-3 px-2 font-medium">End Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberCases.slice(0, 5).map((c) => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-3 px-2">{c.case_number}</td>
                        <td className="py-3 px-2">{c.case_type}</td>
                        <td className="py-3 px-2">
                          <Badge variant={c.is_active && !c.is_finalized ? 'outline' : 'destructive'}>
                            {c.is_finalized ? 'Completed' : c.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">{c.start_date ? new Date(c.start_date).toLocaleDateString() : '-'}</td>
                        <td className="py-3 px-2">{c.end_date ? new Date(c.end_date).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Annual Summary */}
        <Card className="bg-muted/10">
          <CardHeader>
            <CardTitle>Annual Summary</CardTitle>
            <CardDescription>Summary of your financial activity this year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Contributions</span>
                  <span className="font-medium">KES {stats.totalContributions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Disbursements</span>
                  <span className="font-medium">KES {stats.totalDisbursements.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Net Financial Impact</span>
                  <span className={netImpact >= 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'}>KES {netImpact.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Transactions</span>
                  <span className="font-medium">{transactions.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Cases</span>
                  <span className="font-medium">{stats.activeCases}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Completed Cases</span>
                  <span className="font-medium">{stats.completedCases}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MemberReport;