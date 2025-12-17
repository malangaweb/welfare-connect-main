import { useState, useEffect } from 'react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Gender, Member, Case, CaseType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  {
    id: '3',
    memberNumber: 'M003',
    name: 'David Ochieng',
    gender: Gender.MALE,
    dateOfBirth: new Date('1978-11-05'),
    nationalIdNumber: '23456789',
    phoneNumber: '+254734567890',
    emailAddress: 'david.o@example.com',
    residence: 'Nairobi',
    nextOfKin: {
      name: 'Mary Ochieng',
      relationship: 'Spouse',
      phoneNumber: '+254734567891',
    },
    dependants: [
      {
        id: 'd2',
        name: 'Daniel Ochieng',
        gender: Gender.MALE,
        relationship: 'Son',
        dateOfBirth: new Date('2005-03-20'),
        isDisabled: false,
        isEligible: true,
      },
    ],
    registrationDate: new Date('2022-03-10'),
    walletBalance: -1200,
    isActive: false,
  },
  {
    id: '4',
    memberNumber: 'M004',
    name: 'Elizabeth Wanjiku',
    gender: Gender.FEMALE,
    dateOfBirth: new Date('1982-09-15'),
    nationalIdNumber: '34567890',
    phoneNumber: '+254745678901',
    emailAddress: 'elizabeth.w@example.com',
    residence: 'Mombasa',
    nextOfKin: {
      name: 'Peter Wanjiku',
      relationship: 'Spouse',
      phoneNumber: '+254745678902',
    },
    dependants: [
      {
        id: 'd4',
        name: 'Esther Wanjiku',
        gender: Gender.FEMALE,
        relationship: 'Daughter',
        dateOfBirth: new Date('2012-04-18'),
        isDisabled: true,
        isEligible: true,
      },
    ],
    registrationDate: new Date('2022-04-05'),
    walletBalance: -800,
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
  // Prepare table data
  const data = rows.map(row => headers.map(h => row[h] ?? ''));
  // Add table
  (doc as any).autoTable({
    head: [headers],
    body: data,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [41, 128, 185] },
    margin: { top: 20 },
  });
  doc.save(filename);
}

