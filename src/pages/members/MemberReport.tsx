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
  Download
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
        const monthlyTransactions = groupByMonth(transactionsData || []);
        setMonthlyData(monthlyTransactions);
        
        const caseTypeData = groupCasesByType(
          (casesData || []).filter(c => c.affected_member_id === member_id)
        );
        setCasesByType(caseTypeData);
        
        const contribByType = groupContributionsByCaseType(transactionsData || [], casesData || []);
        setContributionsByType(contribByType);
        
        // Calculate statistics
        const totalContrib = (transactionsData || [])
          .filter(t => t.transaction_type === "contribution")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
          
        const totalDisb = (transactionsData || [])
          .filter(t => t.transaction_type === "disbursement")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
          
        const contribCount = (transactionsData || [])
          .filter(t => t.transaction_type === "contribution")
          .length;
        
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

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-1">Financial Report</h1>
            <p className="text-muted-foreground">Your contribution and case statistics</p>
          </div>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleExportPDF}
            disabled={loading || exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Report
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        ) : (
          <div ref={reportRef}>
            {/* Report Header */}
            <div className="mb-6 pb-6 border-b">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{member?.name || 'Member'} - Financial Report</h2>
                  <p className="text-sm text-muted-foreground">
                    Generated on {format(new Date(), "MMMM d, yyyy")}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-sm font-semibold">Malanga Community Welfare Group</p>
                  <p className="text-sm text-muted-foreground">Member #{member?.member_number}</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Contributions Card */}
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/10 dark:to-green-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-green-600" />
                    Total Contributions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {formatCurrency(stats.totalContributions)}
                  </div>
                  <div className="flex items-center mt-2 text-sm">
                    <Badge variant="outline" className="bg-green-100 text-green-800 mr-2">
                      {stats.contributionCount} payments
                    </Badge>
                    <span className="text-muted-foreground">Past 12 months</span>
                  </div>
                </CardContent>
              </Card>
              
              {/* Total Disbursements Card */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/10 dark:to-blue-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowDown className="h-5 w-5 text-blue-600" />
                    Total Disbursements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {formatCurrency(stats.totalDisbursements)}
                  </div>
                  <div className="flex items-center mt-2 text-sm">
                    <span className="text-muted-foreground">Received in past 12 months</span>
                  </div>
                </CardContent>
              </Card>
              
              {/* Average Contribution Card */}
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/10 dark:to-amber-900/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                    Average Contribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-600">
                    {stats.activeCases + stats.completedCases}
                  </div>
                  <div className="flex items-center mt-2 text-sm gap-2">
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800">
                      {stats.activeCases} Active
                    </Badge>
                    <Badge variant="outline" className="bg-gray-100 text-gray-800">
                      {stats.completedCases} Completed
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="detailed">Detailed Analysis</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-6">
                {/* Monthly Contributions Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Contribution Activity</CardTitle>
                    <CardDescription>Your financial activity over the past year</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={monthlyData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`KES ${value.toLocaleString()}`, undefined]}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="contributions" 
                          name="Contributions" 
                          stackId="1"
                          stroke="#4ade80" 
                          fill="#4ade80" 
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="disbursements" 
                          name="Disbursements" 
                          stackId="2"
                          stroke="#60a5fa" 
                          fill="#60a5fa"
                          fillOpacity={0.6} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contributions by Case Type */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Contributions by Case Type</CardTitle>
                      <CardDescription>
                        How your contributions are distributed
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      {contributionsByType.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground">No contribution data available</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={contributionsByType}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {contributionsByType.map((entry, index) => (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={entry.color || COLORS[index % COLORS.length]} 
                                />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value) => [`KES ${value.toLocaleString()}`, undefined]}
                            />
                            <Legend />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Transaction Count by Month */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Transaction Activity</CardTitle>
                      <CardDescription>
                        Number of transactions per month
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar 
                            dataKey="count" 
                            name="Transactions" 
                            fill="#8884d8" 
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              
              <TabsContent value="detailed" className="space-y-6">
                {/* Detailed Contribution Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contribution vs Disbursement</CardTitle>
                    <CardDescription>Monthly comparison of financial flows</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`KES ${value.toLocaleString()}`, undefined]}
                        />
                        <Legend />
                        <Bar 
                          dataKey="contributions" 
                          name="Contributions" 
                          fill="#4ade80" 
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey="disbursements" 
                          name="Disbursements" 
                          fill="#60a5fa" 
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                
                {/* Transaction History Table */}
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
                              {transactions.slice(0, 5).map((transaction, index) => (
                                <tr key={transaction.id} className={index % 2 ? "bg-muted/20" : ""}>
                                  <td className="px-4 py-3 text-sm">
                                    {format(new Date(transaction.created_at), "MMM d, yyyy")}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <Badge variant="outline" className={
                                      transaction.transaction_type === "contribution" 
                                        ? "bg-green-100 text-green-800" 
                                        : "bg-blue-100 text-blue-800"
                                    }>
                                      {transaction.transaction_type}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-sm truncate">
                                    {transaction.description || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-medium text-right">
                                    <span className={
                                      transaction.transaction_type === "contribution" 
                                        ? "text-green-600" 
                                        : "text-blue-600"
                                    }>
                                      {formatCurrency(transaction.amount)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-center border-t">
                    <Button variant="outline" size="sm" onClick={() => navigate('/member/transactions')}>
                      View All Transactions
                    </Button>
                  </CardFooter>
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
                          <span className="font-medium">{formatCurrency(stats.totalContributions)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Disbursements</span>
                          <span className="font-medium">{formatCurrency(stats.totalDisbursements)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Net Financial Impact</span>
                          <span className={stats.totalContributions > stats.totalDisbursements ? "font-medium text-green-600" : "font-medium text-red-600"}>
                            {formatCurrency(stats.totalContributions - stats.totalDisbursements)}
                          </span>
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
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MemberReport;