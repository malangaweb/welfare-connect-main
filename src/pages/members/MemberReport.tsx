import { useEffect, useState, useRef, useMemo, useCallback } from "react";
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
  Wallet,
  AlertCircle,
  FileSpreadsheet,
  Filter,
  Search,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { format, subMonths, differenceInMonths, parseISO, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { loadHtml2canvas, loadJsPdf } from "@/lib/reportExportLibs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { walletRowDelta } from "@/lib/walletEffect";
import { CASE_ROW_COLUMNS, MEMBER_DETAIL_COLUMNS, TRANSACTION_LIST_COLUMNS } from "@/lib/supabaseSelectColumns";

interface Member {
  id: string;
  name: string;
  member_number?: string;
  email_address?: string;
  phone_number?: string;
  residence?: string;
  national_id_number?: string;
  created_at?: string;
  wallet_balance?: number;
  is_active: boolean;
}

interface Transaction {
  id: string;
  created_at: string;
  transaction_type: string;
  amount: number;
  description?: string;
  case_id?: string;
  member_id?: string;
}

interface CaseItem {
  id: string;
  case_type: string;
  case_number?: string;
  affected_member_id?: string;
  is_active?: boolean;
  is_finalized?: boolean;
  start_date?: string;
  end_date?: string;
}

interface MonthlyGrouped {
  monthKey: string;
  month: string;
  contributions: number;
  disbursements: number;
  count: number;
}

interface CaseTypeGrouped {
  name: string;
  count: number;
  value: number;
}

interface ContributionByType {
  name: string;
  value: number;
  color: string;
}

const groupByMonth = (transactions: Transaction[]): MonthlyGrouped[] => {
  const grouped: Record<string, MonthlyGrouped> = {};
  
  transactions.forEach(transaction => {
    const date = new Date(transaction.created_at);
    const monthKey = format(date, "yyyy-MM");
    const month = format(date, "MMM yyyy");
    
    if (!grouped[monthKey]) {
      grouped[monthKey] = {
        monthKey,
        month,
        contributions: 0,
        disbursements: 0,
        count: 0
      };
    }
    
    if (transaction.transaction_type === "contribution") {
      grouped[monthKey].contributions += Math.abs(transaction.amount || 0);
    } else if (transaction.transaction_type === "disbursement") {
      grouped[monthKey].disbursements += transaction.amount || 0;
    }
    
    grouped[monthKey].count += 1;
  });
  
  return Object.values(grouped).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
};

const groupCasesByType = (cases: CaseItem[]): CaseTypeGrouped[] => {
  const grouped: Record<string, CaseTypeGrouped> = {};
  
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

const getCaseTypeColor = (type: string | undefined): string => {
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const groupContributionsByCaseType = (transactions: Transaction[], cases: CaseItem[]): ContributionByType[] => {
  const grouped: Record<string, ContributionByType> = {};
  
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
    
    grouped[type].value += Math.abs(transaction.amount || 0);
  });
  
  return Object.values(grouped);
};

const MemberReport = () => {
  const [member, setMember] = useState<Member | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyGrouped[]>([]);
  const [casesByType, setCasesByType] = useState<CaseTypeGrouped[]>([]);
  const [contributionsByType, setContributionsByType] = useState<ContributionByType[]>([]);
  const [stats, setStats] = useState({
    totalContributions: 0,
    totalDisbursements: 0,
    activeCases: 0,
    completedCases: 0,
    averageContribution: 0,
    contributionCount: 0
  });
  
  const [datePreset, setDatePreset] = useState<'3months' | '6months' | '12months' | 'thisYear' | 'all' | 'custom'>('12months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'contribution' | 'disbursement'>('all');
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  
  const reportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const caseContributionTransactions = useMemo(
    () => (transactions || []).filter(
      t => t.description && t.description.toLowerCase().includes('contribution for case')
    ),
    [transactions]
  );

  const monthlyCaseContribData = useMemo(
    () => groupByMonth(caseContributionTransactions),
    [caseContributionTransactions]
  );

  const totalCaseContributions = useMemo(
    () => caseContributionTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0),
    [caseContributionTransactions]
  );

  const caseContributionCount = useMemo(
    () => caseContributionTransactions.length,
    [caseContributionTransactions]
  );

  const walletBalance = useMemo(() => {
    const persisted = Number(member?.wallet_balance);
    if (Number.isFinite(persisted)) return persisted;
    return transactions.reduce((sum, t) => sum + walletRowDelta(t as any), 0);
  }, [member?.wallet_balance, transactions]);

  const netImpact = useMemo(
    () => stats.totalContributions - stats.totalDisbursements,
    [stats.totalContributions, stats.totalDisbursements]
  );

  const memberCases = useMemo(
    () => cases.filter(c => c.affected_member_id === member?.id),
    [cases, member?.id]
  );

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (datePreset) {
      case '3months': return subMonths(now, 3);
      case '6months': return subMonths(now, 6);
      case '12months': return subMonths(now, 12);
      case 'thisYear': return startOfYear(now);
      case 'custom': return customStartDate ? new Date(customStartDate) : subMonths(now, 12);
      case 'all': return new Date(2000, 0, 1);
      default: return subMonths(now, 12);
    }
  }, [datePreset, customStartDate]);

  const uniqueCaseTypes = useMemo(() => {
    return [...new Set(cases.map(c => c.case_type).filter(Boolean))].sort();
  }, [cases]);

  const filteredTransactions = useMemo(() => {
    const startDate = getDateRange();
    const endDate = customEndDate ? new Date(customEndDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    return transactions.filter(t => {
      const txDate = new Date(t.created_at);
      if (txDate < startDate || txDate > endDate) return false;

      if (transactionTypeFilter !== 'all' && t.transaction_type !== transactionTypeFilter) return false;

      if (caseTypeFilter !== 'all') {
        const relatedCase = cases.find(c => c.id === t.case_id);
        if (relatedCase?.case_type !== caseTypeFilter) return false;
      }

      if (searchQuery && !t.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      return true;
    });
  }, [transactions, getDateRange, customEndDate, transactionTypeFilter, caseTypeFilter, searchQuery, cases]);

  const filteredCases = useMemo(() => {
    if (caseTypeFilter === 'all') return memberCases;
    return memberCases.filter(c => c.case_type === caseTypeFilter);
  }, [memberCases, caseTypeFilter]);

  const filteredMonthlyData = useMemo(() => {
    return groupByMonth(filteredTransactions);
  }, [filteredTransactions]);

  const filteredCaseContribTransactions = useMemo(() => {
    return filteredTransactions.filter(
      t => t.description && t.description.toLowerCase().includes('contribution for case')
    );
  }, [filteredTransactions]);

  const filteredMonthlyCaseContribData = useMemo(() => {
    return groupByMonth(filteredCaseContribTransactions);
  }, [filteredCaseContribTransactions]);

  const filteredContributionsByType = useMemo(() => {
    return groupContributionsByCaseType(filteredTransactions, cases);
  }, [filteredTransactions, cases]);

  const filteredTotalContributions = useMemo(() => {
    return filteredCaseContribTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
  }, [filteredCaseContribTransactions]);

  const filteredCaseContributionCount = useMemo(() => {
    return filteredCaseContribTransactions.length;
  }, [filteredCaseContribTransactions]);

  const filteredTotalDisbursements = useMemo(() => {
    return filteredTransactions
      .filter(t => t.transaction_type === "disbursement")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [filteredTransactions]);

  const filteredNetImpact = useMemo(() => {
    return filteredTotalContributions - filteredTotalDisbursements;
  }, [filteredTotalContributions, filteredTotalDisbursements]);

  const clearFilters = () => {
    setDatePreset('12months');
    setCustomStartDate('');
    setCustomEndDate('');
    setTransactionTypeFilter('all');
    setCaseTypeFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = datePreset !== '12months' || transactionTypeFilter !== 'all' || caseTypeFilter !== 'all' || searchQuery !== '';

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: memberData, error: memberError } = await supabase
          .from("members")
          .select(MEMBER_DETAIL_COLUMNS)
          .eq("id", member_id)
          .single();

        if (memberError) throw memberError;

        if (!memberData) {
          localStorage.removeItem("member_member_id");
          navigate("/member/login");
          return;
        }
        
        const oneYearAgo = subMonths(new Date(), 12);
        const { data: transactionsData, error: transactionsError } = await supabase
          .from("transactions")
          .select(TRANSACTION_LIST_COLUMNS)
          .eq("member_id", member_id)
          .gte("created_at", oneYearAgo.toISOString())
          .order("created_at", { ascending: true });

        if (transactionsError) throw transactionsError;
        
        const { data: casesData, error: casesError } = await supabase
          .from("cases")
          .select(CASE_ROW_COLUMNS)
          .eq("affected_member_id", member_id);

        if (casesError) throw casesError;
        
        setMember(memberData as Member);
        setTransactions((transactionsData || []) as Transaction[]);
        setCases((casesData || []) as CaseItem[]);
        
        const filteredContribs = ((transactionsData || []) as Transaction[]).filter(
          t => t.description && t.description.toLowerCase().includes('contribution for case')
        );
        setMonthlyData(groupByMonth(filteredContribs));
        
        const caseTypeData = groupCasesByType(
          ((casesData || []) as CaseItem[]).filter(c => c.affected_member_id === member_id)
        );
        setCasesByType(caseTypeData);
        
        const contribByType = groupContributionsByCaseType(
          (transactionsData || []) as Transaction[],
          (casesData || []) as CaseItem[]
        );
        setContributionsByType(contribByType);
        
        const totalContrib = filteredContribs.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        const contribCount = filteredContribs.length;
        const totalDisb = ((transactionsData || []) as Transaction[])
          .filter(t => t.transaction_type === "disbursement")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        
        const activeCases = ((casesData || []) as CaseItem[])
          .filter(c => c.is_active && !c.is_finalized && c.affected_member_id === member_id)
          .length;
        
        const completedCases = ((casesData || []) as CaseItem[])
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
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load report data");
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate]);

  const formatCurrency = (amount: number) => {
    return `KES ${amount?.toLocaleString() || "0"}`;
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    toast({ title: "Preparing report", description: "Please wait while we generate your PDF..." });
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const html2canvas = await loadHtml2canvas();
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL('image/png');
      const JsPDF = await loadJsPdf();
      const pdf = new JsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableHeight = pdfHeight - margin * 2;
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;
      
      let position = 0;
      let remaining = scaledHeight;
      
      while (remaining > 0) {
        if (position > 0) pdf.addPage();
        const pageHeight = Math.min(usableHeight, remaining);
        pdf.addImage(imgData, 'PNG', margin, margin, pdfWidth, scaledHeight, undefined, 'FAST', position / ratio);
        position += pageHeight;
        remaining -= pageHeight;
      }
      
      const fileName = `Financial_Report_${member?.name?.replace(/\s+/g, '_') || 'Member'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);
      
      toast({ title: "Report downloaded", description: "Your financial report has been downloaded successfully!", variant: "default" });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({ title: "Export failed", description: "There was an error generating your report. Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ["Date", "Type", "Description", "Amount (KES)"];
      const rows = filteredTransactions
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(t => [
          format(new Date(t.created_at), "yyyy-MM-dd"),
          t.transaction_type,
          `"${(t.description || "N/A").replace(/"/g, '""')}"`,
          t.amount
        ]);

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Transactions_${member?.name?.replace(/\s+/g, '_') || 'Member'}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: "CSV downloaded", description: "Your transaction data has been exported successfully!" });
    } catch (error) {
      console.error("CSV export error:", error);
      toast({ title: "Export failed", description: "There was an error exporting your data.", variant: "destructive" });
    }
  };

  if (!member && !loading && !error) {
    return null;
  }

  if (error) {
    return (
      <DashboardLayout customLinks={memberLinks} customLogout={() => memberLogout(navigate)}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load report</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout customLinks={memberLinks} customLogout={() => memberLogout(navigate)}>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-24 mt-2" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
            <Card><CardHeader><Skeleton className="h-6 w-36" /></CardHeader><CardContent><Skeleton className="h-10 w-40" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-6 w-40" /></CardHeader><CardContent><Skeleton className="h-10 w-40" /></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-28" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-28" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card><CardHeader><Skeleton className="h-5 w-48" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-5 w-48" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
          </div>
          <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div ref={reportRef} className="space-y-8">
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
          <Card className="bg-card/80 border border-green-100">
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
          <Card className="bg-card/80 border border-blue-100">
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
              <CardTitle>Total Contributions {hasActiveFilters && <span className="text-xs text-muted-foreground">(filtered)</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">KES {filteredTotalContributions.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{filteredCaseContributionCount} payments (case contributions)</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Disbursements {hasActiveFilters && <span className="text-xs text-muted-foreground">(filtered)</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">KES {filteredTotalDisbursements.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Received in selected period</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Transactions {hasActiveFilters && <span className="text-xs text-muted-foreground">(filtered)</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredTransactions.length}</div>
              <div className="text-sm text-muted-foreground">In selected period</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                {showFilters ? 'Hide' : 'Show'} Filters
              </Button>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={datePreset} onValueChange={(v) => setDatePreset(v as '3months' | '6months' | '12months' | 'thisYear' | 'all' | 'custom')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3months">Last 3 Months</SelectItem>
                      <SelectItem value="6months">Last 6 Months</SelectItem>
                      <SelectItem value="12months">Last 12 Months</SelectItem>
                      <SelectItem value="thisYear">This Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {datePreset === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Date</label>
                      <Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Date</label>
                      <Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Transaction Type</label>
                  <Select value={transactionTypeFilter} onValueChange={(v) => setTransactionTypeFilter(v as 'all' | 'contribution' | 'disbursement')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Transactions</SelectItem>
                      <SelectItem value="contribution">Contributions Only</SelectItem>
                      <SelectItem value="disbursement">Disbursements Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Case Type</label>
                  <Select value={caseTypeFilter} onValueChange={setCaseTypeFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cases</SelectItem>
                      {uniqueCaseTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Search Description</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search transactions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                </div>

                <div className="flex items-end md:col-span-2">
                  <Button variant="outline" onClick={clearFilters} className="w-full">
                    <X className="mr-2 h-4 w-4" /> Clear All Filters
                  </Button>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
                  {datePreset !== '12months' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Date: {datePreset === '3months' ? 'Last 3 Months' : datePreset === '6months' ? 'Last 6 Months' : datePreset === 'thisYear' ? 'This Year' : datePreset === 'all' ? 'All Time' : 'Custom'}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setDatePreset('12months')} />
                    </Badge>
                  )}
                  {transactionTypeFilter !== 'all' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Type: {transactionTypeFilter === 'contribution' ? 'Contributions' : 'Disbursements'}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setTransactionTypeFilter('all')} />
                    </Badge>
                  )}
                  {caseTypeFilter !== 'all' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Case: {caseTypeFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setCaseTypeFilter('all')} />
                    </Badge>
                  )}
                  {searchQuery && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Search: "{searchQuery}"
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchQuery('')} />
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Contribution & Disbursement</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredMonthlyCaseContribData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [`KES ${Number(value).toLocaleString()}`, undefined]} labelFormatter={(label) => `Month: ${label}`} />
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
                  <Pie data={filteredContributionsByType} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label={({ name, percent }) => `${name}: ${(Number(percent) * 100).toFixed(0)}%`}>
                    {filteredContributionsByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`KES ${Number(value).toLocaleString()}`, undefined]} />
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
              <BarChart data={filteredMonthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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

        {/* Export Buttons */}
        <div className="flex gap-3 justify-end">
          <Button onClick={handleExportCSV} variant="outline" disabled={exporting || filteredTransactions.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={handleExportPDF} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export PDF
          </Button>
        </div>

        {/* Recent Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>
              {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''} found
              {hasActiveFilters && ' (filtered)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No transactions match your filters</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/4">Date</TableHead>
                        <TableHead className="w-1/4">Type</TableHead>
                        <TableHead className="w-1/4">Description</TableHead>
                        <TableHead className="w-1/4 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(showAllTransactions ? filteredTransactions : filteredTransactions.slice(0, 5))
                        .slice()
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{format(new Date(transaction.created_at), "MMM d, yyyy")}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={transaction.transaction_type === "contribution" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                                {transaction.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="truncate max-w-[200px]">{transaction.description || "N/A"}</TableCell>
                            <TableCell className="text-right font-medium">
                              {(() => {
                                const delta = walletRowDelta(transaction.transaction_type, transaction.amount, (transaction as any).status);
                                const pending = delta === null;
                                const reversed = String((transaction as any).status || "").toLowerCase() === "reversed";
                                const pos = delta !== null && delta > 0;
                                const neg = delta !== null && delta < 0;
                                return (
                                  <span className={pending ? "text-muted-foreground" : pos ? "text-green-600" : neg ? "text-red-600" : "text-muted-foreground"}>
                                    {pending ? (reversed ? "Reversed" : "Pending") : `${pos ? "+" : neg ? "-" : ""}KES ${Math.abs(delta ?? 0).toLocaleString()}`}
                                  </span>
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredTransactions.length > 5 && (
                  <div className="mt-4 text-center">
                    <Button variant="outline" onClick={() => setShowAllTransactions(!showAllTransactions)}>
                      {showAllTransactions ? 'Show Less' : `Show All (${filteredTransactions.length})`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Case Summary */}
        <Card>
          <CardHeader>
            <CardTitle>My Cases</CardTitle>
            <CardDescription>
              {filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''} found
              {caseTypeFilter !== 'all' && ' (filtered by case type)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredCases.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No cases found</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCases.slice(0, 5).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.case_number}</TableCell>
                        <TableCell>{c.case_type}</TableCell>
                        <TableCell>
                          <Badge variant={c.is_active && !c.is_finalized ? 'outline' : 'destructive'}>
                            {c.is_finalized ? 'Completed' : c.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.start_date ? new Date(c.start_date).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>{c.end_date ? new Date(c.end_date).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <span className="font-medium">KES {filteredTotalContributions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Disbursements</span>
                  <span className="font-medium">KES {filteredTotalDisbursements.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Net Financial Impact</span>
                  <span className={filteredNetImpact >= 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'}>KES {filteredNetImpact.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Transactions</span>
                  <span className="font-medium">{filteredTransactions.length}</span>
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
