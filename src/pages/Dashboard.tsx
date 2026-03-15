import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CreditCard, CalendarDays, Calendar,
  TrendingUp, BarChart3, UserPlus, Home, Wallet, UserCog, Settings
} from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import StatsCard from '@/components/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MemberCard from '@/components/MemberCard';
import CaseCard from '@/components/CaseCard';
import TransactionList from '@/components/TransactionList';
import { Skeleton } from '@/components/ui/skeleton';
import { Gender, CaseType, Member, Case, Transaction } from '@/lib/types';
import { supabase } from "@/integrations/supabase/client";
import { persistentCache } from '@/lib/cache';

interface DashboardData {
  totalMembers: number;
  activeCasesCount: number;
  totalContributions: number;
  defaultersCount: number;
  recentMembers: Member[];
  recentActiveCases: Case[];
  recentTransactions: Transaction[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>(() => {
    // ⚡ Instant load: Start with cached data if it exists
    const cached = persistentCache.get<DashboardData>('dashboard');
    if (cached) {
      // Small trick: schedule setLoading(false) right after initial render
      // if we have cached data, to skip the skeleton state.
      setTimeout(() => setLoading(false), 0);
      return cached;
    }
    return {
      totalMembers: 0,
      activeCasesCount: 0,
      totalContributions: 0,
      defaultersCount: 0,
      recentMembers: [],
      recentActiveCases: [],
      recentTransactions: [],
    };
  });

  const fetchDashboardData = useCallback(async () => {
    // Only show loading skeletons if we don't have cached data yet
    if (!persistentCache.has('dashboard')) {
      setLoading(true);
    }
    
    try {
      // Fire all queries in parallel — single round trip instead of 5
      const [
        summaryResult,
        membersResult,
        casesResult,
        transactionsResult,
      ] = await Promise.all([
        // 1. Aggregate stats via RPC (single DB function)
        (supabase.rpc as any)('get_dashboard_summary'),
        // 2. Recent members (5 rows, minimal columns)
        supabase
          .from('members')
          .select('id, member_number, name, gender, date_of_birth, national_id_number, phone_number, email_address, residence, next_of_kin, registration_date, is_active, wallet_balance')
          .order('created_at', { ascending: false })
          .limit(5),
        // 3. Active cases (2 rows)
        supabase
          .from('cases')
          .select('id, case_number, case_type, affected_member_id, dependant_id, contribution_per_member, start_date, end_date, is_active, is_finalized, created_at')
          .eq('is_active', true)
          .order('start_date', { ascending: false })
          .limit(2),
        // 4. Recent transactions (5 rows)
        supabase
          .from('transactions')
          .select('id, member_id, case_id, amount, transaction_type, mpesa_reference, description, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      // --- Summary Stats ---
      let totalMembers = 0, activeCasesCount = 0, totalContributions = 0, defaultersCount = 0;
      if (!summaryResult.error && summaryResult.data?.length > 0) {
        const s = summaryResult.data[0];
        totalMembers = s.total_members || 0;
        activeCasesCount = s.active_cases || 0;
        totalContributions = Number(s.total_contributions) || 0;
        defaultersCount = s.defaulters_count || 0;
      } else {
        // Fallback: simple count queries in parallel
        const [mc, cc] = await Promise.all([
          supabase.from('members').select('*', { count: 'exact', head: true }),
          supabase.from('cases').select('*', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        totalMembers = mc.count || 0;
        activeCasesCount = cc.count || 0;
      }

      // --- Recent Members ---
      const membersData = membersResult.data || [];
      const recentMembers: Member[] = membersData.map((m: any) => ({
        id: m.id,
        memberNumber: m.member_number,
        name: m.name,
        gender: m.gender as Gender,
        dateOfBirth: m.date_of_birth ? new Date(m.date_of_birth) : new Date(),
        nationalIdNumber: m.national_id_number || '',
        phoneNumber: m.phone_number || '',
        emailAddress: m.email_address || '',
        residence: m.residence || '',
        nextOfKin: m.next_of_kin,
        dependants: [],
        registrationDate: m.registration_date ? new Date(m.registration_date) : new Date(),
        // Use the stored wallet_balance column directly — no need to re-derive from transactions
        walletBalance: Number(m.wallet_balance) || 0,
        isActive: m.is_active,
      }));

      // --- Active Cases ---
      const casesData = casesResult.data || [];
      // Build a quick lookup for affected member names from the members we already fetched
      const memberLookup: Record<string, Member> = {};
      recentMembers.forEach(m => { memberLookup[m.id] = m; });

      const recentActiveCases: Case[] = casesData.map((c: any) => ({
        id: c.id,
        caseNumber: c.case_number,
        affectedMemberId: c.affected_member_id,
        affectedMember: memberLookup[c.affected_member_id],
        caseType: typeof c.case_type === 'string' ? c.case_type.toLowerCase() : c.case_type,
        dependantId: c.dependant_id,
        contributionPerMember: c.contribution_per_member,
        startDate: c.start_date ? new Date(c.start_date) : new Date(),
        endDate: c.end_date ? new Date(c.end_date) : new Date(),
        expectedAmount: c.contribution_per_member * (totalMembers || 1),
        actualAmount: 0, // populated from transactions if needed
        isActive: c.is_active,
        isFinalized: c.is_finalized,
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
      }));

      // --- Transactions ---
      const txData = transactionsResult.data || [];
      // Build member name map from recentMembers only (sufficient for dashboard preview)
      const memberNameMap: Record<string, string> = {};
      recentMembers.forEach(m => { memberNameMap[m.id] = m.name; });

      const recentTransactions: Transaction[] = txData.map((t: any) => ({
        id: t.id,
        memberId: t.member_id,
        caseId: t.case_id,
        amount: t.amount,
        transactionType: t.transaction_type as Transaction['transactionType'],
        mpesaReference: t.mpesa_reference,
        createdAt: t.created_at ? new Date(t.created_at) : new Date(),
        description: t.description,
        senderName: memberNameMap[t.member_id || ''] || 'Unknown',
      }));

      const newData = { totalMembers, activeCasesCount, totalContributions, defaultersCount, recentMembers, recentActiveCases, recentTransactions };
      
      // Update state and save to fast persistence cache (5 min TTL)
      setData(newData);
      persistentCache.set('dashboard', newData, 5 * 60 * 1000);
      
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const adminLinks = [
    { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/dashboard" },
    { icon: <Users className="w-5 h-5" />, label: "Members", href: "/members" },
    { icon: <Calendar className="w-5 h-5" />, label: "Cases", href: "/cases" },
    { icon: <CreditCard className="w-5 h-5" />, label: "Transactions", href: "/transactions" },
    { icon: <Wallet className="w-5 h-5" />, label: "Accounts", href: "/accounts" },
    { icon: <BarChart3 className="w-5 h-5" />, label: "Reports", href: "/reports" },
    { icon: <UserCog className="w-5 h-5" />, label: "Users", href: "/users" },
    { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/settings" },
  ];

  const StatSkeleton = () => (
    <div className="border rounded-xl p-4 space-y-3 shadow-md">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );

  return (
    <DashboardLayout customLinks={adminLinks}>
      <div className="space-y-10 bg-gradient-to-br from-gray-50 via-white to-blue-50 min-h-screen px-2 md:px-8 py-8">
        <div className="flex items-center justify-between sticky top-0 z-10 bg-gradient-to-r from-white/90 to-blue-50/80 backdrop-blur-md py-4 px-2 md:px-8 rounded-xl shadow-sm mb-6">
          <div>
            <h1 className="text-4xl font-extrabold mb-1 text-primary tracking-tight">Dashboard</h1>
            <p className="text-lg text-muted-foreground font-medium">Welcome to MCWG management portal</p>
          </div>
          <div className="flex space-x-4">
            <Button size="lg" className="font-semibold shadow-md" onClick={() => navigate('/members/new')}>
              <UserPlus className="h-5 w-5 mr-2" />
              New Member
            </Button>
            <Button size="lg" className="font-semibold shadow-md" onClick={() => navigate('/cases/new')}>
              <CalendarDays className="h-5 w-5 mr-2" />
              New Case
            </Button>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
            </>
          ) : (
            <>
              <StatsCard
                title="Total Members"
                value={data.totalMembers}
                icon={<Users className="h-5 w-5" />}
                description="Active and inactive members"
                trend={{ value: 12, isPositive: true }}
                className="shadow-md rounded-xl"
              />
              <StatsCard
                title="Active Cases"
                value={data.activeCasesCount}
                icon={<CalendarDays className="h-5 w-5" />}
                description="Cases in progress"
                className="shadow-md rounded-xl"
              />
              <StatsCard
                title="Total Contributions"
                value={`KES ${data.totalContributions.toLocaleString()}`}
                icon={<CreditCard className="h-5 w-5" />}
                trend={{ value: 8.5, isPositive: true }}
                className="shadow-md rounded-xl"
              />
              <StatsCard
                title="Defaulters"
                value={data.defaultersCount}
                icon={<TrendingUp className="h-5 w-5" />}
                description="Members with negative balance"
                className="shadow-md rounded-xl"
              />
            </>
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-8" onValueChange={setActiveTab}>
          <TabsList className="flex gap-4 bg-white/80 rounded-lg shadow-sm p-2 mb-4">
            <TabsTrigger value="overview" className="text-lg font-semibold">Overview</TabsTrigger>
            <TabsTrigger value="transactions" className="text-lg font-semibold">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid gap-8 md:grid-cols-2">
              <Card className="shadow-lg rounded-xl">
                <CardHeader>
                  <CardTitle className="text-xl font-bold">Recent Members</CardTitle>
                  <CardDescription className="text-base">Latest member registrations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {loading
                      ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                      : data.recentMembers.map((member) => (
                          <MemberCard
                            key={member.id}
                            member={member}
                            onClick={() => navigate(`/members/${member.id}`)}
                          />
                        ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/members')}>
                        View All Members
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg rounded-xl">
                <CardHeader>
                  <CardTitle className="text-xl font-bold">Active Cases</CardTitle>
                  <CardDescription className="text-base">Cases currently in progress</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {loading
                      ? [...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
                      : data.recentActiveCases.map((caseItem) => (
                          <CaseCard
                            key={caseItem.id}
                            case={caseItem}
                            onClick={() => navigate(`/cases/${caseItem.id}`)}
                          />
                        ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/cases')}>
                        View All Cases
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-lg rounded-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Recent Transactions</CardTitle>
                <CardDescription className="text-base">Latest financial activities</CardDescription>
              </CardHeader>
              <CardContent>
                {loading
                  ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded mb-2" />)
                  : <TransactionList transactions={data.recentTransactions} />}
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/transactions')}>
                    View All Transactions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-8">
            <Card className="shadow-lg rounded-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Transactions</CardTitle>
                <CardDescription className="text-base">All financial transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionList transactions={data.recentTransactions} />
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/transactions')}>
                    View All Transactions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
