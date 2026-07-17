import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, UserPlus, ArrowUpDown, Upload, Pencil, Settings, Trash2, ArrowRight, Briefcase, MessageSquare } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { mapDbMemberToMember, normalizeMemberStatus } from '@/lib/db-types';
import { MEMBER_DETAIL_COLUMNS } from '@/lib/supabaseSelectColumns';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { clearAppToken, getAppToken, invokeWithAppToken, isAppTokenExpired, normalizePhone } from '@/lib/appAuth';
import { Badge } from '@/components/ui/badge';
import MemberForm from '@/components/forms/MemberForm';
import { MemberStatusBadge } from '@/components/members/MemberStatusBadge';
import { MemberActionsDialog } from '@/components/members/MemberActionsDialog';
import { normalizeMemberNumber } from '@/lib/memberNumber';
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
import { loadXlsx } from '@/lib/reportExportLibs';
import { logSystemEvent } from '@/lib/systemLog';
import { SmsMessageComposer } from '@/components/messages/SmsMessageComposer';
import type { SmsRecipient } from '@/lib/smsMessaging';

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

type MembersListApiResponse = {
  members: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

type DeductPreviewStatus = 'eligible' | 'paid' | 'insufficient' | 'ineligible' | 'unknown';
type MemberStatusFilter = 'all' | 'active' | 'inactive' | 'probation' | 'deceased';
type DeductPreviewRow = {
  member_id: string;
  member_number: string;
  name: string;
  wallet_balance: number;
  is_active: boolean;
  status: string;
  preview_status: DeductPreviewStatus;
};

function toErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || fallback;
  if (Array.isArray(value)) {
    const parts = value.map((item) => toErrorMessage(item, '')).filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  if (value && typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') return json;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

const MemberRow = ({ member, index, navigate, onEdit, onManage, onDelete, onTransfer, onMessage, showBulkSelect, selected, onToggleSelect }: {
  member: Member,
  index: number,
  navigate: (path: string) => void,
  onEdit: (m: Member) => void
  onManage: (m: Member) => void
  onDelete: (m: Member) => void
  onTransfer: (m: Member) => void
  onMessage: (m: Member) => void
  showBulkSelect?: boolean
  selected?: boolean
  onToggleSelect?: (memberId: string, checked: boolean) => void
}) => {
  const memberName = String(member?.name || '').trim() || 'Unknown Member';
  const memberNumber = String(member?.memberNumber || '-');
  const walletBalance = Number(member?.walletBalance || 0);
  const initials = memberName.slice(0, 2).toUpperCase();

  return (
    <TableRow
      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group h-14 md:h-16"
    >
      {showBulkSelect && (
        <TableCell className="w-10 px-2 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={!!selected}
            onCheckedChange={(v) => onToggleSelect?.(member.id, v === true)}
            aria-label={`Select member ${memberNumber}`}
          />
        </TableCell>
      )}
      <TableCell className="w-[44px] md:w-[52px] font-bold text-slate-900 py-3 px-1 md:px-1.5 text-xs md:text-sm whitespace-nowrap">#{memberNumber}</TableCell>
      <TableCell className="font-bold text-slate-900 py-3 px-2 md:px-4">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="h-7 w-7 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <span className="truncate max-w-[120px] md:max-w-none">{memberName}</span>
        </div>
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap">
        {member.phoneNumber ? (
          <a
            href={`tel:${normalizePhone(member.phoneNumber)}`}
            className="text-primary hover:underline font-medium text-xs md:text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            +{normalizePhone(member.phoneNumber)}
          </a>
        ) : (
          <span className="text-slate-400 text-xs md:text-sm italic">N/A</span>
        )}
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap">
        <MemberStatusBadge member={member} />
      </TableCell>
 <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap text-center">
        {(() => {
          const count = Number(member.unpaidCaseContributionCount || 0);
          const obligations = member.unpaidCaseObligations || [];
          const countClass =
            count === 0
              ? 'bg-green-600 text-white border-green-600'
              : count <= 2
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-red-600 text-white border-red-600';

          const badge = (
            <span className={`inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${countClass}`}>
              {count}
            </span>
          );

          if (obligations.length === 0) return badge;

          const caseList = obligations.map((o, i) => (
            <div key={o.case_id} className="flex justify-between gap-4 text-xs">
              <span className="font-medium">{o.case_number}</span>
              <span>{o.case_status}</span>
              <span className="font-semibold">KES {Number(o.contribution_per_member || 0).toLocaleString()}</span>
            </div>
          ));

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="p-3 space-y-1 min-w-[200px]">
                  <div className="text-xs font-semibold mb-1 border-b pb-1">Unpaid Cases</div>
                  {caseList}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 whitespace-nowrap text-center">
        {(() => {
          const obligations = member.unpaidCaseObligations || [];
          const penaltyDue = Number(member.reinstatementPenaltyDue || 0);
          const caseTotal = obligations.reduce((s, o) => s + Number(o.contribution_per_member || 0), 0);
          const combinedTotal = caseTotal + penaltyDue;

          if (obligations.length === 0 && penaltyDue === 0) {
            return <span className="text-xs md:text-sm font-semibold text-slate-900">KES 0</span>;
          }

          const items: React.ReactNode[] = [];
          obligations.forEach((o) => {
            items.push(
              <div key={o.case_id} className="flex justify-between gap-4 text-xs">
                <span>{o.case_number}</span>
                <span className="font-semibold">KES {Number(o.contribution_per_member || 0).toLocaleString()}</span>
              </div>
            );
          });
          if (penaltyDue > 0) {
            items.push(
              <div key="penalty" className="flex justify-between gap-4 text-xs text-amber-700">
                <span>Penalty (reinstatement)</span>
                <span className="font-semibold">KES {penaltyDue.toLocaleString()}</span>
              </div>
            );
          }

          const tooltipContent = (
            <div className="space-y-1 min-w-[200px]">
              {items}
              <div className="border-t pt-1 mt-1 flex justify-between gap-4 text-xs font-bold">
                <span>Total Due</span>
                <span>KES {combinedTotal.toLocaleString()}</span>
              </div>
            </div>
          );

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`text-xs md:text-sm font-semibold ${combinedTotal > 0 ? 'text-amber-700' : 'text-slate-900'} cursor-help border-b border-dotted border-slate-400`}>
                    KES {combinedTotal.toLocaleString()}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="p-3">
                  {tooltipContent}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
      </TableCell>
      <TableCell className="py-3 px-2 md:px-4 text-right whitespace-nowrap">
        <span
          className={`font-semibold text-xs md:text-sm ${
            walletBalance < 0
              ? 'text-red-600'
              : walletBalance > 0
                ? 'text-green-600'
                : 'text-slate-600'
          }`}
        >
          KES {walletBalance.toLocaleString()}
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
                  className="h-7 w-7 md:h-8 md:w-8 hover:bg-primary/10 text-primary"
                  onClick={() => onMessage(member)}
                >
                  <MessageSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Message</p>
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
  const { isAdmin } = useAuth();
  const canBulkDeduct = isAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [defaultersFilter, setDefaultersFilter] = useState(false);
  const [positiveBalanceFilter, setPositiveBalanceFilter] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
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
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageRecipients, setMessageRecipients] = useState<SmsRecipient[]>([]);
  const [messageAudienceLabel, setMessageAudienceLabel] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductCases, setDeductCases] = useState<{ id: string; case_number: string; contribution_per_member: number }[]>([]);
  const [deductCaseId, setDeductCaseId] = useState('');
  const [deductSubmitting, setDeductSubmitting] = useState(false);
  const [deductPreviewLoading, setDeductPreviewLoading] = useState(false);
  const [deductPreviewRows, setDeductPreviewRows] = useState<DeductPreviewRow[]>([]);
  const [deductPreviewNotice, setDeductPreviewNotice] = useState<string>('');
  const [deductInlineMessage, setDeductInlineMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    clearAppToken();
    navigate('/login');
  };

  const toggleMemberSelected = (memberId: string, checked: boolean) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };

  const memberToSmsRecipient = (member: Member): SmsRecipient => {
    const obligations = member.unpaidCaseObligations || [];
    const totalDue = obligations.reduce((sum, o) => sum + Number(o.contribution_per_member || 0), 0);
    return {
      id: member.id,
      memberId: member.id,
      name: member.name,
      memberNumber: member.memberNumber,
      phoneNumber: String(member.phoneNumber || '').trim(),
      residence: member.residence,
      status: member.status,
      unpaid: String(member.unpaidCaseContributionCount || 0),
      due: totalDue > 0 ? String(totalDue) : '',
    };
  };

  const buildSmsRecipientsFromMembers = (memberList: Member[]): SmsRecipient[] => memberList
    .map(memberToSmsRecipient)
    .filter((recipient) => recipient.phoneNumber.length > 0);

  const fetchSelectedMembersForMessaging = async (): Promise<Member[]> => {
    const selectedIds = Array.from(selectedMemberIds);
    const memberRows: any[] = [];

    for (let i = 0; i < selectedIds.length; i += 200) {
      const chunk = selectedIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from('members')
        .select('id, member_number, name, phone_number, residence, status, is_active')
        .in('id', chunk);
      if (error) throw error;
      memberRows.push(...(data || []));
    }

    return memberRows.map((row) => ({
      ...mapDbMemberToMember(row),
      walletBalance: Number(row.wallet_balance) || 0,
      dependants: [],
    }));
  };

  const openSelectedMessageDialog = async () => {
    if (selectedMemberIds.size === 0) return;
    try {
      const selectedMembers = await fetchSelectedMembersForMessaging();
      const recipients = buildSmsRecipientsFromMembers(selectedMembers);
      setMessageRecipients(recipients);
      setMessageAudienceLabel(`${selectedMemberIds.size} selected member${selectedMemberIds.size === 1 ? '' : 's'}`);
      setMessageDialogOpen(true);
      if (recipients.length === 0) {
        toast({
          title: 'No phone numbers found',
          description: 'The selected members do not have phone numbers on file.',
        });
      }
    } catch (error) {
      console.error('Error preparing SMS recipients:', error);
      toast({
        variant: 'destructive',
        title: 'Could not prepare message recipients',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    }
  };

  const openMemberMessageDialog = (member: Member) => {
    const recipients = buildSmsRecipientsFromMembers([member]);
    setMessageRecipients(recipients);
    setMessageAudienceLabel(`#${member.memberNumber} ${member.name}`);
    setMessageDialogOpen(true);
    if (recipients.length === 0) {
      toast({
        title: 'No phone number found',
        description: 'This member does not have a phone number on file.',
      });
    }
  };

  const handleSendSms = async (payload: { triggerKey: string; message: string; recipients: SmsRecipient[] }) => {
    setMessageSending(true);
    try {
      const result = await invokeWithAppToken<{ sent: number; failed: number; recipients: number }>('send-sms', {
        recipients: payload.recipients,
        message: payload.message,
        triggerKey: payload.triggerKey,
        source: 'members_page',
      });

      toast({
        title: result.failed ? 'SMS partially sent' : 'SMS sent',
        description: `${result.sent.toLocaleString()} of ${result.recipients.toLocaleString()} recipient(s) accepted.`,
        variant: result.failed ? 'destructive' : 'default',
      });
      setMessageDialogOpen(false);
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      toast({
        variant: 'destructive',
        title: 'SMS failed',
        description: error.message || 'The SMS provider rejected the message.',
      });
    } finally {
      setMessageSending(false);
    }
  };

  const buildMemberIdFilterQuery = () => {
    let query = supabase.from('members').select('id');

    if (debouncedSearch) {
      query = query.or(`member_number.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%`);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'probation') {
        query = (query as any).in('status', ['probation', 'probabation']);
      } else if (statusFilter === 'deceased') {
        query = (query as any).in('status', ['deceased', 'deaceased']);
      } else if (statusFilter === 'active' || statusFilter === 'inactive') {
        query = query.eq('status', statusFilter);
      }
    }

    if (locationFilter !== 'all') {
      query = query.eq('residence', locationFilter);
    }

    if (defaultersFilter) query = query.lt('wallet_balance', 0);
    if (positiveBalanceFilter) query = query.gte('wallet_balance', 0);

    return query;
  };

  const fetchAllFilteredMemberIds = async (): Promise<string[]> => {
    const ids: string[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      const { data, error } = await buildMemberIdFilterQuery().range(from, from + batchSize - 1);
      if (error) throw error;
      const batch = (data as Array<{ id: string }> | null) || [];
      ids.push(...batch.map((row) => row.id).filter(Boolean));
      if (batch.length < batchSize) break;
    }

    return ids;
  };

  const toggleSelectAllFiltered = async (checked: boolean) => {
    setBulkSelecting(true);
    try {
      const filteredIds = await fetchAllFilteredMemberIds();
      setSelectedMemberIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          filteredIds.forEach((id) => next.add(id));
        } else {
          filteredIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    } catch (error) {
      console.error('Error toggling select all:', error);
      toast({
        variant: 'destructive',
        title: 'Selection failed',
        description: error instanceof Error ? error.message : 'Could not update selection.',
      });
    } finally {
      setBulkSelecting(false);
    }
  };

  const openDeductDialog = async () => {
    if (selectedMemberIds.size === 0) return;
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_number, contribution_per_member')
        .eq('is_active', true)
        .eq('is_finalized', false)
        .order('case_number');
      if (error) throw error;
      const rows = (data || []) as { id: string; case_number: string; contribution_per_member: number }[];
      if (rows.length === 0) {
        toast({
          title: 'No active cases',
          description: 'Open a case (active, not finalized) before running wallet deductions.',
        });
        return;
      }
      setDeductCases(rows);
      setDeductCaseId(rows[0]?.id || '');
      setDeductDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Could not load cases',
        description: error instanceof Error ? error.message : 'Try again.',
      });
    }
  };

  const runCaseDeduct = async () => {
    setDeductInlineMessage('');
    if (!deductCaseId || selectedMemberIds.size === 0) {
      toast({ variant: 'destructive', title: 'Select a case and at least one member' });
      setDeductInlineMessage('Select a case and at least one member.');
      return;
    }
    const eligibleMemberIds = deductPreviewRows
      .filter((r) => r.preview_status === 'eligible')
      .map((r) => r.member_id);
    const memberIdsToSubmit = eligibleMemberIds;
    if (memberIdsToSubmit.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No eligible members to deduct',
        description: 'All selected members are already paid, ineligible, or have insufficient balance for this case.',
      });
      setDeductInlineMessage('No eligible members to deduct for the selected case.');
      return;
    }
    const token = getAppToken();
    if (!token || isAppTokenExpired(token)) {
      clearAppToken();
      toast({ variant: 'destructive', title: 'Session expired', description: 'Please log in again.' });
      setDeductInlineMessage('Session expired. Please log in again.');
      return;
    }
    setDeductSubmitting(true);
    setDeductInlineMessage(`Submitting deduction for ${memberIdsToSubmit.length.toLocaleString()} member(s)...`);
    try {
      const d = await invokeWithAppToken<{
        success?: boolean;
        error?: string;
        deducted?: string[];
        skipped_already_paid?: string[];
        skipped_ineligible?: unknown[];
        skipped_insufficient?: unknown[];
        required_amount?: number;
      }>('api-case-bulk-deduct', {
        case_id: deductCaseId,
        member_ids: memberIdsToSubmit,
      });
      if (!d?.success) {
        throw new Error(toErrorMessage(d?.error, 'Deduction failed'));
      }
      const deductedCount = d.deducted?.length ?? 0;
      const toastVariant = deductedCount > 0 ? undefined : 'destructive';
      const toastTitle = deductedCount > 0 ? 'Deduct to case finished' : 'No deductions applied';
      console.log('Deduction response:', d);
      console.log('Skipped insufficient:', d.skipped_insufficient);
      console.log('Skipped ineligible:', d.skipped_ineligible);
      console.log('Skipped already paid:', d.skipped_already_paid);
      toast({
        variant: toastVariant,
        title: toastTitle,
        description: `Deducted: ${deductedCount}. Already paid: ${d.skipped_already_paid?.length ?? 0}. Ineligible: ${d.skipped_ineligible?.length ?? 0}. Insufficient / other: ${d.skipped_insufficient?.length ?? 0}.`,
      });
      if (deductedCount > 0) {
        setDeductInlineMessage('Deduction completed successfully.');
        setDeductDialogOpen(false);
        setSelectedMemberIds(new Set());
        setDeductPreviewRows([]);
      } else {
        const insufficient = (d.skipped_insufficient || [])[0] as any;
        const reasons: string[] = [];
        if (insufficient?.reason) {
          reasons.push(`Insufficient: ${insufficient.reason}`);
          if (insufficient.wallet_balance !== undefined) {
            reasons.push(`wallet ${insufficient.wallet_balance}`);
          }
          if (insufficient.detail) {
            reasons.push(`detail ${String(insufficient.detail).slice(0, 180)}`);
          }
          if (insufficient.retry_detail) {
            reasons.push(`retry ${String(insufficient.retry_detail).slice(0, 180)}`);
          }
        }
        const ineligible = (d.skipped_ineligible || [])[0] as any;
        if (ineligible?.reason) {
          reasons.push(`Ineligible: ${ineligible.reason}`);
          if (ineligible.status) reasons.push(`status ${ineligible.status}`);
        }
        const reasonStr = reasons.length > 0 ? reasons.join(', ') : 'unknown reason';
        setDeductInlineMessage(
          `No members deducted. Case requires KES ${d.required_amount}. First skip: ${reasonStr}.`
        );
      }
      await fetchMembers();
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Deduction failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setDeductInlineMessage(error instanceof Error ? error.message : 'Deduction failed.');
    } finally {
      setDeductSubmitting(false);
    }
  };

  const loadDeductPreview = async () => {
    if (!deductDialogOpen || !deductCaseId || selectedMemberIds.size === 0) {
      setDeductPreviewRows([]);
      setDeductPreviewNotice('');
      return;
    }
    try {
      setDeductPreviewLoading(true);
      setDeductPreviewNotice('');
      const selectedIds = Array.from(selectedMemberIds);
      const selectedCase = deductCases.find((c) => c.id === deductCaseId);
      const requiredAmount = Number(selectedCase?.contribution_per_member || 0);

      const chunkSize = 200;
      const memberRows: any[] = [];
      for (let i = 0; i < selectedIds.length; i += chunkSize) {
        const chunk = selectedIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('members')
          .select('id, member_number, name, wallet_balance, is_active, status')
          .in('id', chunk);
        if (error) throw error;
        memberRows.push(...(data || []));
      }

      const netPaidByMember = new Map<string, number>();
      for (let i = 0; i < selectedIds.length; i += chunkSize) {
        const chunk = selectedIds.slice(i, i + chunkSize);
        const { data: txRows, error: txError } = await supabase
          .from('transactions')
          .select('member_id, transaction_type, amount')
          .eq('case_id', deductCaseId)
          .in('transaction_type', ['contribution', 'case_wallet_deduction', 'contribution_refund', 'case_wallet_refund'])
          .or('status.eq.completed,status.is.null')
          .in('member_id', chunk);
        if (txError) throw txError;
        (txRows || []).forEach((t: any) => {
          if (!t.member_id) return;
          const memberId = String(t.member_id);
          const txType = String(t.transaction_type || '').toLowerCase();
          const amount = Number(t.amount) || 0;
          const current = netPaidByMember.get(memberId) || 0;
          let delta = 0;
          if (txType === 'contribution' || txType === 'case_wallet_deduction') {
            delta = Math.abs(amount);
          } else if (txType === 'contribution_refund' || txType === 'case_wallet_refund') {
            delta = amount >= 0 ? -amount : amount;
          }
          netPaidByMember.set(memberId, current + delta);
        });
      }

      const preview: DeductPreviewRow[] = selectedIds.map((memberId) => {
        const row = memberRows.find((m) => String(m.id) === memberId);
        if (!row) {
          return {
            member_id: memberId,
            member_number: '',
            name: 'Unknown',
            wallet_balance: 0,
            is_active: false,
            status: '',
            preview_status: 'unknown',
          };
        }

        const wallet = Number(row.wallet_balance) || 0;
        const status = normalizeMemberStatus(row.status, row.is_active);
        const isEligibleByMemberState = Boolean(row.is_active) && (status === 'active' || status === 'probation');
        const netPaid = netPaidByMember.get(memberId) || 0;
        const isPaid = netPaid + 1e-6 >= requiredAmount;
        const hasSufficient = wallet + 1e-6 >= requiredAmount;

        let previewStatus: DeductPreviewStatus = 'eligible';
        if (!isEligibleByMemberState) previewStatus = 'ineligible';
        else if (isPaid) previewStatus = 'paid';
        else if (!hasSufficient) previewStatus = 'insufficient';

        return {
          member_id: memberId,
          member_number: String(row.member_number || ''),
          name: String(row.name || 'Unknown'),
          wallet_balance: wallet,
          is_active: Boolean(row.is_active),
          status: String(row.status || ''),
          preview_status: previewStatus,
        };
      });

      setDeductPreviewRows(preview);
      setDeductPreviewNotice('');
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Failed to load deduction preview',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setDeductPreviewRows([]);
      setDeductPreviewNotice('Preview check failed. Please retry selecting the case.');
    } finally {
      setDeductPreviewLoading(false);
    }
  };

  const handleTransferFromMember = (m: Member) => {
    setTransferFromMember(m);
    setTransferOpen(true);
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);

      const buildMembersQuery = (withCount: boolean) => {
        let query = supabase
          .from('members')
          .select(MEMBER_DETAIL_COLUMNS, withCount ? { count: 'exact' } : undefined);

        // Apply Server-Side Search
        if (debouncedSearch) {
          query = query.or(`member_number.ilike.%${debouncedSearch}%,name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%`);
        }

        // Apply Server-Side Filters
        if (statusFilter !== 'all') {
          if (statusFilter === 'probation') {
            query = (query as any).in('status', ['probation', 'probabation']);
          } else if (statusFilter === 'deceased') {
            query = (query as any).in('status', ['deceased', 'deaceased']);
          } else if (statusFilter === 'active' || statusFilter === 'inactive') {
            query = query.eq('status', statusFilter);
          }
        }

        if (locationFilter !== 'all') {
          query = query.eq('residence', locationFilter);
        }

        return query;
      };

      const sortColumnMap: Record<SortKey, string> = {
        memberNumber: 'member_number_numeric',
        name: 'name',
        gender: 'gender',
        residence: 'residence',
        walletBalance: 'wallet_balance',
        registrationDate: 'registration_date',
      };

      let query = buildMembersQuery(true);
      if (defaultersFilter) query = query.lt('wallet_balance', 0);
      if (positiveBalanceFilter) query = query.gte('wallet_balance', 0);
      query = query
        .order(sortColumnMap[sortConfig.key], { ascending: sortConfig.direction === 'asc' })
        .order('member_number', { ascending: true });

      const pageFrom = (currentPage - 1) * itemsPerPage;
      const pageTo = pageFrom + itemsPerPage - 1;
      const { data: fetchedRows, error, count } = await query.range(pageFrom, pageTo);
      if (error) throw error;
      setTotalCount(count || 0);
      setTotalPages(Math.max(1, Math.ceil((count || 0) / itemsPerPage)));

      // Map members - use stored wallet_balance from database
      // (RPC calls for every member cause resource exhaustion with large member lists)
      const membersWithBalances = ((fetchedRows as any[]) || []).map((m: any) => {
        const baseMember = mapDbMemberToMember(m);
        return {
          ...baseMember,
          walletBalance: Number(m.wallet_balance) || 0,
          dependants: []
        };
      });
      const membersWithObligations = await Promise.all(
        membersWithBalances.map(async (member) => {
          const [{ data: obligations, error: oblError }, { data: due, error: dueError }] = await Promise.all([
            supabase.rpc('get_member_unpaid_case_obligations', { p_member_id: member.id }),
            supabase.rpc('get_member_total_due', { p_member_id: member.id }),
          ]);

          if (oblError) {
            console.error(`Failed to load unpaid case obligations for member ${member.id}:`, oblError);
          }
          if (dueError) {
            console.error(`Failed to load total due for member ${member.id}:`, dueError);
          }

          const rows = Array.isArray(obligations) ? obligations : [];
          const dueRow = Array.isArray(due) && due.length > 0 ? due[0] : null;
          return {
            ...member,
            unpaidCaseContributionCount: rows.length,
            unpaidCaseObligations: rows,
            reinstatementPenaltyDue: Number(dueRow?.reinstatement_penalty_due || 0),
            totalDue: Number(dueRow?.total_due || 0),
          };
        })
      );
      setMembers(membersWithObligations);

      // Fetch locations from residences table
      if (locations.length === 0) {
        const { data: locData } = await supabase.from('residences').select('name').not('name', 'is', null);
        const uniqueLocs = [...new Set(((locData as any[]) || []).map(d => d.name as string))].sort();
        setLocations(uniqueLocs);
      }

    } catch (error) {
      console.error('Error fetching members:', error);
      void logSystemEvent({
        action: 'MEMBERS_LIST_FETCH_FAILED',
        tableName: 'members',
        status: 'error',
        metadata: {
          source: 'Members.fetchMembers',
          message: error instanceof Error ? error.message : String(error),
          search: debouncedSearch,
          status_filter: statusFilter,
          location_filter: locationFilter,
          defaulters_filter: defaultersFilter,
          positive_filter: positiveBalanceFilter,
          page: currentPage,
        },
      });
      toast({
        variant: 'destructive',
        title: 'Failed to load members',
        description: 'The system could not load members right now. Please retry shortly.',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMembersForExport = async (
    mode: 'all' | 'defaulters' | 'positive',
    statusOverride?: MemberStatusFilter,
  ) => {
    const effectiveStatusFilter = statusOverride ?? (statusFilter as MemberStatusFilter);

    const statusMatchesFilter = (member: Member) => {
      if (effectiveStatusFilter === 'all') return true;
      const normalized = normalizeMemberStatus((member as any).status, (member as any).is_active);
      if (effectiveStatusFilter === 'probation') return normalized === 'probation';
      if (effectiveStatusFilter === 'deceased') return normalized === 'deceased';
      if (effectiveStatusFilter === 'inactive') return normalized === 'inactive';
      if (effectiveStatusFilter === 'active') return normalized === 'active';
      return true;
    };

    const rows: Array<Record<string, unknown>> = [];
    const limit = 300;
    let offset = 0;

    for (;;) {
      const result = await invokeWithAppToken<MembersListApiResponse>('api-members-list', {
        search: debouncedSearch || '',
        status: 'all',
        limit,
        offset,
      });

      const batch = Array.isArray(result?.members) ? result.members : [];
      rows.push(...batch);
      if (!result?.has_more || batch.length === 0) break;
      offset += limit;
    }

    const exportedMembers = rows
      .map((m: any) => {
        const baseMember = mapDbMemberToMember(m);
        return {
          ...baseMember,
          walletBalance: Number(m.wallet_balance) || 0,
          dependants: [],
        };
      })
      .filter((member) => statusMatchesFilter(member))
      .filter((member) => locationFilter === 'all' || (member.residence || '').toLowerCase() === locationFilter.toLowerCase())
      .filter((member) => {
        if (mode === 'defaulters') return member.walletBalance < 0;
        if (mode === 'positive') return member.walletBalance >= 0;
        if (defaultersFilter) return member.walletBalance < 0;
        if (positiveBalanceFilter) return member.walletBalance >= 0;
        return true;
      });

    return sortMembers(exportedMembers, sortConfig);
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

  useEffect(() => {
    setSelectedMemberIds(new Set());
  }, [debouncedSearch, statusFilter, locationFilter, defaultersFilter, positiveBalanceFilter, sortConfig]);

  useEffect(() => {
    void loadDeductPreview();
  }, [deductDialogOpen, deductCaseId, selectedMemberIds, deductCases]);

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
      const XLSX = await loadXlsx();
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
        const normalizedMemberNumber = normalizeMemberNumber(row.MemberNumber);
        if (!normalizedMemberNumber) {
          errors.push(`Row ${rowNum}: MemberNumber is required`);
          continue;
        }

        validMembers.push({
          member_number: normalizedMemberNumber,
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
      
      // Check for duplicate member numbers in the file (after normalization)
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

      // Check for duplicates against existing members in DB
      const uniqueMemberNumbers = [...new Set(memberNumbers)];
      const existingMemberNumbers = new Set<string>();
      const chunkSizeLookup = 200;
      for (let i = 0; i < uniqueMemberNumbers.length; i += chunkSizeLookup) {
        const chunk = uniqueMemberNumbers.slice(i, i + chunkSizeLookup);
        const { data: existingRows, error: existingErr } = await supabase
          .from('members')
          .select('member_number')
          .in('member_number', chunk);

        if (existingErr) throw existingErr;
        (existingRows || []).forEach((row: any) => {
          const normalized = normalizeMemberNumber(row.member_number);
          if (normalized) existingMemberNumbers.add(normalized);
        });
      }

      if (existingMemberNumbers.size > 0) {
        toast({
          variant: 'destructive',
          title: 'Duplicate member numbers found in system',
          description: `These member numbers already exist: ${[...existingMemberNumbers].slice(0, 12).join(', ')}${existingMemberNumbers.size > 12 ? '...' : ''}`,
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
        .select(MEMBER_DETAIL_COLUMNS)
        .eq('id', selectedMember.id)
        .single();
      
      if (currentError) {
        console.error('Error fetching current data:', currentError);
      }

      // Try using admin client for update
      const { data: result, error } = await supabase
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
        .select(MEMBER_DETAIL_COLUMNS)
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

  const handleExportMembers = async () => {
    try {
      setExporting(true);
      const XLSX = await loadXlsx();
      const sortedMembers = await fetchMembersForExport('all');
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
    finally {
      setExporting(false);
    }
  };

  const handleExportMembersByStatus = async (targetStatus: Exclude<MemberStatusFilter, 'all'>) => {
    try {
      setExporting(true);
      const XLSX = await loadXlsx();
      const filteredMembers = await fetchMembersForExport('all', targetStatus);

      if (filteredMembers.length === 0) {
        toast({
          variant: "destructive",
          title: "No Members Found",
          description: `There are no ${targetStatus} members to export.`,
        });
        return;
      }

      const exportData = filteredMembers.map(member => ({
        'Member Number': member.memberNumber,
        'Name': member.name,
        'Phone Number': member.phoneNumber || 'N/A',
        'Status': targetStatus,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, `${targetStatus[0].toUpperCase()}${targetStatus.slice(1)}`);

      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `members_${targetStatus}_${currentDate}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast({
        title: "Export Successful",
        description: `${filteredMembers.length} ${targetStatus} members exported to ${filename}`,
      });
    } catch (error) {
      console.error(`Error exporting ${targetStatus} members:`, error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: `Failed to export ${targetStatus} members data. Please try again.`,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportDefaulters = async () => {
    try {
      setExporting(true);
      const XLSX = await loadXlsx();
      const defaulters = await fetchMembersForExport('defaulters');
      
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
    finally {
      setExporting(false);
    }
  };

  const handleExportPositiveBalance = async () => {
    try {
      setExporting(true);
      const XLSX = await loadXlsx();
      const positiveBalanceMembers = await fetchMembersForExport('positive');
      
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
    finally {
      setExporting(false);
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
                <SelectItem value="probation">Probation</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="deceased">Deceased</SelectItem>
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
                  <DropdownMenuItem onClick={handleExportMembers} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    {exporting ? 'Exporting...' : 'All Members'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportDefaulters} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Defaulters
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPositiveBalance} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Positive Balance
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleExportMembersByStatus('active')} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Active Members
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExportMembersByStatus('inactive')} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Inactive Members
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExportMembersByStatus('probation')} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Probation Members
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExportMembersByStatus('deceased')} className="cursor-pointer" disabled={exporting}>
                    <Download className="h-4 w-4 mr-2" />
                    Deceased Members
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

        {canBulkDeduct && selectedMemberIds.size > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium text-slate-800">
              {selectedMemberIds.size} member{selectedMemberIds.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMemberIds(new Set())}>
                Clear selection
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void openSelectedMessageDialog()}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
              </Button>
              <Button type="button" size="sm" onClick={() => void openDeductDialog()}>
                <Briefcase className="h-4 w-4 mr-2" />
                Deduct to Case
              </Button>
            </div>
          </div>
        )}

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
                <Table className="min-w-max">
                  <TableHeader className="bg-slate-50 border-b border-slate-100">
                    <TableRow className="hover:bg-transparent">
                      {canBulkDeduct && (
                        <TableHead className="w-10 px-2">
                          <Checkbox
                            checked={
                              totalCount > 0 &&
                              selectedMemberIds.size >= totalCount
                            }
                            onCheckedChange={(v) => {
                              const checked = v === true;
                              void toggleSelectAllFiltered(checked);
                            }}
                            disabled={bulkSelecting || totalCount === 0}
                            aria-label="Select all filtered members"
                          />
                        </TableHead>
                      )}
                      <TableHead className="w-[44px] md:w-[52px] font-bold text-slate-900 cursor-pointer hover:text-primary transition-colors h-12 md:h-14 px-1 md:px-1.5 text-xs md:text-sm whitespace-nowrap" onClick={() => setSortConfig({...sortConfig, key: 'memberNumber', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'})}>
                        <div className="flex items-center gap-1 md:gap-2">
                          Mem No.
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
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Phone</TableHead>
                      <TableHead className="font-bold text-slate-900 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">Status</TableHead>
                      <TableHead className="w-[52px] md:w-[64px] font-bold text-slate-900 px-2 md:px-3 text-xs md:text-sm text-center whitespace-nowrap">Unpaid</TableHead>
                      <TableHead className="w-[52px] md:w-[64px] font-bold text-slate-900 px-2 md:px-3 text-xs md:text-sm text-center whitespace-nowrap">Due</TableHead>
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
                        onMessage={openMemberMessageDialog}
                        showBulkSelect={canBulkDeduct}
                        selected={selectedMemberIds.has(member.id)}
                        onToggleSelect={toggleMemberSelected}
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

      <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deduct to Case</DialogTitle>
            <DialogDescription>
              Debits each selected member&apos;s wallet by this case&apos;s per-member amount. Members who already paid
              (M-Pesa or prior deduction) or have insufficient balance are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Active case</Label>
              <Select value={deductCaseId} onValueChange={setDeductCaseId} disabled={deductCases.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={deductCases.length ? 'Choose case' : 'No open cases'} />
                </SelectTrigger>
                <SelectContent>
                  {deductCases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      #{c.case_number} — KES {Number(c.contribution_per_member || 0).toLocaleString()} / member
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Applying to <strong>{selectedMemberIds.size}</strong> selected member(s).
            </p>
            <p className="text-xs text-muted-foreground">
              Eligible members only: <strong>is_active = true</strong> and status <strong>active</strong> or <strong>probation</strong>.
            </p>
            {deductPreviewLoading ? (
              <p className="text-xs text-muted-foreground">Checking paid / wallet eligibility for selected case...</p>
            ) : deductPreviewNotice ? (
              <p className="text-xs text-muted-foreground">{deductPreviewNotice}</p>
            ) : deductPreviewRows.length > 0 ? (
              <div className="space-y-2 rounded-md border p-2">
                <div className="text-xs text-muted-foreground">
                  Eligible: <strong>{deductPreviewRows.filter((r) => r.preview_status === 'eligible').length}</strong> | Paid:{' '}
                  <strong>{deductPreviewRows.filter((r) => r.preview_status === 'paid').length}</strong> | Insufficient:{' '}
                  <strong>{deductPreviewRows.filter((r) => r.preview_status === 'insufficient').length}</strong> | Ineligible:{' '}
                  <strong>{deductPreviewRows.filter((r) => r.preview_status === 'ineligible').length}</strong>
                </div>
                {selectedMemberIds.size <= 300 ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">View member breakdown</summary>
                    <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
                      {deductPreviewRows.map((row) => (
                        <div key={row.member_id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                          <span className="truncate mr-2">#{row.member_number || '-'} {row.name}</span>
                          <span className="font-medium capitalize">{row.preview_status}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">Member breakdown hidden for large selections.</p>
                )}
              </div>
            ) : null}
            {deductInlineMessage ? (
              <p className="text-xs text-muted-foreground">{deductInlineMessage}</p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeductDialogOpen(false)} disabled={deductSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void runCaseDeduct()} disabled={deductSubmitting || !deductCaseId}>
              {deductSubmitting ? 'Working…' : 'Run deduction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Send SMS</DialogTitle>
          <SmsMessageComposer
            recipients={messageRecipients}
            audienceLabel={messageAudienceLabel}
            audienceDescription="Choose an SMS trigger configured on the SMS settings tab, or write a custom message."
            onSend={handleSendSms}
            isSending={messageSending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Member Modal */}
      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
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
