import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Filter, ChevronDown, Calendar, FileText, Printer } from 'lucide-react';
import { format } from 'date-fns';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Gender, Member, Case, CaseType } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { persistentCache } from '@/lib/cache';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Utility: Export array of objects to CSV and trigger download
function exportToCSV(filename: string, rows: any[], headers: string[]) {
  if (!rows.length) return;
  const csvContent = [
    headers.join(','),
    ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Real PDF export using jsPDF
function exportToPDF(filename: string, rows: any[], headers: string[]) {
  if (!rows.length) return;
  const doc = new jsPDF();
  const data = rows.map(row => headers.map(h => row[h] ?? ''));
  (doc as any).autoTable({
    head: [headers],
    body: data,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [41, 128, 185] },
    margin: { top: 20 },
  });
  doc.save(filename);
}

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('contributions');
  const [locationFilter, setLocationFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<Member[]>(() => persistentCache.get<Member[]>('reports-members') || []);
  const [cases, setCases] = useState<Case[]>(() => persistentCache.get<Case[]>('reports-cases') || []);
  const [transactions, setTransactions] = useState<any[]>(() => persistentCache.get<any[]>('reports-tx') || []);
  const [summary, setSummary] = useState<any>(() => persistentCache.get<any>('reports-summary') || null);

  useEffect(() => {
    const fetchAll = async () => {
      // If we have cached data, don't show the initial loading wall
      if (!persistentCache.has('reports-members')) {
        setLoading(true);
      }
      
      try {
        const pageSize = 1000;
        
        // Parallel fetch for baseline data
        const [summaryRes, membersRes, casesRes, txRes] = await Promise.all([
          (supabase.rpc as any)('get_dashboard_summary'),
          supabase.from('members').select('*'), // This might need pagination if > 1000
          supabase.from('cases').select('*'),
          supabase.from('transactions').select('*').limit(3000).order('created_at', { ascending: false })
        ]);

        if (summaryRes.data) {
          const s = summaryRes.data[0] || summaryRes.data;
          setSummary(s);
          persistentCache.set('reports-summary', s, 10 * 60 * 1000);
        }

        const mappedMembers: Member[] = (membersRes.data || []).map((m: any) => ({
          ...m,
          id: m.id,
          memberNumber: m.member_number,
          name: m.name,
          gender: m.gender as Gender,
          dateOfBirth: m.date_of_birth ? new Date(m.date_of_birth) : new Date(),
          nationalIdNumber: m.national_id_number || '',
          phoneNumber: m.phone_number || '',
          emailAddress: m.email_address || '',
          residence: m.residence || '',
          registrationDate: m.registration_date ? new Date(m.registration_date) : new Date(),
          walletBalance: Number(m.wallet_balance) || 0,
          isActive: m.is_active,
          dependants: []
        }));
        setMembers(mappedMembers);
        persistentCache.set('reports-members', mappedMembers, 10 * 60 * 1000);

        const mappedCases: Case[] = (casesRes.data || []).map((c: any) => ({
          ...c,
          id: c.id,
          caseNumber: c.case_number,
          affectedMemberId: c.affected_member_id,
          caseType: c.case_type as CaseType,
          contributionPerMember: Number(c.contribution_per_member) || 0,
          startDate: c.start_date ? new Date(c.startDate) : new Date(),
          endDate: c.end_date ? new Date(c.endDate) : new Date(),
          isActive: c.is_active,
          isFinalized: c.is_finalized,
          createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        }));
        setCases(mappedCases);
        persistentCache.set('reports-cases', mappedCases, 10 * 60 * 1000);

        const txs = txRes.data || [];
        setTransactions(txs);
        persistentCache.set('reports-tx', txs, 10 * 60 * 1000);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAll();
  }, []);

  // Derived filtered data
  const filteredMembers = useMemo(() => {
    return members.filter(m => locationFilter === 'all' || (m.residence || '').toLowerCase() === locationFilter.toLowerCase());
  }, [members, locationFilter]);

  const defaulters = useMemo(() => {
    return members.filter(m => m.walletBalance < 0 && (locationFilter === 'all' || (m.residence || '').toLowerCase() === locationFilter.toLowerCase()));
  }, [members, locationFilter]);

  const uniqueLocations = useMemo(() => {
    return [...new Set(members.map(m => m.residence).filter(Boolean))].sort();
  }, [members]);

  // Summary logic
  const stats = {
    totalMembers: summary?.total_members || members.length,
    activeCases: summary?.active_cases || cases.filter(c => c.isActive).length,
    totalContributions: Number(summary?.total_contributions) || 0,
    totalRegistrationFees: Number(summary?.total_registration_fees) || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 p-1 md:p-6 min-h-screen bg-gradient-to-br from-white to-blue-50/30">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Card className="shadow-sm border-l-4 border-blue-500 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-blue-600">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">{loading ? '...' : stats.totalMembers}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-purple-500 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-purple-600">Active Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">{loading ? '...' : stats.activeCases}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-green-500 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-green-600">Contributions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">KES {loading ? '...' : stats.totalContributions.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-amber-500 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-amber-600">Registration Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">KES {loading ? '...' : stats.totalRegistrationFees.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black mb-1 text-primary tracking-tight">Reports</h1>
            <p className="text-lg text-muted-foreground font-medium">Analytics and exported data</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="shadow-sm border-2 font-semibold" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[200px] border-2 font-medium bg-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="contributions" className="space-y-8" onValueChange={setActiveTab}>
          <TabsList className="bg-white p-1 border shadow-sm rounded-xl">
            <TabsTrigger value="contributions" className="px-6 py-2 font-bold text-base data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all rounded-lg">Contributions</TabsTrigger>
            <TabsTrigger value="defaulters" className="px-6 py-2 font-bold text-base data-[state=active]:bg-red-600 data-[state=active]:text-white transition-all rounded-lg">Defaulters</TabsTrigger>
            <TabsTrigger value="finance" className="px-6 py-2 font-bold text-base data-[state=active]:bg-emerald-600 data-[state=active]:text-white transition-all rounded-lg">Financial Report</TabsTrigger>
            <TabsTrigger value="members" className="px-6 py-2 font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-white transition-all rounded-lg">Member List</TabsTrigger>
          </TabsList>

          <TabsContent value="finance" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-emerald-50 border-emerald-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-emerald-800 uppercase">Registration Pool</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-emerald-900">KES {summary?.registration_pool_balance?.toLocaleString() || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-blue-800 uppercase">Renewal Pool</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-blue-900">KES {summary?.renewal_pool_balance?.toLocaleString() || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-indigo-50 border-indigo-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-indigo-800 uppercase">Case Pool</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-indigo-900">KES {summary?.case_pool_balance?.toLocaleString() || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-amber-800 uppercase">Suspense Account</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-amber-900">KES {summary?.suspense_account_balance?.toLocaleString() || 0}</div>
                </CardContent>
              </Card>
            </div>
            
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle>Fiscal Compliance Overview</CardTitle>
                <CardDescription>Breakdown of organizational funds across all system accounts.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Visual breakdown could go here */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-medium text-gray-700">Total System Liquidity</span>
                    <span className="font-black text-xl">KES {(
                      (Number(summary?.registration_pool_balance) || 0) +
                      (Number(summary?.renewal_pool_balance) || 0) +
                      (Number(summary?.case_pool_balance) || 0) +
                      (Number(summary?.suspense_account_balance) || 0)
                    ).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    * This summary represents the total reconciled funds across all internal welfare accounts and M-Pesa suspense holding.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contributions" className="space-y-6">
            <Card className="shadow-xl border-t-4 border-blue-600">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
                <div>
                  <CardTitle className="text-2xl font-bold">Contribution History</CardTitle>
                  <CardDescription className="text-base font-medium">Historical member contributions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" className="border-2 font-bold" onClick={() => exportToCSV('contributions.csv', transactions.filter(t => t.transaction_type === 'contribution'), ['id', 'amount', 'mpesa_reference', 'description', 'created_at'])}>
                    <Download className="h-5 w-5 mr-2" /> Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 font-bold border-b-2">
                      <TableHead className="font-bold text-black text-lg">Transaction ID</TableHead>
                      <TableHead className="font-bold text-black text-lg">Amount (KES)</TableHead>
                      <TableHead className="font-bold text-black text-lg">M-Pesa Ref</TableHead>
                      <TableHead className="font-bold text-black text-lg">Description</TableHead>
                      <TableHead className="font-bold text-black text-lg">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={5} className="py-6"><div className="h-6 w-full bg-muted animate-pulse rounded" /></TableCell></TableRow>
                      ))
                    ) : (
                      transactions.filter(t => t.transaction_type === 'contribution').slice(0, 50).map(tx => (
                        <TableRow key={tx.id} className="hover:bg-blue-50/50 transition-colors">
                          <TableCell className="font-medium text-blue-600">{tx.id.substring(0, 8)}</TableCell>
                          <TableCell className="font-bold">{Math.abs(tx.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground font-mono">{tx.mpesa_reference || '-'}</TableCell>
                          <TableCell className="max-w-xs truncate font-medium">{tx.description}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(tx.created_at), 'MMM dd, yyyy')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="defaulters" className="space-y-6">
            <Card className="shadow-xl border-t-4 border-red-600">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
                <div>
                  <CardTitle className="text-2xl font-bold flex items-center text-red-700">
                    Defaulters List
                    <span className="ml-3 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-black">{defaulters.length} Total</span>
                  </CardTitle>
                  <CardDescription className="text-base font-medium">Members with negative wallet balances</CardDescription>
                </div>
                <Button variant="destructive" size="lg" className="font-black shadow-lg" onClick={() => exportToPDF('defaulters.pdf', defaulters, ['memberNumber', 'name', 'walletBalance', 'phoneNumber', 'residence'])}>
                  <Download className="h-5 w-5 mr-2" /> Download PDF
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50 hover:bg-red-50 border-b-2">
                      <TableHead className="font-bold text-red-900 text-lg">Member #</TableHead>
                      <TableHead className="font-bold text-red-900 text-lg">Name</TableHead>
                      <TableHead className="font-bold text-red-900 text-lg">Balance (KES)</TableHead>
                      <TableHead className="font-bold text-red-900 text-lg">Phone</TableHead>
                      <TableHead className="font-bold text-red-900 text-lg">Residence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defaulters.map(m => (
                      <TableRow key={m.id} className="hover:bg-red-50/30 transition-colors cursor-pointer" onClick={() => navigate(`/members/${m.id}`)}>
                        <TableCell className="font-black text-red-600">{m.memberNumber}</TableCell>
                        <TableCell className="font-bold text-gray-900">{m.name}</TableCell>
                        <TableCell className="text-red-600 font-extrabold text-lg">{m.walletBalance.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground font-medium">{m.phoneNumber}</TableCell>
                        <TableCell className="font-medium text-gray-700">{m.residence}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <Card className="shadow-xl border-t-4 border-black">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-6">
                <CardTitle className="text-2xl font-bold">General Member List</CardTitle>
                <Button variant="outline" className="border-2 font-bold" onClick={() => exportToCSV('all-members.csv', filteredMembers, ['memberNumber', 'name', 'walletBalance', 'registrationDate', 'residence'])}>
                  <Download className="h-5 w-5 mr-2" /> Export CSV
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 bg-gray-50 hover:bg-gray-50">
                      <TableHead className="font-bold text-black text-lg">Member #</TableHead>
                      <TableHead className="font-bold text-black text-lg">Name</TableHead>
                      <TableHead className="font-bold text-black text-lg">Balance</TableHead>
                      <TableHead className="font-bold text-black text-lg">Status</TableHead>
                      <TableHead className="font-bold text-black text-lg">Residence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.slice(0, 100).map(m => (
                      <TableRow key={m.id} className="hover:bg-blue-50/50 transition-colors">
                        <TableCell className="font-bold">{m.memberNumber}</TableCell>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className={m.walletBalance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                          {m.walletBalance.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-black uppercase ${m.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {m.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell>{m.residence}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
