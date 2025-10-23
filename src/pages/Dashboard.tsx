import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CreditCard, CalendarDays, Calendar, TrendingUp, BarChart3, AlertCircle, UserPlus, LogOut, Home, Wallet, UserCog, Settings } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import StatsCard from '@/components/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MemberCard from '@/components/MemberCard';
import CaseCard from '@/components/CaseCard';
import TransactionList from '@/components/TransactionList';
import { Gender, CaseType, Member, Case, Transaction } from '@/lib/types';
import { supabase } from "@/integrations/supabase/client";

// Mock data for demonstration
const mockMembers: Member[] = [
  {
    id: '1',
    memberNumber: 'M001',
    name: 'John Mwangi',
    gender: Gender.MALE,
    dateOfBirth: new Date('1985-04-12'),
    nationalIdNumber: '12345678',
    phoneNumber: '+254712345678',
    emailAddress: 'john.m@example.com',
    residence: 'Nakuru',
    nextOfKin: {
      name: 'Jane Mwangi',
      relationship: 'Spouse',
      phoneNumber: '+254712345679',
    },
    dependants: [
      {
        id: 'd1',
        name: 'James Mwangi',
        gender: Gender.MALE,
        relationship: 'Son',
        dateOfBirth: new Date('2010-01-15'),
        isDisabled: false,
        isEligible: true,
      },
    ],
    registrationDate: new Date('2022-01-15'),
    walletBalance: 2500,
    isActive: true,
  },
  {
    id: '2',
    memberNumber: 'M002',
    name: 'Sarah Kamau',
    gender: Gender.FEMALE,
    dateOfBirth: new Date('1990-07-22'),
    nationalIdNumber: '87654321',
    phoneNumber: '+254723456789',
    emailAddress: 'sarah.k@example.com',
    residence: 'Kisumu',
    nextOfKin: {
      name: 'Michael Kamau',
      relationship: 'Spouse',
      phoneNumber: '+254723456780',
    },
    dependants: [],
    registrationDate: new Date('2022-02-18'),
    walletBalance: -500,
    isActive: false,
  },
];

const mockCases: Case[] = [
  {
    id: '1',
    caseNumber: 'C001',
    affectedMemberId: '1',
    affectedMember: mockMembers[0],
    caseType: CaseType.EDUCATION,
    dependantId: 'd1',
    contributionPerMember: 1000,
    startDate: new Date('2023-09-01'),
    endDate: new Date('2023-09-30'),
    expectedAmount: 10000,
    actualAmount: 8000,
    isActive: true,
    isFinalized: false,
    createdAt: new Date('2023-08-25'),
  },
  {
    id: '2',
    caseNumber: 'C002',
    affectedMemberId: '2',
    affectedMember: mockMembers[1],
    caseType: CaseType.SICKNESS,
    contributionPerMember: 1500,
    startDate: new Date('2023-08-15'),
    endDate: new Date('2023-09-15'),
    expectedAmount: 15000,
    actualAmount: 15000,
    isActive: false,
    isFinalized: true,
    createdAt: new Date('2023-08-10'),
  },
];

