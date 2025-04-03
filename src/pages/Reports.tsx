import { useState } from 'react';
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

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('defaulters');
  const [locationFilter, setLocationFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  });

  const defaulters = mockMembers.filter(member => member.walletBalance < 0);
  
  const filteredDefaulters = defaulters.filter(member => 
    locationFilter === 'all' || member.residence.toLowerCase() === locationFilter.toLowerCase()
  );
  
  const locations = [...new Set(mockMembers.map(member => member.residence))];

  return (
    <DashboardLayout>
      <div className="space-y-8">
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
                    Defaulters Report
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Tabs defaultValue="defaulters" className="space-y-6" onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
            <TabsTrigger value="contributions">Contributions</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="defaulters" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location} value={location.toLowerCase()}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full sm:w-auto justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={(range) => {
                      if (range) {
                        setDateRange(range);
                      }
                    }}
                    numberOfMonths={2}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              
              <Button variant="outline" className="ml-auto">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Defaulters Report</CardTitle>
                <CardDescription>Members with negative wallet balance</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredDefaulters.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No defaulters found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member #</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Residence</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance (KES)</TableHead>
                        <TableHead className="text-right">Cases Defaulted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDefaulters.map((member) => (
                        <TableRow key={member.id} onClick={() => navigate(`/members/${member.id}`)} className="cursor-pointer hover:bg-secondary/50">
                          <TableCell>{member.memberNumber}</TableCell>
                          <TableCell>{member.name}</TableCell>
                          <TableCell>{member.residence}</TableCell>
                          <TableCell>{member.isActive ? 'Active' : 'Inactive'}</TableCell>
                          <TableCell className="text-right font-medium text-destructive">
                            {member.walletBalance.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {Math.abs(Math.floor(member.walletBalance / 1000))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contributions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contributions Report</CardTitle>
                <CardDescription>Case contributions by members</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground mb-4">Select a case to view detailed contributions</p>
                <Select>
                  <SelectTrigger className="w-80 mx-auto">
                    <SelectValue placeholder="Select a case" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockCases.map((caseItem) => (
                      <SelectItem key={caseItem.id} value={caseItem.id}>
                        Case #{caseItem.caseNumber} - {caseItem.caseType} ({caseItem.affectedMember?.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Members Report</CardTitle>
                <CardDescription>Member statistics and demographics</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">Members report coming soon</p>
              </CardContent>
            </Card>
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

