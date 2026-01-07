import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, UserPlus, ArrowUpDown } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
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
import { Badge } from '@/components/ui/badge';
import MemberForm from '@/components/forms/MemberForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const getMemberNumberValue = (memberNumber?: string) => {
  if (!memberNumber) return Number.MAX_SAFE_INTEGER;
  const trimmed = memberNumber.trim();
  if (!trimmed) return Number.MAX_SAFE_INTEGER;
  const numericOnly = trimmed.replace(/[^\d]/g, '');
  if (numericOnly) {
    const parsed = parseInt(numericOnly, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  const fallback = Number(trimmed);
  return !isNaN(fallback) ? fallback : Number.MAX_SAFE_INTEGER;
};

type SortKey = 'memberNumber' | 'name' | 'gender' | 'residence' | 'walletBalance' | 'registrationDate';

interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const sortMembers = (list: Member[], sortConfig: SortConfig): Member[] => {
  const sorted = [...list].sort((a, b) => {
    let diff = 0;

    switch (sortConfig.key) {
      case 'memberNumber':
        diff = getMemberNumberValue(a.memberNumber) - getMemberNumberValue(b.memberNumber);
        if (diff === 0) {
          return a.memberNumber.localeCompare(b.memberNumber);
        }
        break;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'gender':
        return String(a.gender).localeCompare(String(b.gender));
      case 'residence':
        return a.residence.localeCompare(b.residence);
      case 'walletBalance':
        diff = a.walletBalance - b.walletBalance;
        break;
      case 'registrationDate':
        diff =
          (a.registrationDate ? a.registrationDate.getTime() : 0) -
          (b.registrationDate ? b.registrationDate.getTime() : 0);
        break;
    }

    if (diff < 0) return -1;
    if (diff > 0) return 1;
    return 0;
  });

  if (sortConfig.direction === 'desc') {
    sorted.reverse();
  }

  return sorted;
};

const Members = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [defaultersFilter, setDefaultersFilter] = useState(false);
  const [positiveBalanceFilter, setPositiveBalanceFilter] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editInitialData, setEditInitialData] = useState<any>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'memberNumber',
    direction: 'asc',
  });
  
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

        // Query matching the exact schema with pagination to get all members
        const pageSize = 1000;
        let from = 0;
        let allMembersData: any[] = [];
        
        while (true) {
          const { data: membersBatch, error: batchError } = await supabase
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
              is_active,
              wallet_balance
            `)
            .range(from, from + pageSize - 1);

          if (batchError) {
            console.error('Error fetching members batch:', batchError);
            throw batchError;
          }

          if (membersBatch && membersBatch.length > 0) {
            allMembersData = allMembersData.concat(membersBatch);
          }

          if (!membersBatch || membersBatch.length < pageSize) {
            break; // No more pages
          }
          
          from += pageSize;
        }

        console.log('Query result:', { data: allMembersData, error: null });
        console.log('Members page - Total members fetched:', allMembersData.length);
        console.log('Members page - Member names:', allMembersData.map(m => m.name));
        
        // Debug: Check for specific member "Ziro"
        const ziroMember = allMembersData.find(m => m.name?.toLowerCase().includes('ziro'));
        console.log('Members page - Ziro member found in raw data:', ziroMember);
        if (ziroMember) {
          console.log('Ziro member details:', JSON.stringify(ziroMember, null, 2));
        }

        if (allMembersData.length === 0) {
          console.log('No members found in database');
          toast({
            title: "No Members Found",
            description: "There are no members in the system. Please add members first.",
          });
          return;
        }

        // Fetch all transactions for all members with pagination to handle >1000 transactions
        const txPageSize = 1000;
        let txFrom = 0;
        let allTransactions: any[] = [];
        
        while (true) {
          const { data: transactionsBatch, error: txError } = await supabase
            .from('transactions')
            .select('member_id, amount, transaction_type')
            .range(txFrom, txFrom + txPageSize - 1);

          if (txError) {
            console.error('Error fetching transactions batch:', txError);
            throw txError;
          }

          if (transactionsBatch && transactionsBatch.length > 0) {
            allTransactions = allTransactions.concat(transactionsBatch);
          }

          if (!transactionsBatch || transactionsBatch.length < txPageSize) {
            break; // No more pages
          }
          
          txFrom += txPageSize;
        }

        console.log(`Fetched ${allTransactions.length} transactions for wallet balance calculation`);

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

        // Calculate wallet balance per member using the same approach as member details
        const walletMap: Record<string, number> = {};
        
        // Calculate wallet balance for each member individually (same as member details)
        for (const member of allMembersData) {
          const memberTransactions = allTransactions?.filter(tx => tx.member_id === member.id) || [];
          const balance = memberTransactions.reduce((sum, tx: any) => {
            const amount = Number(tx.amount) || 0;
            const type = String(tx.transaction_type || '').toLowerCase();
            const normalizedAmount = ['registration', 'contribution', 'arrears'].includes(type)
              ? -Math.abs(amount)
              : amount;
            return sum + normalizedAmount;
          }, 0);
          walletMap[member.id] = balance;
        }

        // Map the data to match your Member interface
        const mappedMembers = allMembersData.map(dbMember => ({
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
        
        // Debug: Check for "Ziro" after mapping
        const ziroMapped = mappedMembers?.find(m => m.name?.toLowerCase().includes('ziro'));
        console.log('Ziro member found in mapped data:', ziroMapped);
        if (ziroMapped) {
          console.log('Ziro mapped member details:', JSON.stringify(ziroMapped, null, 2));
        }
        
        // Initial sort by member number (numeric order)
        const sortedMembers = sortMembers(mappedMembers, { key: 'memberNumber', direction: 'asc' });
        setMembers(sortedMembers);
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
    
    const matchesDefaulters = 
      !defaultersFilter || 
      (defaultersFilter && member.walletBalance < 0);
    
    const matchesPositiveBalance = 
      !positiveBalanceFilter || 
      (positiveBalanceFilter && member.walletBalance >= 0);
    
    return matchesSearch && matchesStatus && matchesLocation && matchesDefaulters && matchesPositiveBalance;
  });

  const sortedFilteredMembers = sortMembers(filteredMembers, sortConfig);

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

  const handleExportMembers = () => {
    try {
      console.log(`Exporting ${members.length} members`);
      
      const sortedMembers = sortMembers(members, sortConfig);
      // Prepare data for export - member number, name and phone number
      const exportData = sortedMembers.map(member => ({
        'Member Number': member.memberNumber,
        'Name': member.name,
        'Phone Number': member.phoneNumber || 'N/A'
      }));

      // Create a new workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Members');

      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `members_export_${currentDate}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, filename);

      toast({
        title: "Export Successful",
        description: `${members.length} members exported to ${filename}`,
      });
    } catch (error) {
      console.error('Error exporting members:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export members data. Please try again.",
      });
    }
  };

  const handleExportDefaulters = () => {
    try {
      // Get only members with negative wallet balance
      const defaulters = sortMembers(members, sortConfig).filter(member => member.walletBalance < 0);
      
      console.log(`Exporting ${defaulters.length} defaulters`);
      
      if (defaulters.length === 0) {
        toast({
          variant: "destructive",
          title: "No Defaulters Found",
          description: "There are no members with negative wallet balances to export.",
        });
        return;
      }
      
      // Prepare data for export - member number, name and phone number
      const exportData = defaulters.map(member => ({
        'Member Number': member.memberNumber,
        'Name': member.name,
        'Phone Number': member.phoneNumber || 'N/A',
        'Wallet Balance': member.walletBalance
      }));

      // Create a new workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Defaulters');

      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `defaulters_export_${currentDate}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, filename);

      toast({
        title: "Export Successful",
        description: `${defaulters.length} defaulters exported to ${filename}`,
      });
    } catch (error) {
      console.error('Error exporting defaulters:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export defaulters data. Please try again.",
      });
    }
  };

  const handleExportPositiveBalance = () => {
    try {
      // Get only members with positive or zero wallet balance
      const positiveBalanceMembers = sortMembers(members, sortConfig).filter(member => member.walletBalance >= 0);
      
      console.log(`Exporting ${positiveBalanceMembers.length} positive balance members`);
      
      if (positiveBalanceMembers.length === 0) {
        toast({
          variant: "destructive",
          title: "No Positive Balance Members Found",
          description: "There are no members with positive or zero wallet balances to export.",
        });
        return;
      }
      
      // Prepare data for export - member number, name and phone number
      const exportData = positiveBalanceMembers.map(member => ({
        'Member Number': member.memberNumber,
        'Name': member.name,
        'Phone Number': member.phoneNumber || 'N/A',
        'Wallet Balance': member.walletBalance
      }));

      // Create a new workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Positive Balance');

      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `positive_balance_export_${currentDate}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, filename);

      toast({
        title: "Export Successful",
        description: `${positiveBalanceMembers.length} positive balance members exported to ${filename}`,
      });
    } catch (error) {
      console.error('Error exporting positive balance members:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export positive balance members data. Please try again.",
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
                {defaultersFilter && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                    Defaulters
                  </span>
                )}
                {positiveBalanceFilter && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                    Positive
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Filter Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setDefaultersFilter(!defaultersFilter)}>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={defaultersFilter}
                      onChange={() => setDefaultersFilter(!defaultersFilter)}
                      className="rounded"
                    />
                    <span>Defaulters (Negative Balance)</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPositiveBalanceFilter(!positiveBalanceFilter)}>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={positiveBalanceFilter}
                      onChange={() => setPositiveBalanceFilter(!positiveBalanceFilter)}
                      className="rounded"
                    />
                    <span>Positive Balance (0 and above)</span>
                  </div>
                </DropdownMenuItem>
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
        </div>

        {/* Export Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleExportMembers}>
            <Download className="h-4 w-4 mr-2" />
            Export All
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full sm:w-auto" 
            onClick={handleExportDefaulters}
            disabled={members.filter(m => m.walletBalance < 0).length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Defaulters
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full sm:w-auto" 
            onClick={handleExportPositiveBalance}
            disabled={members.filter(m => m.walletBalance >= 0).length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Positive Balance
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
          <div>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  <span className="font-semibold text-foreground">
                    {filteredMembers.length}
                  </span>{' '}
                  member{filteredMembers.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Click a column header to sort. Click a row to view full member details.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {defaultersFilter && (
                  <Badge variant="destructive" className="text-xs">
                    Defaulters only
                  </Badge>
                )}
                {positiveBalanceFilter && (
                  <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                    Positive balance
                  </Badge>
                )}
                {statusFilter !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    Status: {statusFilter}
                  </Badge>
                )}
                {locationFilter !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    Location: {locationFilter}
                  </Badge>
                )}
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden shadow-sm bg-card/70 backdrop-blur-sm">
              <Table className="w-full text-sm">
                <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
                  <TableRow className="bg-muted/40">
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'memberNumber',
                            direction:
                              prev.key === 'memberNumber' && prev.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }))
                        }
                      >
                        Member #
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'memberNumber'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'name',
                            direction:
                              prev.key === 'name' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Name
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'name' ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'gender',
                            direction:
                              prev.key === 'gender' && prev.direction === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Gender
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'gender'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'residence',
                            direction:
                              prev.key === 'residence' && prev.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }))
                        }
                      >
                        Residence
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'residence'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        className="flex items-center justify-end gap-1 w-full text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'walletBalance',
                            direction:
                              prev.key === 'walletBalance' && prev.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }))
                        }
                      >
                        Wallet Balance
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'walletBalance'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                        onClick={() =>
                          setSortConfig((prev) => ({
                            key: 'registrationDate',
                            direction:
                              prev.key === 'registrationDate' && prev.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }))
                        }
                      >
                        Registration Date
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'registrationDate'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFilteredMembers.map((member, index) => (
                    <TableRow
                      key={member.id}
                      className={`cursor-pointer hover:bg-muted/60 transition-colors ${
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                      }`}
                      onClick={() => navigate(`/members/${member.id}`)}
                    >
                      <TableCell>{member.memberNumber}</TableCell>
                      <TableCell>{member.name}</TableCell>
                      <TableCell>{member.gender}</TableCell>
                      <TableCell>
                        {member.phoneNumber ? (
                          <a
                            href={`tel:${member.phoneNumber}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {member.phoneNumber}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{member.residence}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center justify-end rounded-full px-2 py-0.5 text-xs font-medium ${
                            member.walletBalance < 0
                              ? 'bg-red-50 text-red-700'
                              : member.walletBalance > 0
                              ? 'bg-green-50 text-green-700'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {member.walletBalance.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {member.registrationDate
                          ? new Date(member.registrationDate).toLocaleDateString()
                          : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(member);
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-lg font-medium mb-2">No members found</p>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all' || locationFilter !== 'all' || defaultersFilter || positiveBalanceFilter
                ? "Try changing your search or filters" 
                : "Add a new member to get started"}
            </p>
            {!searchQuery && statusFilter === 'all' && locationFilter === 'all' && !defaultersFilter && !positiveBalanceFilter && (
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