const mockTransactions: Transaction[] = [
  {
    id: '1',
    memberId: '1',
    caseId: '1',
    amount: 1000,
    transactionType: 'contribution',
    mpesaReference: 'QXZ123456',
    createdAt: new Date('2023-09-05'),
    description: 'Contribution to case #C001',
  },
  {
    id: '2',
    memberId: '2',
    amount: 500,
    transactionType: 'registration',
    createdAt: new Date('2022-02-18'),
    description: 'Registration fee',
  },
  {
    id: '3',
    memberId: '1',
    amount: 2000,
    transactionType: 'wallet_funding',
    mpesaReference: 'ABC789012',
    createdAt: new Date('2023-08-20'),
    description: 'Wallet funding',
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalContributions, setTotalContributions] = useState<number>(0);
  const [recentMembers, setRecentMembers] = useState<Member[]>([]);
  const [recentActiveCases, setRecentActiveCases] = useState<Case[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [activeCasesCount, setActiveCasesCount] = useState<number>(0);

  useEffect(() => {
    const fetchTransactions = async () => {
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*');
      setTransactions(transactionsData || []);
      // Calculate total contributions
      const total = (transactionsData || [])
        .filter(t => t.description && t.description.startsWith('Contribution for case'))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      setTotalContributions(total);
    };
    fetchTransactions();
  }, []);

  useEffect(() => {
    const fetchRecentMembers = async () => {
      // Debug: Get total member count for comparison
      const { count: totalMembersCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });
      console.log('Dashboard - Total members in database:', totalMembersCount);
      
      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .order('registration_date', { ascending: false })
        .limit(3);
      console.log('Fetched recent members:', membersData);
      console.log('Dashboard - Total recent members:', membersData?.length);
      console.log('Dashboard - Recent member names:', membersData?.map(m => m.name));
      
      // Debug: Check for specific member "Ziro" in Dashboard
      const ziroInDashboard = membersData?.find(m => m.name?.toLowerCase().includes('ziro'));
      console.log('Dashboard - Ziro member found:', ziroInDashboard);
      
      // Map to expected MemberCard props, ensure valid Date objects
      const mapped = (membersData || []).map(m => ({
        id: m.id,
        memberNumber: m.member_number,
        name: m.name,
        gender: m.gender,
        dateOfBirth: m.date_of_birth ? new Date(m.date_of_birth) : new Date(),
        nationalIdNumber: m.national_id_number,
        phoneNumber: m.phone_number,
        emailAddress: m.email_address,
        residence: m.residence,
        nextOfKin: m.next_of_kin,
        dependants: Array.isArray(m.dependants) ? m.dependants : [],
        registrationDate: m.registration_date ? new Date(m.registration_date) : new Date(),
        walletBalance: m.wallet_balance || 0,
        isActive: m.is_active,
      }));
      setRecentMembers(mapped);
    };
    fetchRecentMembers();
  }, []);

  useEffect(() => {
    const fetchActiveCases = async () => {
      // Fetch active cases
      const { data: casesData } = await supabase
        .from('cases')
        .select('*')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(2);
      // Fetch all members (or you could optimize to just those needed)
      const { data: membersData } = await supabase
        .from('members')
        .select('*');
      const memberCount = (membersData || []).length;
      // Fetch all transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('amount, description');
      // Create a lookup map for members
      const membersById = {};
      (membersData || []).forEach(m => {
        membersById[m.id] = {
          id: m.id,
          memberNumber: m.member_number,
          name: m.name,
          gender: m.gender,
          dateOfBirth: m.date_of_birth ? new Date(m.date_of_birth) : new Date(),
          nationalIdNumber: m.national_id_number,
          phoneNumber: m.phone_number,
          emailAddress: m.email_address,
          residence: m.residence,
          nextOfKin: m.next_of_kin,
          dependants: Array.isArray(m.dependants) ? m.dependants : [],
          registrationDate: m.registration_date ? new Date(m.registration_date) : new Date(),
          walletBalance: m.wallet_balance || 0,
          isActive: m.is_active,
        };
      });
      // Map cases to expected CaseCard props
      const mapped = (casesData || []).map(c => {
        // Calculate collected amount for this case
        let collected = 0;
        if (transactionsData && c.case_number) {
          collected = transactionsData
            .filter(tx => tx.description && tx.description.toLowerCase().includes(c.case_number.toLowerCase()))
            .reduce((sum, tx) => sum + Number(tx.amount), 0);
        }
        return {
        id: c.id,
        caseNumber: c.case_number,
        affectedMemberId: c.affected_member_id,
        affectedMember: membersById[c.affected_member_id],
        caseType: typeof c.case_type === 'string' ? c.case_type.toLowerCase() : c.case_type,
        dependantId: c.dependant_id,
        contributionPerMember: c.contribution_per_member,
        startDate: c.start_date ? new Date(c.start_date) : new Date(),
        endDate: c.end_date ? new Date(c.end_date) : new Date(),
          expectedAmount: c.contribution_per_member * memberCount,
          actualAmount: collected,
        isActive: c.is_active,
        isFinalized: c.is_finalized,
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        };
      });
      setRecentActiveCases(mapped);
    };
    fetchActiveCases();
  }, []);

  useEffect(() => {
    const fetchRecentTransactions = async () => {
      // Fetch recent transactions
      const { data: transactionsData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (txError) {
        console.error('Error fetching transactions:', txError);
        setRecentTransactions([]);
        return;
      }
      // Fetch all members (for sender name lookup)
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, name');
      if (membersError) {
        console.error('Error fetching members:', membersError);
      }
      const membersById = {};
      (membersData || []).forEach(m => {
        membersById[m.id] = m.name;
      });
      // Map to expected TransactionList props, ensure valid Date objects
      const mapped = (transactionsData || []).map(t => ({
        id: t.id,
        memberId: t.member_id,
        caseId: t.case_id,
        amount: t.amount,
        transactionType: t.transaction_type,
        mpesaReference: t.mpesa_reference,
        createdAt: t.created_at ? new Date(t.created_at) : new Date(),
        description: t.description,
        senderName: membersById[t.member_id] || 'Unknown',
      }));
      setRecentTransactions(mapped);
    };
    fetchRecentTransactions();
  }, []);

  useEffect(() => {
    const fetchCounts = async () => {
      // Fetch total members count
      const { count: membersCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });
      setTotalMembers(membersCount || 0);
      // Fetch active cases count
      const { count: casesCount } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      setActiveCasesCount(casesCount || 0);
    };
    fetchCounts();
  }, []);

  // Define admin navigation links
  const adminLinks = [
    { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/dashboard" },
    { icon: <Users className="w-5 h-5" />, label: "Members", href: "/members" },
    { icon: <Calendar className="w-5 h-5" />, label: "Cases", href: "/cases" },
    { icon: <CreditCard className="w-5 h-5" />, label: "Transactions", href: "/transactions" },
    { icon: <Wallet className="w-5 h-5" />, label: "Accounts", href: "/accounts" },
    { icon: <BarChart3 className="w-5 h-5" />, label: "Reports", href: "/reports" },
    { icon: <UserCog className="w-5 h-5" />, label: "Users", href: "/users" },
    { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/settings" }
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
    localStorage.removeItem('token');
    navigate("/login");
  };

  return (
    <DashboardLayout customLinks={adminLinks} customLogout={handleLogout}>
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
          <StatsCard
            title="Total Members"
            value={totalMembers}
            icon={<Users className="h-5 w-5" />}
            description="Active and inactive members"
            trend={{ value: 12, isPositive: true }}
            className="shadow-md rounded-xl"
          />
          <StatsCard
            title="Active Cases"
            value={activeCasesCount}
            icon={<CalendarDays className="h-5 w-5" />}
            description="Cases in progress"
            className="shadow-md rounded-xl"
          />
          <StatsCard
            title="Total Contributions"
            value={`KES ${totalContributions.toLocaleString()}`}
            icon={<CreditCard className="h-5 w-5" />}
            trend={{ value: 8.5, isPositive: true }}
            className="shadow-md rounded-xl"
          />
          <StatsCard
            title="Defaulting Members"
            value="18"
            icon={<AlertCircle className="h-5 w-5" />}
            description="Members with negative balance"
            trend={{ value: 5, isPositive: false }}
            className="shadow-md rounded-xl"
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-8" onValueChange={setActiveTab}>
          <TabsList className="flex gap-4 bg-white/80 rounded-lg shadow-sm p-2 mb-4">
            <TabsTrigger value="overview" className="text-lg font-semibold">Overview</TabsTrigger>
            <TabsTrigger value="members" className="text-lg font-semibold">Members</TabsTrigger>
            <TabsTrigger value="cases" className="text-lg font-semibold">Cases</TabsTrigger>
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
                    {recentMembers.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onClick={() => navigate(`/members/${member.id}`)}
                      />
                    ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="lg" className="font-semibold" onClick={() => setActiveTab('members')}>
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
                    {recentActiveCases.map((caseItem) => (
                      <CaseCard
                        key={caseItem.id}
                        case={caseItem}
                        onClick={() => navigate(`/cases/${caseItem.id}`)}
                      />
                    ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="lg" className="font-semibold" onClick={() => setActiveTab('cases')}>
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
                <TransactionList transactions={recentTransactions} />
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/transactions')}>
                    View All Transactions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-8">
            <Card className="shadow-lg rounded-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Members</CardTitle>
                <CardDescription className="text-base">All registered members</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {mockMembers.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      onClick={() => navigate(`/members/${member.id}`)}
                    />
                  ))}
                </div>
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/members')}>
                    View All Members
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases" className="space-y-8">
            <Card className="shadow-lg rounded-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Cases</CardTitle>
                <CardDescription className="text-base">All welfare cases</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {mockCases.map((caseItem) => (
                    <CaseCard
                      key={caseItem.id}
                      case={caseItem}
                      onClick={() => navigate(`/cases/${caseItem.id}`)}
                    />
                  ))}
                </div>
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="lg" className="font-semibold" onClick={() => navigate('/cases')}>
                    View All Cases
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
                <TransactionList transactions={recentTransactions} />
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
