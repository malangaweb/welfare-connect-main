import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, UserPlus, ArrowUpDown, Upload, Pencil, Settings, Trash2, ArrowRight } from 'lucide-react';
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
import { TransferBetweenMembersDialog } from '@/components/accounts/TransferBetweenMembersDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

const MemberRow = ({ member, index, navigate, onEdit, onManage, onDelete, onTransfer }: {
  member: Member,
  index: number,
  navigate: (path: string) => void,
  onEdit: (m: Member) => void
  onManage: (m: Member) => void
  onDelete: (m: Member) => void
  onTransfer: (m: Member) => void
}) => {
  return (
    <TableRow
      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group h-14 md:h-16"
    >
      <TableCell className="font-bold text-slate-900 py-3 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">#{member.memberNumber}</TableCell>
      <TableCell className="font-bold text-slate-900 py-3 px-2 md:px-4">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
            {member.name.substring(0, 2).toUpperCase()}
          </div>
          <span className="truncate max-w-[120px] md:max-w-none">{member.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-slate-600 font-medium text-xs md:text-sm py-3 px-2 md:px-4 whitespace-nowrap">
        {member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : '-'}
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap">
        {member.phoneNumber ? (
          <a
            href={`tel:${member.phoneNumber}`}
            className="text-primary hover:underline font-medium text-xs md:text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            +{member.phoneNumber}
          </a>
        ) : (
          <span className="text-slate-400 text-xs md:text-sm italic">N/A</span>
        )}
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4">
        <div className="flex flex-wrap gap-1">
          {member.emailAddress && (
            <Badge variant="secondary" className="text-[10px] md:text-xs rounded-full font-medium bg-slate-100 text-slate-700 hover:bg-slate-100 border-0">
              Email
            </Badge>
          )}
          {member.residence && (
            <Badge variant="secondary" className="text-[10px] md:text-xs rounded-full font-medium bg-blue-50 text-blue-700 hover:bg-blue-50 border-0 truncate max-w-[80px] md:max-w-none">
              {member.residence.split(' ')[0]}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap">
        <MemberStatusBadge member={member} />
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 text-right whitespace-nowrap">
        <span
          className={`font-semibold text-xs md:text-sm ${
            member.walletBalance < 0
              ? 'text-red-600'
              : member.walletBalance > 0
                ? 'text-green-600'
                : 'text-slate-600'
          }`}
        >
          KES {member.walletBalance?.toLocaleString() || '0'}
        </span>
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap">
        <div className="flex items-center gap-0.5 md:gap-1" onClick={(e) => e.stopPropagation()}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 md:h-8 md:w-8 hover:bg-primary/10"
                  onClick={() => navigate(`/members/${member.id}`)}
                >
                  <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 md:h-8 md:w-8 hover:bg-primary/10"
                  onClick={() => onManage(member)}
                >
                  <Settings className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Manage</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 md:h-8 md:w-8 hover:bg-red-50 text-red-600"
                  onClick={() => onDelete(member)}
                >
                  <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 md:h-8 md:w-8 hover:bg-primary/10 text-primary"
                  onClick={() => onTransfer(member)}
                >
                  <ArrowRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Transfer</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
        // Extract numeric part for proper numeric sorting (1, 2, 10, 100 instead of 1, 10, 100, 2)
        diff = getMemberNumberValue(a.memberNumber) - getMemberNumberValue(b.memberNumber);
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
  const [allMembers, setAllMembers] = useState<Member[]>([]); // Store complete list for exports
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editInitialData, setEditInitialData] = useState<any>(null);
  const [manageMemberOpen, setManageMemberOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'memberNumber',
    direction: 'asc',
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFromMember, setTransferFromMember] = useState<Member | null>(null);
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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleTransferFromMember = (m: Member) => {
    setTransferFromMember(m);
    setTransferOpen(true);
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);

      // Fetch ALL members with filters (no pagination yet)
      let query = supabase
        .from('members')
        .select('*', { count: 'exact' });

      // Apply Server-Side Search
      if (debouncedSearch) {
        query = query.or(`member_number.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%`);
      }

      // Apply Server-Side Filters
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' || statusFilter === 'probation') {
          query = query.eq('status', statusFilter);
        } else if (statusFilter === 'inactive' || statusFilter === 'deceased') {
          query = query.eq('status', statusFilter);
        } else {
          const isActive = statusFilter === 'active';
          query = query.eq('is_active', isActive);
        }
      }

      if (locationFilter !== 'all') {
        query = query.eq('residence', locationFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      if (count !== null) {
        setTotalCount(count);
      }

      // Map members - use stored wallet_balance from database
      // (RPC calls for every member cause resource exhaustion with large member lists)
      const membersWithBalances = (data as any[] || []).map((m: any) => {
        const baseMember = mapDbMemberToMember(m);
        return {
          ...baseMember,
          walletBalance: Number(m.wallet_balance) || 0,
          dependants: []
        };
      });

      // Client-side filtering for defaulters and positive balance
      let filteredMembers = membersWithBalances;
      if (defaultersFilter) {
        filteredMembers = filteredMembers.filter(m => m.walletBalance < 0);
      }
      if (positiveBalanceFilter) {
        filteredMembers = filteredMembers.filter(m => m.walletBalance >= 0);
      }

      // Apply client-side sorting for proper numeric sorting of member numbers
      const sortedMembers = sortMembers(filteredMembers, sortConfig);

      // Update total pages based on sorted/filtered results
      const actualTotal = sortedMembers.length;
      setTotalPages(Math.ceil(actualTotal / itemsPerPage));

      // Store ALL members (sorted & filtered) for exports
      setAllMembers(sortedMembers);

      // Apply client-side pagination
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage;
      const paginatedMembers = sortedMembers.slice(from, to);

      setMembers(paginatedMembers);

      // Fetch locations from residences table
      if (locations.length === 0) {
        const { data: locData } = await supabase.from('residences').select('name').not('name', 'is', null);
        const uniqueLocs = [...new Set(((locData as any[]) || []).map(d => d.name as string))].sort();
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

  // Refresh members when the page becomes visible (e.g., after navigating back from deduction)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible - refresh to get latest balances
        fetchMembers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, locationFilter, defaultersFilter, positiveBalanceFilter, sortConfig]);

  const paginatedMembers = members;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Import handler with validation
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      
      if (json.length === 0) {
        toast({ 
          variant: 'destructive', 
          title: 'Import failed', 
          description: 'The Excel file is empty.' 
        });
        return;
      }
      
      // Validate required columns
      const requiredColumns = ['MemberNumber', 'Name', 'Gender', 'NationalIdNumber'];
      const firstRow = json[0];
      const missingColumns = requiredColumns.filter(col => !firstRow[col]);
      
      if (missingColumns.length > 0) {
        toast({ 
          variant: 'destructive', 
          title: 'Import failed', 
          description: `Missing required columns: ${missingColumns.join(', ')}` 
        });
        return;
      }
      
      // Validate and collect errors
      const errors: string[] = [];
      const validMembers: any[] = [];
      
      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        const rowNum = i + 2; // Excel row number (header is row 1)
        
        // Validate required fields
        if (!row.MemberNumber || String(row.MemberNumber).trim() === '') {
          errors.push(`Row ${rowNum}: Member Number is required`);
          continue;
        }
        
        if (!row.Name || String(row.Name).trim() === '') {
          errors.push(`Row ${rowNum}: Name is required`);
          continue;
        }
        
        if (!row.Gender || !['male', 'female'].includes(String(row.Gender).toLowerCase())) {
          errors.push(`Row ${rowNum}: Gender must be 'male' or 'female'`);
          continue;
        }
        
        if (!row.NationalIdNumber || String(row.NationalIdNumber).trim() === '') {
          errors.push(`Row ${rowNum}: National ID Number is required`);
          continue;
        }
        
        // Parse next of kin
        let nextOfKinObj = null;
        if (row.NextOfKin) {
          try {
            nextOfKinObj = JSON.parse(row.NextOfKin);
          } catch (e) {
            errors.push(`Row ${rowNum}: Invalid NextOfKin JSON format`);
            continue;
          }
        }
        
        // Validate date fields
        let dateOfBirth = null;
        if (row.DateOfBirth) {
          const parsedDate = new Date(row.DateOfBirth);
          if (isNaN(parsedDate.getTime())) {
            errors.push(`Row ${rowNum}: Invalid DateOfBirth format`);
            continue;
          }
          dateOfBirth = parsedDate.toISOString().split('T')[0];
        }
        
        let registrationDate = null;
        if (row.RegistrationDate) {
          const parsedDate = new Date(row.RegistrationDate);
          if (isNaN(parsedDate.getTime())) {
            errors.push(`Row ${rowNum}: Invalid RegistrationDate format`);
            continue;
          }
          registrationDate = parsedDate.toISOString().split('T')[0];
        }
        
        // Prepare valid member data
        validMembers.push({
          member_number: String(row.MemberNumber).trim(),
          name: String(row.Name).trim(),
          gender: String(row.Gender).toLowerCase(),
          date_of_birth: dateOfBirth,
          national_id_number: String(row.NationalIdNumber).trim(),
          phone_number: row.PhoneNumber ? String(row.PhoneNumber).trim() : null,
          email_address: row.EmailAddress ? String(row.EmailAddress).trim() : null,
          residence: row.Residence ? String(row.Residence).trim() : null,
          next_of_kin: nextOfKinObj,
          registration_date: registrationDate || new Date().toISOString().split('T')[0],
          is_active: String(row.IsActive).toLowerCase() === 'true' || row.IsActive === true,
        });
      }
      
      // Show validation errors
      if (errors.length > 0) {
        const errorMessages = errors.slice(0, 10).join('\n');
        toast({ 
          variant: 'destructive', 
          title: `Validation failed (${errors.length} errors)`, 
          description: errorMessages + (errors.length > 10 ? `\n...and ${errors.length - 10} more errors` : '')
        });
        
        if (validMembers.length === 0) {
          return;
        }
      }
      
      // Check for duplicate member numbers in the file
      const memberNumbers = validMembers.map(m => m.member_number);
      const duplicates = memberNumbers.filter((num, index) => memberNumbers.indexOf(num) !== index);
      if (duplicates.length > 0) {
        toast({ 
          variant: 'destructive', 
          title: 'Duplicate member numbers', 
          description: `Found duplicate member numbers: ${[...new Set(duplicates)].join(', ')}` 
        });
        return;
      }
      
      // Insert valid members in batches
      const batchSize = 50;
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < validMembers.length; i += batchSize) {
        const batch = validMembers.slice(i, i + batchSize);
        
        for (const member of batch) {
          const { error } = await supabase.from('members').insert(member as any);
          if (error) {
            console.error(`Failed to import member ${member.member_number}:`, error);
            failCount++;
          } else {
            successCount++;
          }
        }
      }
      
      toast({ 
        title: 'Import complete', 
        description: `Successfully imported ${successCount} members. ${failCount > 0 ? `${failCount} failed.` : ''}` 
      });
      
      // Refresh members list without full page reload
      await fetchMembers();
      
      // Reset file input
      e.target.value = '';
      
    } catch (error: any) {
      console.error('Import error:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Import failed', 
        description: error.message || 'An unexpected error occurred during import.' 
      });
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

      // Refresh members list without full page reload
      await fetchMembers();
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
      // Use allMembers (complete list, not paginated)
      const sortedMembers = allMembers.length > 0 ? allMembers : sortMembers(members, sortConfig);
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
        description: `${sortedMembers.length} members exported to ${filename}`,
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
      // Use allMembers (complete list, not paginated)
      const allMembersToExport = allMembers.length > 0 ? allMembers : sortMembers(members, sortConfig);
      
      // Get only members with negative wallet balance
      const defaulters = allMembersToExport.filter(member => member.walletBalance < 0);
      
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
      // Use allMembers (complete list, not paginated)
      const allMembersToExport = allMembers.length > 0 ? allMembers : sortMembers(members, sortConfig);
      
      // Get only members with positive or zero wallet balance
      const positiveBalanceMembers = allMembersToExport.filter(member => member.walletBalance >= 0);
      
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
      <div className="space-y-4 md:space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">People</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">Manage community members & contacts</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg font-semibold text-slate-600 hover:bg-slate-50 border-slate-200 text-xs md:text-sm h-9"
              onClick={() => document.getElementById('import-excel-input')?.click()}
            >
              <Upload className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
              <span className="hidden sm:inline">Import</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button
              onClick={() => navigate('/members/new')}
              size="sm"
              className="rounded-lg font-semibold shadow-sm text-xs md:text-sm h-9"
            >
              <UserPlus className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
              <span className="hidden sm:inline">Add Person</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            id="import-excel-input"
            onChange={handleImport}
          />
        </div>
        {/* End Header */}

        {/* Filters & Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 md:p-4 lg:p-6 space-y-3 md:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3 lg:gap-4">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search name, email..."
                className="pl-10 rounded-lg border-slate-200 focus:border-primary focus:ring-primary h-9 md:h-10 text-sm"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="rounded-lg border-slate-200 h-9 md:h-10 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="rounded-lg border-slate-200 h-9 md:h-10 text-sm">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-lg border-slate-200 gap-1.5 md:gap-2 flex-1 sm:flex-none" size="sm">
                    <Filter className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    <span className="hidden lg:inline">More Filters</span>
                    <span className="lg:hidden">Filters</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-semibold text-slate-900">Filter by Balance</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer flex items-center gap-2"
                    onClick={() => setDefaultersFilter(!defaultersFilter)}
                  >
                    <input type="checkbox" checked={defaultersFilter} readOnly />
                    <span>Defaulters</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="cursor-pointer flex items-center gap-2"
                    onClick={() => setPositiveBalanceFilter(!positiveBalanceFilter)}
                  >
                    <input type="checkbox" checked={positiveBalanceFilter} readOnly />
                    <span>Positive Balance</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-semibold text-slate-900">Export</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleExportMembers} className="cursor-pointer">
                    <Download className="h-4 w-4 mr-2" />
                    All Members
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportDefaulters} className="cursor-pointer">
                    <Download className="h-4 w-4 mr-2" />
                    Defaulters
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPositiveBalance} className="cursor-pointer">
                    <Download className="h-4 w-4 mr-2" />
                    Positive Balance
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-slate-200 text-xs md:text-sm h-9"
              onClick={() => {
                setStatusFilter('all');
                setLocationFilter('all');
                setDefaultersFilter(false);
                setPositiveBalanceFilter(false);
                setSearchQuery('');
              }}
            >
              Reset
            </Button>
          </div>

          {/* Results Info */}
          <div className="flex items-center justify-between text-xs md:text-sm text-slate-600 font-medium pt-2 md:pt-3">
            <span>Total: <strong className="text-slate-900">{totalCount}</strong> members</span>
            <span className="text-slate-400 hidden sm:inline">Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            {loading && members.length === 0 ? (
              <div className="p-8 md:p-12 text-center">
                <div className="space-y-3 md:space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ) : paginatedMembers.length === 0 ? (
              <div className="p-8 md:p-12 text-center">
                <Search className="h-10 w-10 md:h-12 md:w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium text-sm md:text-base">No members found</p>
                <p className="text-slate-400 text-xs md:text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="min-w-full">
                <Table>
                  <TableHeader className="bg-slate-50 border-b border-slate-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-bold text-slate-900 cursor-pointer hover:text-primary transition-colors h-12 md:h-14 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap" onClick={() => setSortConfig({...sortConfig, key: 'memberNumber', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'})}>
                        <div className="flex items-center gap-1 md:gap-2">
                          Member No
                          {sortConfig.key === 'memberNumber' ? (
                            <ArrowUpDown className={`h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="font-bold text-slate-900 cursor-pointer hover:text-primary transition-colors px-2 md:px-4 text-xs md:text-sm whitespace-nowrap" onClick={() => setSortConfig({...sortConfig, key: 'name', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'})}>
                        <div className="flex items-center gap-1 md:gap-2">
                          Name
                          {sortConfig.key === 'name' ? (
                            <ArrowUpDown className={`h-3 w-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Members</TableHead>
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Phone</TableHead>
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Tag</TableHead>
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Membership</TableHead>
                      <TableHead className="font-bold text-slate-900 text-right px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Wallet</TableHead>
                      <TableHead className="font-bold text-slate-900 w-[80px] md:w-[100px] px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Actions</TableHead>
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
                        onManage={() => {
                          setSelectedMember(member);
                          setManageMemberOpen(true);
                        }}
                        onDelete={() => {
                          setSelectedMember(member);
                          setManageMemberOpen(true);
                        }}
                        onTransfer={handleTransferFromMember}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-2xl shadow-sm border border-slate-100 px-4 md:px-6 py-3 md:py-4">
            <div className="text-xs md:text-sm text-slate-600 font-medium text-center sm:text-left">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex-shrink-0 text-xs md:text-sm"
              >
                Previous
              </Button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const page = i + 1;
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(page)}
                    className="flex-shrink-0 h-8 w-8 md:h-9 md:w-9 p-0 text-xs md:text-sm"
                  >
                    {page}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex-shrink-0 text-xs md:text-sm"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Member Modal */}
      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
          </DialogHeader>
          {editInitialData && (
            <MemberForm 
              initialData={editInitialData}
              onSubmit={handleEditMember}
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Member Modal */}
      <MemberActionsDialog
        open={manageMemberOpen}
        member={selectedMember}
        onOpenChange={setManageMemberOpen}
        onSuccess={() => {
          fetchMembers();
          setManageMemberOpen(false);
          setSelectedMember(null);
        }}
      />
      <TransferBetweenMembersDialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) setTransferFromMember(null);
        }}
        fromMember={transferFromMember}
        onTransferSuccess={() => {
          fetchMembers();
        }}
      />
      </div>
    </DashboardLayout>
  );
};

export default Members;
