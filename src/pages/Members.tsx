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
import { supabase, supabaseAdmin } from '@/integrations/supabase/client';
import { mapDbMemberToMember } from '@/lib/db-types';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MemberForm from '@/components/forms/MemberForm';


const Members = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editInitialData, setEditInitialData] = useState<any>(null);
  
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

        // Fetch all dependants for all members
        const { data: dependantsData, error: dependantsError } = await supabase
          .from('dependants')
          .select('member_id');
        if (dependantsError) {
          console.error('Error fetching dependants:', dependantsError);
          throw dependantsError;
        }
        // Count dependants per member
        const dependantsCountMap: Record<string, number> = {};
        if (dependantsData) {
          for (const dep of dependantsData) {
            if (!dependantsCountMap[dep.member_id]) dependantsCountMap[dep.member_id] = 0;
            dependantsCountMap[dep.member_id] += 1;
          }
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
          dependants: Array(dependantsCountMap[dbMember.id] || 0).fill({}) // Only for count
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

  // Import handler
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      // Map and insert members
      for (const row of json) {
        // Map Excel/CSV template columns to your schema
        let nextOfKinObj = null;
        try {
          nextOfKinObj = row.NextOfKin ? JSON.parse(row.NextOfKin) : null;
        } catch (e) {
          nextOfKinObj = null;
        }
        const member = {
          member_number: row.MemberNumber || '',
          name: row.Name || '',
          gender: row.Gender || '',
          date_of_birth: row.DateOfBirth ? new Date(row.DateOfBirth).toISOString().split('T')[0] : null,
          national_id_number: row.NationalIdNumber || '',
          phone_number: row.PhoneNumber || '',
          email_address: row.EmailAddress || '',
          residence: row.Residence || '',
          next_of_kin: nextOfKinObj,
          registration_date: row.RegistrationDate ? new Date(row.RegistrationDate).toISOString().split('T')[0] : null,
          is_active: String(row.IsActive).toLowerCase() === 'true' || row.IsActive === true,
        };
        const { error } = await supabase.from('members').insert(member);
        console.log('Inserting:', member, 'Error:', error);
        if (error) {
          toast({ variant: 'destructive', title: 'Import error', description: error.message });
        }
      }
      toast({ title: 'Import complete', description: 'Members imported from Excel.' });
      // Optionally, refresh members list
      window.location.reload();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: error.message });
    }
  };

  const handleEditMember = async (data: any) => {
    if (!selectedMember) return;
    
    setIsSubmitting(true);
    try {
      console.log('=== EDIT MEMBER DEBUG START (MEMBERS PAGE) ===');
      console.log('Edit member data received:', data);
      console.log('Selected member:', selectedMember);
      
      // Get the residence name for this ID
      let residenceName = data.residence;
      if (data.residence && typeof data.residence === 'string' && data.residence.length > 0) {
        console.log('Fetching residence name for ID:', data.residence);
        const { data: residenceData, error: residenceError } = await supabase
          .from('residences')
          .select('name')
          .eq('id', data.residence)
          .single();
          
        if (residenceError) {
          console.error('Error fetching residence name:', residenceError);
          throw new Error('Failed to fetch residence information');
        }
        
        residenceName = residenceData.name;
        console.log('Residence name resolved:', residenceName);
      }
      
      // Prepare the data for update
      const updateData = {
        name: data.name,
        gender: data.gender,
        date_of_birth: data.dateOfBirth.toISOString().split('T')[0],
        national_id_number: data.nationalIdNumber,
        phone_number: data.phoneNumber || null,
        email_address: data.emailAddress || null,
        residence: residenceName,
        next_of_kin: data.nextOfKin,
      };

      console.log('Update data being sent to database:', updateData);
      console.log('Member ID being updated:', selectedMember.id);

      // First, let's check what's currently in the database
      const { data: currentData, error: currentError } = await supabase
        .from('members')
        .select('*')
        .eq('id', selectedMember.id)
        .single();
      
      console.log('Current database data:', currentData);
      if (currentError) {
        console.error('Error fetching current data:', currentError);
      }

      // Try using admin client for update
      const { data: result, error } = await supabaseAdmin
        .from('members')
        .update(updateData)
        .eq('id', selectedMember.id)
        .select();

      console.log('Update result:', { result, error });

      if (error) {
        console.error('Supabase update error:', error);
        
        // Try with regular client as fallback
        console.log('Trying with regular client...');
        const { data: fallbackResult, error: fallbackError } = await supabase
          .from('members')
          .update(updateData)
          .eq('id', selectedMember.id)
          .select();
          
        console.log('Fallback update result:', { fallbackResult, fallbackError });
        
        if (fallbackError) {
          throw fallbackError;
        }
      }

      // Verify the update by fetching the data again
      const { data: verifyData, error: verifyError } = await supabase
        .from('members')
        .select('*')
        .eq('id', selectedMember.id)
        .single();
      
      console.log('Verification data after update:', verifyData);
      if (verifyError) {
        console.error('Error verifying update:', verifyError);
      }

      console.log('=== EDIT MEMBER DEBUG END (MEMBERS PAGE) ===');

      toast({
        title: "Success",
        description: "Member information updated successfully.",
      });

      setEditMemberOpen(false);
      setSelectedMember(null);
      
      // Refresh members list
      window.location.reload();
    } catch (error) {
      console.error('Error updating member:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update member information.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getResidenceId = async (residenceName: string) => {
    try {
      const { data, error } = await supabase
        .from('residences')
        .select('id')
        .eq('name', residenceName)
        .single();
        
      if (error) {
        console.error('Error fetching residence ID:', error);
        return null;
      }
      
      return data?.id || null;
    } catch (error) {
      console.error('Error in getResidenceId:', error);
      return null;
    }
  };

  const handleEditClick = async (member: Member) => {
    try {
      // Get residence ID for the form
      const residenceId = await getResidenceId(member.residence);
      
      setEditInitialData({
        memberNumber: member.memberNumber,
        name: member.name,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth,
        nationalIdNumber: member.nationalIdNumber,
        phoneNumber: member.phoneNumber,
        emailAddress: member.emailAddress,
        residence: residenceId,
        nextOfKin: member.nextOfKin,
        dependants: member.dependants,
      });
      
      setSelectedMember(member);
      setEditMemberOpen(true);
    } catch (error) {
      console.error('Error preparing edit data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to prepare edit form data.",
      });
    }
  };

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
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            id="import-excel-input"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            className="ml-2"
            onClick={() => document.getElementById('import-excel-input')?.click()}
          >
            Import Excel
          </Button>
          <a
            href="/members-import-template.csv"
            download
            style={{ textDecoration: 'none' }}
          >
            <Button variant="outline" className="ml-2">
              Download Template
            </Button>
          </a>
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
                onEdit={() => handleEditClick(member)}
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

      {/* Edit Member Dialog */}
      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member Information</DialogTitle>
          </DialogHeader>
          {editInitialData && (
            <MemberForm
              onSubmit={handleEditMember}
              initialData={editInitialData}
              isSubmitting={isSubmitting}
              isEditMode={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Members;
