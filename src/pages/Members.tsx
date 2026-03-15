import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { persistentCache } from '@/lib/cache';
import { mapDbMemberToMember } from '@/lib/db-types';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import MemberForm from '@/components/forms/MemberForm';
import { MemberStatusBadge } from '@/components/members/MemberStatusBadge';
import { MemberActionsDialog } from '@/components/members/MemberActionsDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Database } from '@/integrations/supabase/types';

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

const MemberRow = ({ member, index, navigate, onEdit, onManage }: {
  member: Member,
  index: number,
  navigate: (path: string) => void,
  onEdit: (m: Member) => void
  onManage: (m: Member) => void
}) => {
  return (
    <TableRow
      className={`cursor-pointer hover:bg-muted/60 transition-colors ${
        index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
      }`}
      onClick={() => navigate(`/members/${member.id}`)}
    >
      <TableCell className="font-medium">{member.memberNumber}</TableCell>
      <TableCell className="font-semibold">{member.name}</TableCell>
      <TableCell>{member.gender}</TableCell>
      <TableCell>
        {member.phoneNumber ? (
          <a
            href={`tel:${member.phoneNumber}`}
            className="text-primary hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {member.phoneNumber}
          </a>
        ) : (
          <span className="text-muted-foreground italic">N/A</span>
        )}
      </TableCell>
      <TableCell>{member.residence}</TableCell>
      <TableCell className="text-right">
        <span
          className={`inline-flex items-center justify-end rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
            member.walletBalance < 0
              ? 'bg-red-100 text-red-700'
              : member.walletBalance > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {member.walletBalance.toLocaleString()}
        </span>
      </TableCell>
      <TableCell>
        <MemberStatusBadge member={member} />
      </TableCell>
      <TableCell className="text-muted-foreground font-medium">
        {member.registrationDate
          ? new Date(member.registrationDate).toLocaleDateString()
          : ''}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg font-semibold hover:bg-primary hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(member);
            }}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              onManage(member);
            }}
          >
            Manage
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const MemoizedMemberRow = React.memo(MemberRow);

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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [defaultersFilter, setDefaultersFilter] = useState(false);
  const [positiveBalanceFilter, setPositiveBalanceFilter] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>(() => {
    // ⚡ Instant load: Start with cached data if it exists
    const cached = persistentCache.get<{members: Member[], locations: string[]}>('members-list');
    if (cached) {
      setTimeout(() => setLoading(false), 0);
      setLocations(cached.locations);
      return cached.members;
    }
    return [];
  });
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editInitialData, setEditInitialData] = useState<any>(null);
  const [manageMemberOpen, setManageMemberOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'memberNumber',
    direction: 'asc',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 20;

  // Debounce search input so filtering doesn't run on every keystroke
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  const fetchMembers = async () => {
    try {
      const cacheKey = `members-p${currentPage}-q${debouncedSearch}-s${statusFilter}-l${locationFilter}`;
      if (!persistentCache.has(cacheKey)) {
        setLoading(true);
      }

      let query = supabase
        .from('members')
        .select('*', { count: 'exact' });

      // Apply Server-Side Search
      if (debouncedSearch) {
        // Use the optimized search logic - if there's a member number strictly match, or name similarity
        query = query.or(`member_number.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%`);
      }

      // Apply Server-Side Filters
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' || statusFilter === 'probation') {
          // For active/probation, filter by status column
          query = query.eq('status', statusFilter);
        } else if (statusFilter === 'inactive' || statusFilter === 'deceased') {
          // For inactive/deceased, filter by status column
          query = query.eq('status', statusFilter);
        } else {
          // Fallback to is_active for backward compatibility
          const isActive = statusFilter === 'active';
          query = query.eq('is_active', isActive);
        }
      }
      
      if (locationFilter !== 'all') {
        query = query.eq('residence', locationFilter);
      }

      if (defaultersFilter) {
        query = query.lt('wallet_balance', 0);
      }

      if (positiveBalanceFilter) {
        query = query.gt('wallet_balance', 0);
      }

      // Apply Sorting
      const sortMap: Record<SortKey, string> = {
        memberNumber: 'member_number',
        name: 'name',
        gender: 'gender',
        residence: 'residence',
        walletBalance: 'wallet_balance',
        registrationDate: 'registration_date'
      };
      query = query.order(sortMap[sortConfig.key] || 'member_number', { ascending: sortConfig.direction === 'asc' });

      // Apply Pagination
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      
      if (count !== null) {
        setTotalCount(count);
        setTotalPages(Math.ceil(count / itemsPerPage));
      }

      // Map members
      const mappedMembers: Member[] = (data || []).map(m => ({
        ...mapDbMemberToMember(m), // use helper
        dependants: [] // empty for list view
      }));

      setMembers(mappedMembers);
      
      // Cache this page
      persistentCache.set(cacheKey, { members: mappedMembers, count }, 5 * 60 * 1000);

      // Fetch locations for filter separately (should probably be a fixed list or separate RPC)
      if (locations.length === 0) {
        const { data: locData } = await supabase.from('members').select('residence').not('residence', 'is', null);
        const uniqueLocs = [...new Set(((locData as any[]) || []).map(d => d.residence as string))].sort();
        setLocations(uniqueLocs);
      }

    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [currentPage, debouncedSearch, statusFilter, locationFilter, defaultersFilter, positiveBalanceFilter, sortConfig]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, locationFilter, defaultersFilter, positiveBalanceFilter, sortConfig]);
  const sortedFilteredMembers = members; 
  const paginatedMembers = members;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
        const member: Database['public']['Tables']['members']['Insert'] = {
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
        const { error } = await supabase.from('members').insert(member as any);
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
      // Get the residence name for this ID
      let residenceName = data.residence;
      if (data.residence && typeof data.residence === 'string' && data.residence.length > 0) {
        const { data: residenceData, error: residenceError } = await (supabase as any)
          .from('residences')
          .select('name')
          .eq('id', data.residence)
          .single();
          
        if (residenceError) {
          console.error('Error fetching residence name:', residenceError);
          throw new Error('Failed to fetch residence information');
        }
        
        if (residenceData) {
          residenceName = residenceData.name;
        }
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

      // First, let's check what's currently in the database
      const { data: currentData, error: currentError } = await supabase
        .from('members')
        .select('*')
        .eq('id', selectedMember.id)
        .single();
      
      if (currentError) {
        console.error('Error fetching current data:', currentError);
      }

      // Try using admin client for update
      const { data: result, error } = await supabaseAdmin
        .from('members')
        // @ts-ignore
        .update(updateData)
        .eq('id', selectedMember.id)
        .select();

      if (error) {
        console.error('Supabase update error:', error);
        
        // Try with regular client as fallback
        const { data: fallbackResult, error: fallbackError } = await supabase
          .from('members')
          // @ts-ignore
          .update(updateData)
          .eq('id', selectedMember.id)
          .select();
          
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
      
      if (verifyError) {
        console.error('Error verifying update:', verifyError);
      }

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
      
      // @ts-ignore - Supabase type inference issue
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
    <DashboardLayout>
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
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="probation">Probation</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
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
        ) : members.length > 0 ? (
          <div>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  <span className="font-semibold text-foreground">
                    {totalCount}
                  </span>{' '}
                  member{totalCount !== 1 ? 's' : ''}
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
                  <TableRow className="bg-muted hover:bg-muted font-bold border-b-2">
                    <TableHead className="w-[100px]">
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
                        M/No
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
                              prev.key === 'name' && prev.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }))
                        }
                      >
                        Full Name
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'name'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Residence</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide w-full"
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
                        Balance
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sortConfig.key === 'walletBalance'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    </TableHead>
                    <TableHead>Status</TableHead>
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
                        Reg. Date
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
                  {paginatedMembers.map((member, index) => (
                    <MemoizedMemberRow
                      key={member.id}
                      member={member}
                      index={index}
                      navigate={navigate}
                      onEdit={handleEditClick}
                      onManage={(m) => {
                        setSelectedMember(m)
                        setManageMemberOpen(true)
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8 pb-8">
                <Button 
                  variant="outline" 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    // Simple page range logic
                    let p = currentPage - 2 + i;
                    if (currentPage <= 2) p = i + 1;
                    if (currentPage >= totalPages - 1) p = totalPages - 4 + i;
                    if (p < 1 || p > totalPages) return null;
                    
                    return (
                      <Button
                        key={p}
                        variant={currentPage === p ? "default" : "outline"}
                        size="sm"
                        className="w-9 h-9"
                        onClick={() => handlePageChange(p)}
                      >
                        {p}
                      </Button>
                    );
                  })}
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <span className="text-muted-foreground">...</span>
                  )}
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-9 h-9"
                      onClick={() => handlePageChange(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
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

      {/* Manage Member Dialog */}
      {selectedMember && (
        <MemberActionsDialog
          member={selectedMember}
          open={manageMemberOpen}
          onOpenChange={setManageMemberOpen}
          onSuccess={() => {
            fetchMembers()
            setManageMemberOpen(false)
            setSelectedMember(null)
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default Members;