// Pagination utility
function usePagination<T>(data: T[], rowsPerPage: number) {
  const [page, setPage] = useState(1);
  const maxPage = Math.ceil(data.length / rowsPerPage);
  const pagedData = data.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  return { page, setPage, maxPage, pagedData };
}

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('defaulters');
  const [locationFilter, setLocationFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [members, setMembers] = useState<Member[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      
      try {
        // Fetch all members with pagination
        const pageSize = 1000;
        let from = 0;
        let allMembers: any[] = [];
        
        while (true) {
          const { data: membersBatch, error: membersError } = await supabase
            .from('members')
            .select('*')
            .range(from, from + pageSize - 1);
            
          if (membersError) {
            console.error('Error fetching members:', membersError);
            throw membersError;
          }
          
          if (membersBatch && membersBatch.length > 0) {
            allMembers = allMembers.concat(membersBatch);
          }
          
          if (!membersBatch || membersBatch.length < pageSize) {
            break; // No more pages
          }
          
          from += pageSize;
        }
        
        // Fetch all cases with pagination
        let fromCases = 0;
        let allCases: any[] = [];
        
        while (true) {
          const { data: casesBatch, error: casesError } = await supabase
            .from('cases')
            .select('*')
            .range(fromCases, fromCases + pageSize - 1);
            
          if (casesError) {
            console.error('Error fetching cases:', casesError);
            throw casesError;
          }
          
          if (casesBatch && casesBatch.length > 0) {
            allCases = allCases.concat(casesBatch);
          }
          
          if (!casesBatch || casesBatch.length < pageSize) {
            break; // No more pages
          }
          
          fromCases += pageSize;
        }
        
        // Fetch all transactions with pagination
        let fromTx = 0;
        let allTransactions: any[] = [];
        
        while (true) {
          const { data: txBatch, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .range(fromTx, fromTx + pageSize - 1);
            
          if (txError) {
            console.error('Error fetching transactions:', txError);
            throw txError;
          }
          
          if (txBatch && txBatch.length > 0) {
            allTransactions = allTransactions.concat(txBatch);
          }
          
          if (!txBatch || txBatch.length < pageSize) {
            break; // No more pages
          }
          
          fromTx += pageSize;
        }
        
        // Map members to camelCase fields
        const mappedMembers = allMembers.map((m: any) => ({
          ...m,
          memberNumber: m.member_number,
          phoneNumber: m.phone_number,
          registrationDate: m.registration_date,
        }));
        
        setMembers(mappedMembers);
        const mappedCases = allCases.map((c: any) => ({
          ...c,
          caseNumber: c.case_number,
          affectedMemberId: c.affected_member_id,
          caseType: c.case_type,
          dependantId: c.dependant_id,
          contributionPerMember: c.contribution_per_member,
          startDate: c.start_date,
          endDate: c.end_date,
          expectedAmount: c.expected_amount,
          actualAmount: c.actual_amount,
          isActive: c.is_active,
          isFinalized: c.is_finalized,
          createdAt: c.created_at,
        }));
        setCases(mappedCases);
        setTransactions(allTransactions);
        
        console.log(`Fetched ${mappedMembers.length} members, ${allCases.length} cases, ${allTransactions.length} transactions`);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAll();
  }, []);

  // Calculate wallet balances for members from transactions
  const memberWalletBalances = (() => {
    const walletMap: Record<string, number> = {};
    for (const member of members) {
      const memberTransactions = transactions?.filter(tx => tx.member_id === member.id) || [];
      const balance = memberTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      walletMap[member.id] = balance;
    }
    return walletMap;
  })();

  // Update members with calculated wallet balances
  const membersWithBalances = members.map(member => ({
    ...member,
    walletBalance: memberWalletBalances[member.id] || 0
  }));

  // Derived data for summary cards
  const totalMembers = membersWithBalances.length;
  const totalActiveCases = cases.filter(c => c.isActive).length;
  const totalContributions = transactions
    .filter(tx => tx.description && tx.description.toLowerCase().startsWith('contribution'))
    .reduce((acc, tx) => acc + Number(tx.amount), 0);
  const totalRegistrationFees = transactions
    .filter(tx => tx.description && tx.description.toLowerCase().startsWith('registration'))
    .reduce((acc, tx) => acc + Number(tx.amount), 0);

  // TOTAL COLLECTED: by rule, count of members walletBalance >= 0 * per-member-contribution
  let defaultContribution = 0;
  if (cases.length > 0) {
    // Use the largest (or latest) per-member contribution from loaded cases
    defaultContribution = cases[cases.length - 1].contributionPerMember || 0;
  }
  const contributingMembersCount = membersWithBalances.filter(m => m.walletBalance >= 0).length;
  const totalCollected = contributingMembersCount * defaultContribution;

  // Defaulters
  const defaulters = membersWithBalances.filter(member => member.walletBalance < 0);
  const filteredDefaulters = defaulters.filter(member =>
    locationFilter === 'all' || (member.residence || '').toLowerCase() === locationFilter.toLowerCase()
  );
  const locations = [...new Set(membersWithBalances.map(member => member.residence))];

  // Chart data (placeholder logic)
  const contributionsByMonth = (() => {
    const map = new Map();
    transactions.forEach(tx => {
      if (tx.description && tx.description.toLowerCase().startsWith('contribution')) {
        const date = new Date(tx.created_at);
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        map.set(key, (map.get(key) || 0) + Number(tx.amount));
      }
    });
    return Array.from(map.entries()).map(([month, amount]) => ({ month, amount }));
  })();
  const newMembersByMonth = (() => {
    const map = new Map();
    members.forEach(m => {
      const date = new Date(m.registrationDate);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
  })();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Members</CardTitle>
              <CardDescription>All registered members</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? '...' : totalMembers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Active Cases</CardTitle>
              <CardDescription>Cases currently active</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? '...' : totalActiveCases}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Contributions</CardTitle>
              <CardDescription>Sum of all case contributions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? '...' : totalContributions.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Registration Fees</CardTitle>
              <CardDescription>Sum of all registration fees</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? '...' : totalRegistrationFees.toLocaleString()}</div>
            </CardContent>
          </Card>
          {/* NEW CARD: Total Collected by positive wallet and latest case contribution amount */}
          <Card>
            <CardHeader>
              <CardTitle>Total Collected (Wallet &gt;= 0)</CardTitle>
              <CardDescription>Members with positive balance × latest contribution rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">{loading ? '...' : totalCollected.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Reports</h1>
            <p className="text-muted-foreground">View and analyze welfare data</p>
          </div>
          <div className="flex space-x-3">
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Report Types</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    Members Summary
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Financial Statement
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Case Contributions
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Case Transaction Report
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Defaulters Report
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs defaultValue="contributions" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="contributions">Contributions</TabsTrigger>
            <TabsTrigger value="case-transactions">Case Transactions</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="contributions" className="space-y-6">
            {(() => {
              const contributions = transactions.filter(tx => tx.description && tx.description.toLowerCase().startsWith('contribution'));
              const { page, setPage, maxPage, pagedData } = usePagination(contributions, 10);
              return (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Contributions Report</CardTitle>
                      <CardDescription>All contributions to cases by members</CardDescription>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => exportToCSV('contributions.csv',
                        pagedData.map(tx => ({
                          member: members.find(m => m.id === tx.member_id)?.name || 'Unknown',
                          amount: tx.amount,
                          mpesaReference: tx.mpesa_reference,
                          description: tx.description,
                          date: tx.created_at
                        })),
                        ['member','amount','mpesaReference','description','date'])}>
                        Export Excel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportToPDF('contributions.pdf',
                        pagedData.map(tx => ({
                          member: members.find(m => m.id === tx.member_id)?.name || 'Unknown',
                          amount: tx.amount,
                          mpesaReference: tx.mpesa_reference,
                          description: tx.description,
                          date: tx.created_at
                        })),
                        ['member','amount','mpesaReference','description','date'])}>
                        Export PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Mpesa Ref</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedData.map(tx => (
                          <TableRow key={tx.id}>
                            <TableCell>{members.find(m => m.id === tx.member_id)?.name || 'Unknown'}</TableCell>
                            <TableCell>{Number(tx.amount).toLocaleString()}</TableCell>
                            <TableCell>{tx.mpesa_reference}</TableCell>
                            <TableCell>{tx.description}</TableCell>
                            <TableCell>{tx.created_at ? format(new Date(tx.created_at), 'yyyy-MM-dd') : ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-between items-center mt-4">
                      <span>Page {page} of {maxPage}</span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page === maxPage}>Next</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          <TabsContent value="case-transactions" className="space-y-6">
            {(() => {
              const [selectedCaseId, setSelectedCaseId] = useState<string>('');
              
              // Filter transactions for the selected case
              const selectedCase = cases.find(c => c.id === selectedCaseId);
              const caseTransactions = selectedCaseId && selectedCase
                ? transactions.filter(tx => {
                    const memberNumber = members.find(m => m.id === selectedCase.affectedMemberId)?.memberNumber;
                    return memberNumber && tx.description === memberNumber &&
                      tx.created_at &&
                      new Date(tx.created_at) >= new Date(selectedCase.startDate) &&
                      new Date(tx.created_at) <= new Date(selectedCase.endDate);
                  })
                : [];
              
              const totalCollected = caseTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
              const expectedAmount = selectedCase?.expectedAmount || 0;
              const collectionPercentage = expectedAmount > 0 ? (totalCollected / expectedAmount) * 100 : 0;
              
              const { page, setPage, maxPage, pagedData } = usePagination(caseTransactions, 10);
              
              return (
                <div className="space-y-6">
                  {/* Case Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Select Case</CardTitle>
                      <CardDescription>Choose a case to view transaction details</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a case to view transactions" />
                        </SelectTrigger>
                        <SelectContent>
                          {cases.map(caseItem => (
                            <SelectItem key={caseItem.id} value={caseItem.id}>
                              {caseItem.caseNumber} - {(caseItem.affectedMember?.name || members.find(m => m.id === caseItem.affectedMemberId)?.name || 'Unknown Member')} ({caseItem.caseType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>

                  {/* Summary Cards */}
                  {selectedCaseId && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Total Collected</CardTitle>
                          <CardDescription>Amount collected from transactions</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-green-600">
                            {totalCollected.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Expected Amount</CardTitle>
                          <CardDescription>Target amount for this case</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">
                            {expectedAmount.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Collection Rate</CardTitle>
                          <CardDescription>Percentage of target achieved</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold">
                            {collectionPercentage.toFixed(1)}%
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Transactions Table */}
                  {selectedCaseId && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Case Transactions</CardTitle>
                          <CardDescription>
                            Transactions for {selectedCase?.caseNumber} - {(selectedCase?.affectedMember?.name || members.find(m => m.id === selectedCase?.affectedMemberId)?.name || 'Unknown Member')}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => exportToCSV(`case-${selectedCase?.caseNumber}-transactions.csv`,
                            pagedData.map(tx => ({
                              member: members.find(m => m.id === tx.member_id)?.name || 'Unknown',
                              amount: tx.amount,
                              mpesaReference: tx.mpesa_reference,
                              description: tx.description,
                              transactionType: tx.transaction_type,
                              date: tx.created_at
                            })),
                            ['member','amount','mpesaReference','description','transactionType','date'])}>
                            Export Excel
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => exportToPDF(`case-${selectedCase?.caseNumber}-transactions.pdf`,
                            pagedData.map(tx => ({
                              member: members.find(m => m.id === tx.member_id)?.name || 'Unknown',
                              amount: tx.amount,
                              mpesaReference: tx.mpesa_reference,
                              description: tx.description,
                              transactionType: tx.transaction_type,
                              date: tx.created_at
                            })),
                            ['member','amount','mpesaReference','description','transactionType','date'])}>
                            Export PDF
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {caseTransactions.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No transactions found for this case.
                          </div>
                        ) : (
                          <>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Member</TableHead>
                                  <TableHead>Amount</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Mpesa Ref</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead>Date</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagedData.map(tx => (
                                  <TableRow key={tx.id}>
                                    <TableCell>{members.find(m => m.id === tx.member_id)?.name || 'Unknown'}</TableCell>
                                    <TableCell className="font-medium">{Number(tx.amount).toLocaleString()}</TableCell>
                                    <TableCell>
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {tx.transaction_type}
                                      </span>
                                    </TableCell>
                                    <TableCell>{tx.mpesa_reference || '-'}</TableCell>
                                    <TableCell>{tx.description}</TableCell>
                                    <TableCell>{tx.created_at ? format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm') : ''}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            <div className="flex justify-between items-center mt-4">
                              <span>Page {page} of {maxPage}</span>
                              <div className="space-x-2">
                                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page === maxPage}>Next</Button>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            {(() => {
              const { page, setPage, maxPage, pagedData } = usePagination(membersWithBalances, 10);
              return (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Members Report</CardTitle>
                      <CardDescription>All registered members</CardDescription>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => exportToCSV('members.csv',
                        pagedData.map(m => ({
                          member_number: m.memberNumber,
                          name: m.name,
                          gender: m.gender,
                          phone_number: m.phoneNumber,
                          residence: m.residence,
                          wallet_balance: m.walletBalance,
                          registration_date: m.registrationDate
                        })),
                        ['member_number','name','gender','phone_number','residence','wallet_balance','registration_date'])}>
                        Export Excel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportToPDF('members.pdf',
                        pagedData.map(m => ({
                          member_number: m.memberNumber,
                          name: m.name,
                          gender: m.gender,
                          phone_number: m.phoneNumber,
                          residence: m.residence,
                          wallet_balance: m.walletBalance,
                          registration_date: m.registrationDate
                        })),
                        ['member_number','name','gender','phone_number','residence','wallet_balance','registration_date'])}>
                        Export PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member #</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Residence</TableHead>
                          <TableHead>Wallet Balance</TableHead>
                          <TableHead>Registration Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedData.map(m => (
                          <TableRow key={m.id}>
                            <TableCell>{m.memberNumber}</TableCell>
                            <TableCell>{m.name}</TableCell>
                            <TableCell>{m.gender}</TableCell>
                            <TableCell>{m.phoneNumber}</TableCell>
                            <TableCell>{m.residence}</TableCell>
                            <TableCell className={m.walletBalance < 0 ? 'text-red-600' : m.walletBalance > 0 ? 'text-green-600' : ''}>
                              {m.walletBalance.toLocaleString()}
                            </TableCell>
                            <TableCell>{m.registrationDate ? format(new Date(m.registrationDate), 'yyyy-MM-dd') : ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-between items-center mt-4">
                      <span>Page {page} of {maxPage}</span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page === maxPage}>Next</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </TabsContent>

          <TabsContent value="financial" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Financial Report</CardTitle>
                <CardDescription>Financial statements and summaries</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Financial report coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Reports;

