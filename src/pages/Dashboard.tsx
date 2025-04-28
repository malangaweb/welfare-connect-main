import { useState } from 'react';
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
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
            <p className="text-muted-foreground">Welcome to MCWG management portal</p>
          </div>
          <div className="flex space-x-4">
            <Button onClick={() => navigate('/members/new')}>
              <UserPlus className="h-4 w-4 mr-2" />
              New Member
            </Button>
            <Button onClick={() => navigate('/cases/new')}>
              <CalendarDays className="h-4 w-4 mr-2" />
              New Case
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Members"
            value="240"
            icon={<Users className="h-4 w-4" />}
            description="Active and inactive members"
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="Active Cases"
            value="3"
            icon={<CalendarDays className="h-4 w-4" />}
            description="Cases in progress"
          />
          <StatsCard
            title="Total Contributions"
            value="KES 1,256,000"
            icon={<CreditCard className="h-4 w-4" />}
            trend={{ value: 8.5, isPositive: true }}
          />
          <StatsCard
            title="Defaulting Members"
            value="18"
            icon={<AlertCircle className="h-4 w-4" />}
            description="Members with negative balance"
            trend={{ value: 5, isPositive: false }}
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Members</CardTitle>
                  <CardDescription>Latest member registrations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockMembers.slice(0, 2).map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onClick={() => navigate(`/members/${member.id}`)}
                      />
                    ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('members')}>
                        View All Members
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active Cases</CardTitle>
                  <CardDescription>Cases currently in progress</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockCases.filter(c => c.isActive).map((caseItem) => (
                      <CaseCard
                        key={caseItem.id}
                        case={caseItem}
                        onClick={() => navigate(`/cases/${caseItem.id}`)}
                      />
                    ))}
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('cases')}>
                        View All Cases
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest financial activities</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionList transactions={mockTransactions} />
                <div className="flex justify-center mt-6">
                  <Button variant="outline" size="sm" onClick={() => navigate('/transactions')}>
                    View All Transactions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>All registered members</CardDescription>
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
                  <Button variant="outline" onClick={() => navigate('/members')}>
                    View All Members
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cases</CardTitle>
                <CardDescription>All welfare cases</CardDescription>
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
                  <Button variant="outline" onClick={() => navigate('/cases')}>
                    View All Cases
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>All financial transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionList transactions={mockTransactions} />
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={() => navigate('/transactions')}>
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
