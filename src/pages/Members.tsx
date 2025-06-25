import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, UserPlus } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import MemberCard from '@/components/MemberCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Gender, Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { mapDbMemberToMember } from '@/lib/db-types';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';


const Members = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  useEffect(() => {
    console.log('Environment variables:', {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'exists' : 'missing'
    });

    const testConnection = async () => {
      try {
        // First, test the connection
        const { data: testData, error: testError } = await supabase
          .from('members')
          .select('count')
          .limit(1);

        console.log('Database connection test:', { testData, testError });

        // Then try to get the table structure
        const { data: tableInfo, error: tableError } = await supabase
          .rpc('get_table_info', { table_name: 'members' });

        console.log('Table structure:', { tableInfo, tableError });

        // Now try to fetch members
        const { data: membersData, error: membersError } = await supabase
          .from('members')
          .select('*');

        console.log('Raw members data:', membersData);
        console.log('Members error:', membersError);

        if (membersError) {
          throw membersError;
        }

        if (!membersData || membersData.length === 0) {
          console.log('No members found in database');
          // Let's check if the table exists
          const { data: tables, error: tablesError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');

          console.log('Available tables:', tables);
        }

      } catch (error) {
        console.error('Database connection test failed:', error);
      }
    };

    testConnection();
  }, []);

  useEffect(() => {
    console.log('Environment variables check:', {
      hasUrl: !!import.meta.env.VITE_SUPABASE_URL,
      hasKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      url: import.meta.env.VITE_SUPABASE_URL,
    });
  }, []);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        console.log('Starting to fetch members...');

        // Query matching the exact schema
        const { data, error } = await supabase
          .from('members')
          .select(`
            id,
            member_number,
            name,
            gender,
            date_of_birth,
            national_id_number,
            phone_number,
            email_address,
            residence,
            next_of_kin,
            registration_date,
            is_active
          `);

        console.log('Query result:', { data, error });

        if (error) {
          console.error('Error fetching members:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.log('No members found in database');
          toast({
            title: "No Members Found",
            description: "There are no members in the system. Please add members first.",
          });
          return;
        }

        // Fetch all transactions for all members
        const { data: transactions, error: txError } = await supabase
          .from('transactions')
          .select('member_id, amount');
        if (txError) {
          console.error('Error fetching transactions:', txError);
          throw txError;
        }

        // Calculate wallet balance per member
        const walletMap: Record<string, number> = {};
        if (transactions) {
          for (const tx of transactions) {
            if (!walletMap[tx.member_id]) walletMap[tx.member_id] = 0;
            walletMap[tx.member_id] += Number(tx.amount) || 0;
          }
        }

        // Map the data to match your Member interface
        const mappedMembers = data.map(dbMember => ({
          id: dbMember.id,
          memberNumber: dbMember.member_number,
          name: dbMember.name,
          gender: dbMember.gender as Gender,
          dateOfBirth: new Date(dbMember.date_of_birth),
          nationalIdNumber: dbMember.national_id_number,
          phoneNumber: dbMember.phone_number || '',
          emailAddress: dbMember.email_address || '',
          residence: dbMember.residence,
          nextOfKin: dbMember.next_of_kin,
          registrationDate: new Date(dbMember.registration_date || new Date()),
          walletBalance: walletMap[dbMember.id] || 0,
          isActive: Boolean(dbMember.is_active),
          dependants: [] // Since there's no dependants in the schema
        }));

        console.log('Mapped members:', mappedMembers);
        setMembers(mappedMembers);
      } catch (error) {
        console.error('Error in fetchMembers:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error instanceof Error 
            ? error.message 
            : 'Failed to load members. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  const filteredMembers = members.filter((member) => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.memberNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.phoneNumber && member.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (member.emailAddress && member.emailAddress.toLowerCase().includes(searchQuery.toLowerCase())) ||
      member.nationalIdNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && member.isActive) ||
      (statusFilter === 'inactive' && !member.isActive);
    
    const matchesLocation = 
      locationFilter === 'all' ||
      member.residence.toLowerCase() === locationFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesLocation;
  });

  return (
    <DashboardLayout customLogout={handleLogout}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Members</h1>
            <p className="text-muted-foreground">Manage community members</p>
          </div>
          <Button onClick={() => navigate('/members/new')}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add New Member
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search members..."
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Filter Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  Gender
                </DropdownMenuItem>
                <DropdownMenuItem>
                  Age Range
                </DropdownMenuItem>
                <DropdownMenuItem>
                  Registration Date
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
            </div>
        ) : filteredMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onClick={() => navigate(`/members/${member.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-lg font-medium mb-2">No members found</p>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all' || locationFilter !== 'all' 
                ? "Try changing your search or filters" 
                : "Add a new member to get started"}
            </p>
            {!searchQuery && statusFilter === 'all' && locationFilter === 'all' && (
              <Button onClick={() => navigate('/members/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
          )}
        </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Members;
