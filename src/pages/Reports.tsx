import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Filter, RefreshCw, FileText, Printer, Search, SortAsc, SortDesc } from 'lucide-react';
import { format, subMonths, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Gender, Member, Case, CaseType } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { persistentCache } from '@/lib/cache';
import ReportsSubnav from '@/components/reports/ReportsSubnav';
import { createReportFilename, exportRowsToCSV, exportRowsToXLSX } from '@/lib/reportExport';

import {
  ContributionTrendChart,
  MemberDemographicsChart,
  DefaulterAnalyticsChart,
  DateRangeFilter,
  MonthlyContribution,
  MemberDemographic,
  DefaulterByLocation,
  ReportDateRange,
} from '@/components/reports';

interface Transaction {
  id: string;
  amount: number;
  mpesa_reference: string | null;
  description: string | null;
  created_at: string;
  transaction_type: string;
  status?: string | null;
  member_id?: string;
  case_id?: string;
  [key: string]: unknown;
}

interface ReportSummary {
  total_members?: number;
  active_cases?: number;
  total_contributions?: number | string;
  total_registration_fees?: number | string;
  [key: string]: unknown;
}

interface HeaderMap {
  key: string;
  label: string;
}

const INVALID_TRANSACTION_STATUSES = new Set(['failed', 'reversed', 'cancelled', 'canceled', 'voided', 'error']);

const normalizeType = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase();

const isCountableTransaction = (tx: Transaction) => !INVALID_TRANSACTION_STATUSES.has(normalizeStatus(tx.status));
const isContributionTransaction = (tx: Transaction) => {
  const type = normalizeType(tx.transaction_type);
  return type === 'contribution' || type === 'contribution_refund';
};
const isPositiveContribution = (tx: Transaction) => normalizeType(tx.transaction_type) === 'contribution';
const getContributionSignedAmount = (tx: Transaction) => {
  const amount = Math.abs(Number(tx.amount || 0));
  return normalizeType(tx.transaction_type) === 'contribution_refund' ? -amount : amount;
};

const ITEMS_PER_PAGE = 20;

const getPageNumbers = (currentPage: number, totalPages: number) => {
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(start + 4, totalPages);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
};

const contributionHeaders: HeaderMap[] = [
  { key: 'id', label: 'Transaction ID' },
  { key: 'transaction_type', label: 'Type' },
  { key: 'amount', label: 'Amount (KES)' },
  { key: 'mpesa_reference', label: 'M-Pesa Ref' },
  { key: 'description', label: 'Description' },
  { key: 'created_at', label: 'Date' },
];

const defaulterHeaders: HeaderMap[] = [
  { key: 'memberNumber', label: 'Member #' },
  { key: 'name', label: 'Name' },
  { key: 'walletBalance', label: 'Balance (KES)' },
  { key: 'phoneNumber', label: 'Phone' },
  { key: 'residence', label: 'Residence' },
];

const memberHeaders: HeaderMap[] = [
  { key: 'memberNumber', label: 'Member #' },
  { key: 'name', label: 'Name' },
  { key: 'walletBalance', label: 'Balance' },
  { key: 'totalContributions', label: 'Total Contributed (KES)' },
  { key: 'transactionCount', label: 'Transactions' },
  { key: 'lastContributionDate', label: 'Last Contribution' },
  { key: 'residence', label: 'Residence' },
];

const transactionHeaders: HeaderMap[] = [
  { key: 'id', label: 'Transaction ID' },
  { key: 'created_at', label: 'Date' },
  { key: 'memberNumber', label: 'Member #' },
  { key: 'memberName', label: 'Member Name' },
  { key: 'transaction_type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'amount', label: 'Amount (KES)' },
  { key: 'mpesa_reference', label: 'M-Pesa Ref' },
  { key: 'description', label: 'Description' },
];

const Reports = () => {
  const navigate = useNavigate();
  const { toast: showToast } = useToast();
  const [activeTab, setActiveTab] = useState('contributions');
  const [locationFilter, setLocationFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [dateRange, setDateRange] = useState<ReportDateRange>({
    startDate: subMonths(new Date(), 1),
    endDate: new Date(),
    preset: 'month'
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [transactionSearchTerm, setTransactionSearchTerm] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [transactionStatusFilter, setTransactionStatusFilter] = useState('all');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [members, setMembers] = useState<Member[]>(() => persistentCache.get<Member[]>('reports-members') || []);
  const [cases, setCases] = useState<Case[]>(() => persistentCache.get<Case[]>('reports-cases') || []);
  const [transactions, setTransactions] = useState<Transaction[]>(() => persistentCache.get<Transaction[]>('reports-tx') || []);
  const [summary, setSummary] = useState<ReportSummary | null>(() => persistentCache.get<ReportSummary>('reports-summary') || null);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'members') {
      setSearchTerm('');
    }
    if (activeTab !== 'transactions') {
      setTransactionSearchTerm('');
      setTransactionTypeFilter('all');
      setTransactionStatusFilter('all');
    }
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [transactionSearchTerm, transactionTypeFilter, transactionStatusFilter]);

  useEffect(() => {
    setSortColumn(null);
    setSortDirection('asc');
  }, [activeTab]);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
      setLoading(true);
    } else if (!persistentCache.has('reports-members')) {
      setLoading(true);
    }

    try {
      const [summaryRes, membersRes, casesRes, txRes] = await Promise.all([
        (supabase.rpc as any)('get_dashboard_summary'),
        supabase.from('members').select('*'),
        supabase.from('cases').select('*'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
      ]);

      if (summaryRes.data) {
        const s = summaryRes.data[0] || summaryRes.data;
        setSummary(s);
        persistentCache.set('reports-summary', s, 10 * 60 * 1000);
      }

      const mappedMembers: Member[] = (membersRes.data || []).map((m: any) => ({
        ...m,
        id: m.id,
        memberNumber: m.member_number,
        name: m.name,
        gender: m.gender as Gender,
        dateOfBirth: m.date_of_birth ? new Date(m.date_of_birth) : new Date(),
        nationalIdNumber: m.national_id_number || '',
        phoneNumber: m.phone_number || '',
        emailAddress: m.email_address || '',
        residence: m.residence || '',
        registrationDate: m.registration_date ? new Date(m.registration_date) : new Date(),
        walletBalance: Number(m.wallet_balance) || 0,
        isActive: m.is_active,
        dependants: []
      }));
      setMembers(mappedMembers);
      persistentCache.set('reports-members', mappedMembers, 10 * 60 * 1000);

      const mappedCases: Case[] = (casesRes.data || []).map((c: any) => ({
        ...c,
        id: c.id,
        caseNumber: c.case_number,
        affectedMemberId: c.affected_member_id,
        caseType: c.case_type as CaseType,
        contributionPerMember: Number(c.contribution_per_member) || 0,
        startDate: c.start_date ? new Date(c.start_date) : new Date(),
        endDate: c.end_date ? new Date(c.end_date) : new Date(),
        isActive: c.is_active,
        isFinalized: c.is_finalized,
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
      }));
      setCases(mappedCases);
      persistentCache.set('reports-cases', mappedCases, 10 * 60 * 1000);

      const txs: Transaction[] = txRes.data || [];
      setTransactions(txs);
      persistentCache.set('reports-tx', txs, 10 * 60 * 1000);

    } catch (error) {
      console.error('Error fetching data:', error);
      showToast({
        title: 'Error',
        description: 'Failed to fetch report data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = new Date(tx.created_at);
      return txDate >= dateRange.startDate && txDate <= endOfDay(dateRange.endDate);
    });
  }, [transactions, dateRange]);

  const filteredMembers = useMemo(() => {
    return members.filter(m => locationFilter === 'all' || (m.residence || '').toLowerCase() === locationFilter.toLowerCase());
  }, [members, locationFilter]);

  const defaulters = useMemo(() => {
    return members.filter(m => m.walletBalance < 0 && (locationFilter === 'all' || (m.residence || '').toLowerCase() === locationFilter.toLowerCase()));
  }, [members, locationFilter]);

  const uniqueLocations = useMemo(() => {
    return [...new Set(members.map(m => m.residence).filter(Boolean))].sort();
  }, [members]);

  const stats = useMemo(() => ({
    totalMembers: summary?.total_members || members.length,
    activeCases: summary?.active_cases || cases.filter(c => c.isActive).length,
    totalContributions: Number(summary?.total_contributions) || 0,
    totalRegistrationFees: Number(summary?.total_registration_fees) || 0,
  }), [summary, members.length, cases]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, { memberNumber: string; name: string; residence: string }>();
    members.forEach((member) => {
      map.set(member.id, {
        memberNumber: member.memberNumber || '',
        name: member.name || '',
        residence: member.residence || '',
      });
    });
    return map;
  }, [members]);

  const contributionTrendData: MonthlyContribution[] = useMemo(() => {
    const grouped = new Map<string, { month: string; monthKey: number; amount: number; count: number }>();

    filteredTransactions
      .filter((tx) => isCountableTransaction(tx) && isContributionTransaction(tx))
      .forEach((tx) => {
        const txDate = new Date(tx.created_at);
        const monthKey = txDate.getFullYear() * 100 + (txDate.getMonth() + 1);
        const key = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
        const existing = grouped.get(key) || {
          month: format(txDate, 'MMM yyyy'),
          monthKey,
          amount: 0,
          count: 0,
        };

        existing.amount += getContributionSignedAmount(tx);
        existing.count += 1;
        grouped.set(key, existing);
      });

    return Array.from(grouped.values())
      .sort((a, b) => a.monthKey - b.monthKey)
      .map(({ month, amount, count }) => ({ month, amount, count }));
  }, [filteredTransactions]);

  const genderDistribution: MemberDemographic[] = useMemo(() => {
    const counts: Record<string, number> = { male: 0, female: 0 };
    members.forEach(m => {
      if (m.gender) counts[m.gender] = (counts[m.gender] || 0) + 1;
    });
    return [
      { label: 'Male', value: counts.male, color: '#3b82f6' },
      { label: 'Female', value: counts.female, color: '#ec4899' }
    ].filter(d => d.value > 0);
  }, [members]);

  const residenceDistribution: MemberDemographic[] = useMemo(() => {
    const counts: Record<string, number> = {};
    members.forEach(m => {
      if (m.residence) counts[m.residence] = (counts[m.residence] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value, color: '#8b5cf6' }))
      .sort((a, b) => b.value - a.value);
  }, [members]);

  const statusDistribution: MemberDemographic[] = useMemo(() => {
    const counts: Record<string, number> = {};
    members.forEach(m => {
      const status = m.isActive ? 'Active' : 'Inactive';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ 
        label, 
        value, 
        color: label === 'Active' ? '#10b981' : '#6b7280' 
      }))
      .sort((a, b) => b.value - a.value);
  }, [members]);

  const defaulterByLocation: DefaulterByLocation[] = useMemo(() => {
    const grouped: Record<string, DefaulterByLocation> = {};
    defaulters.forEach(d => {
      const residence = d.residence || 'Unknown';
      if (!grouped[residence]) {
        grouped[residence] = { residence, count: 0, totalAmount: 0 };
      }
      grouped[residence].count += 1;
      grouped[residence].totalAmount += Math.abs(d.walletBalance);
    });
    return Object.values(grouped);
  }, [defaulters]);

  const searchAndFilterData = useCallback((data: Record<string, unknown>[]) => {
    if (!searchTerm) return data;
    const search = searchTerm.toLowerCase();
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(search)
      )
    );
  }, [searchTerm]);

  const sortData = useCallback((data: Record<string, unknown>[]) => {
    if (!sortColumn) return data;

    const compareMemberNumber = (a: unknown, b: unknown) => {
      const aText = String(a || '');
      const bText = String(b || '');
      const aDigits = Number((aText.match(/\d+/)?.[0] || 'NaN'));
      const bDigits = Number((bText.match(/\d+/)?.[0] || 'NaN'));
      if (!Number.isNaN(aDigits) && !Number.isNaN(bDigits) && aDigits !== bDigits) {
        return aDigits - bDigits;
      }
      return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
    };

    const compareMaybeDate = (a: unknown, b: unknown) => {
      const aTime = new Date(String(a || '')).getTime();
      const bTime = new Date(String(b || '')).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return aTime - bTime;
    };

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let result = 0;
      if (sortColumn === 'memberNumber') {
        result = compareMemberNumber(aVal, bVal);
      } else if (sortColumn === 'created_at' || sortColumn === 'lastContributionDate') {
        result = compareMaybeDate(aVal, bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        result = aVal - bVal;
      } else {
        result = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
      }

      if (result < 0) return sortDirection === 'asc' ? -1 : 1;
      if (result > 0) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortColumn, sortDirection]);

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const contributionsData = useMemo(() => {
    return filteredTransactions
      .filter((tx) => isCountableTransaction(tx) && isContributionTransaction(tx))
      .map((tx) => ({
        ...tx,
        amount: getContributionSignedAmount(tx),
      }));
  }, [filteredTransactions]);

  const contributionAnalytics = useMemo(() => {
    const totalAmount = contributionsData.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const count = contributionsData.length;
    const uniqueContributors = new Set(
      contributionsData.map((tx) => tx.member_id).filter(Boolean) as string[]
    ).size;

    const rangeMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const previousRangeEnd = new Date(dateRange.startDate.getTime() - 1);
    const previousRangeStart = new Date(previousRangeEnd.getTime() - rangeMs);
    const previousTotal = transactions
      .filter((tx) => {
        if (!isCountableTransaction(tx) || !isContributionTransaction(tx)) return false;
        const txDate = new Date(tx.created_at);
        return txDate >= previousRangeStart && txDate <= previousRangeEnd;
      })
      .reduce((sum, tx) => sum + getContributionSignedAmount(tx), 0);

    const growthRate = previousTotal > 0 ? ((totalAmount - previousTotal) / previousTotal) * 100 : null;
    return { totalAmount, count, uniqueContributors, growthRate };
  }, [contributionsData, dateRange.endDate, dateRange.startDate, transactions]);

  const transactionTypeOptions = useMemo(() => {
    return Array.from(new Set(transactions.map((tx) => tx.transaction_type).filter(Boolean))).sort();
  }, [transactions]);

  const transactionStatusOptions = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .map((tx) => (typeof tx.status === 'string' ? tx.status.toLowerCase() : ''))
          .filter(Boolean)
      )
    ).sort();
  }, [transactions]);

  const transactionDetailsData = useMemo(() => {
    const search = transactionSearchTerm.trim().toLowerCase();
    return filteredTransactions
      .filter((tx) => transactionTypeFilter === 'all' || tx.transaction_type === transactionTypeFilter)
      .filter((tx) => {
        if (transactionStatusFilter === 'all') return true;
        return String(tx.status || 'unknown').toLowerCase() === transactionStatusFilter;
      })
      .map((tx) => {
        const member = tx.member_id ? memberLookup.get(tx.member_id) : undefined;
        return {
          ...tx,
          memberName: member?.name || '-',
          memberNumber: member?.memberNumber || '-',
          status: String(tx.status || 'unknown'),
          amount: Math.abs(Number(tx.amount || 0)),
        };
      })
      .filter((tx) => {
        if (!search) return true;
        const searchableValues = [
          tx.id,
          tx.memberName,
          tx.memberNumber,
          tx.transaction_type,
          tx.status,
          tx.mpesa_reference || '',
          tx.description || '',
        ];
        return searchableValues.some((value) => String(value).toLowerCase().includes(search));
      });
  }, [filteredTransactions, memberLookup, transactionSearchTerm, transactionTypeFilter, transactionStatusFilter]);

  const transactionsByDateData = useMemo(() => {
    const grouped = new Map<string, { date: string; dateKey: number; amount: number; count: number }>();

    transactionDetailsData.forEach((tx) => {
      const txDate = new Date(String(tx.created_at));
      const dateKey = txDate.getTime();
      const date = format(txDate, 'MMM dd');
      const raw = Number(tx.amount || 0);
      const type = normalizeType(tx.transaction_type);
      const signedAmount = type === 'disbursement' || type === 'contribution_refund' ? -Math.abs(raw) : Math.abs(raw);
      const key = format(txDate, 'yyyy-MM-dd');
      const existing = grouped.get(key) || { date, dateKey, amount: 0, count: 0 };

      existing.amount += signedAmount;
      existing.count += 1;
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.dateKey - b.dateKey)
      .slice(-30)
      .map(({ date, amount, count }) => ({ date, amount, count }));
  }, [transactionDetailsData]);

  const memberReportData = useMemo(() => {
    const summaryByMember = new Map<string, { totalContributions: number; transactionCount: number; lastContributionDate: Date | null }>();
    transactions
      .filter((tx) => isCountableTransaction(tx) && isContributionTransaction(tx))
      .forEach((tx) => {
      if (!tx.member_id) return;
      const existing = summaryByMember.get(tx.member_id) || {
        totalContributions: 0,
        transactionCount: 0,
        lastContributionDate: null,
      };
      const txDate = new Date(tx.created_at);
      const currentLast = existing.lastContributionDate;
      summaryByMember.set(tx.member_id, {
        totalContributions: existing.totalContributions + getContributionSignedAmount(tx),
        transactionCount: existing.transactionCount + 1,
        lastContributionDate: isPositiveContribution(tx) && (!currentLast || txDate > currentLast) ? txDate : currentLast,
      });
    });

    return filteredMembers.map((member) => {
      const txSummary = summaryByMember.get(member.id);
      return {
        ...member,
        totalContributions: txSummary?.totalContributions || 0,
        transactionCount: txSummary?.transactionCount || 0,
        lastContributionDate: txSummary?.lastContributionDate ? txSummary.lastContributionDate.toISOString() : '',
        lastContributionDateDisplay: txSummary?.lastContributionDate ? format(txSummary.lastContributionDate, 'MMM dd, yyyy') : '-',
      };
    });
  }, [transactions, filteredMembers]);

  const paginatedContributions = useMemo(() => {
    const searched = searchAndFilterData(contributionsData as Record<string, unknown>[]);
    const sorted = sortData(searched);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return {
      data: sorted.slice(start, end),
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE))
    };
  }, [contributionsData, searchAndFilterData, sortData, currentPage]);

  const paginatedDefaulters = useMemo(() => {
    const searched = searchAndFilterData(defaulters as unknown as Record<string, unknown>[]);
    const sorted = sortData(searched);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return {
      data: sorted.slice(start, end),
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE))
    };
  }, [defaulters, searchAndFilterData, sortData, currentPage]);

  const paginatedTransactionDetails = useMemo(() => {
    const searched = searchAndFilterData(transactionDetailsData as Record<string, unknown>[]);
    const sorted = sortData(searched);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return {
      data: sorted.slice(start, end),
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE))
    };
  }, [transactionDetailsData, searchAndFilterData, sortData, currentPage]);

  const paginatedMembers = useMemo(() => {
    const searched = searchAndFilterData(memberReportData as unknown as Record<string, unknown>[]);
    const sorted = sortData(searched);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return {
      data: sorted.slice(start, end),
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE))
    };
  }, [memberReportData, searchAndFilterData, sortData, currentPage]);

  useEffect(() => {
    if (activeTab !== 'members') return;
    setSortColumn((prev) => prev || 'memberNumber');
    setSortDirection((prev) => (sortColumn ? prev : 'asc'));
  }, [activeTab, sortColumn]);

  const handleDateRangeApply = (startDate: Date, endDate: Date, preset?: 'month' | 'quarter' | 'year' | 'custom') => {
    setDateRange({ startDate, endDate, preset });
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    persistentCache.clear();
    fetchAll(true);
  };

  const handleExportXlsx = (baseName: string, rows: Record<string, unknown>[], headers: HeaderMap[]) => {
    if (!rows.length) {
      showToast({
        title: 'No data to export',
        description: 'Adjust filters or date range and try again.',
        variant: 'destructive',
      });
      return;
    }
    exportRowsToXLSX(createReportFilename(baseName, 'xlsx'), rows, headers);
    showToast({ title: 'Export complete', description: 'Excel file downloaded.' });
  };

  const handleExportCsv = (baseName: string, rows: Record<string, unknown>[], headers: HeaderMap[]) => {
    if (!rows.length) {
      showToast({
        title: 'No data to export',
        description: 'Adjust filters or date range and try again.',
        variant: 'destructive',
      });
      return;
    }
    exportRowsToCSV(createReportFilename(baseName, 'csv'), rows, headers);
    showToast({ title: 'Export complete', description: 'CSV file downloaded.' });
  };

  const renderPagination = (totalPages: number) => {
    const pageNumbers = getPageNumbers(currentPage, totalPages);
    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              href="#" 
              onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }}
              className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
          {pageNumbers.map(pageNum => (
            <PaginationItem key={pageNum}>
              <PaginationLink 
                href="#" 
                onClick={(e) => { e.preventDefault(); setCurrentPage(pageNum); }}
                isActive={currentPage === pageNum}
              >
                {pageNum}
              </PaginationLink>
            </PaginationItem>
          ))}
          {totalPages > 5 && currentPage < totalPages - 2 && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationNext 
              href="#" 
              onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
              className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 p-1 md:p-6 min-h-screen bg-gradient-to-br from-background to-secondary/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Card className="shadow-sm border-l-4 border-primary/70 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">
                {loading ? <Skeleton className="h-9 w-20" /> : stats.totalMembers}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-primary/50 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">
                {loading ? <Skeleton className="h-9 w-20" /> : stats.activeCases}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-accent/70 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contributions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">
                {loading ? <Skeleton className="h-9 w-32" /> : `KES ${stats.totalContributions.toLocaleString()}`}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-l-4 border-accent/50 hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Registration Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold">
                {loading ? <Skeleton className="h-9 w-32" /> : `KES ${stats.totalRegistrationFees.toLocaleString()}`}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black mb-1 text-primary tracking-tight">Reports</h1>
            <p className="text-lg text-muted-foreground font-medium">Analytics and exported data</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button 
              variant="outline" 
              className="shadow-sm border-2 font-semibold" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button variant="outline" className="shadow-sm border-2 font-semibold" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <DateRangeFilter 
              onApply={handleDateRangeApply}
              initialStartDate={dateRange.startDate}
              initialEndDate={dateRange.endDate}
            />
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[200px] border-2 font-medium bg-white">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ReportsSubnav />

        <Tabs defaultValue="contributions" className="space-y-8" onValueChange={setActiveTab}>
          <TabsList className="bg-white p-1 border shadow-sm rounded-xl">
            <TabsTrigger value="contributions" className="px-6 py-2 font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg">Contributions</TabsTrigger>
            <TabsTrigger value="transactions" className="px-6 py-2 font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg">Transactions</TabsTrigger>
            <TabsTrigger value="defaulters" className="px-6 py-2 font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg">Defaulters</TabsTrigger>
            <TabsTrigger value="members" className="px-6 py-2 font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg">Member List</TabsTrigger>
          </TabsList>

          <TabsContent value="contributions" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Contributions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">KES {contributionAnalytics.totalAmount.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Contribution Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{contributionAnalytics.count.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Unique Contributors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{contributionAnalytics.uniqueContributors.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Range Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${contributionAnalytics.growthRate != null && contributionAnalytics.growthRate < 0 ? 'text-destructive' : 'text-primary'}`}>
                    {contributionAnalytics.growthRate == null ? 'N/A' : `${contributionAnalytics.growthRate >= 0 ? '+' : ''}${contributionAnalytics.growthRate.toFixed(1)}%`}
                  </div>
                  <p className="text-xs text-muted-foreground">Compared with previous range</p>
                </CardContent>
              </Card>
            </div>

            <ContributionTrendChart 
              data={contributionTrendData}
              title="Contribution Trends"
              description={`Monthly contributions from ${format(dateRange.startDate, 'MMM dd, yyyy')} to ${format(dateRange.endDate, 'MMM dd, yyyy')}`}
            />

            <Card className="shadow-xl border-t-4 border-primary">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
                <div>
                  <CardTitle className="text-2xl font-bold">Contribution History</CardTitle>
                  <CardDescription className="text-base font-medium">Historical member contributions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="border-2 font-bold" 
                    onClick={() => handleExportXlsx('executive_contributions', contributionsData as unknown as Record<string, unknown>[], contributionHeaders)}
                  >
                    <Download className="h-5 w-5 mr-2" /> Export Excel
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="border-2 font-bold" 
                    onClick={() => handleExportCsv('executive_contributions', contributionsData as unknown as Record<string, unknown>[], contributionHeaders)}
                  >
                    <FileText className="h-5 w-5 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 font-bold border-b-2">
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('id')}>
                        Transaction ID {sortColumn === 'id' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('transaction_type')}>
                        Type {sortColumn === 'transaction_type' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('amount')}>
                        Amount (KES) {sortColumn === 'amount' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg">M-Pesa Ref</TableHead>
                      <TableHead className="font-bold text-black text-lg">Description</TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('created_at')}>
                        Date {sortColumn === 'created_at' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={6} className="py-6">
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : paginatedContributions.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedContributions.data.map(tx => (
                        <TableRow key={tx.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-medium text-primary">{String(tx.id).substring(0, 8)}</TableCell>
                          <TableCell className="capitalize">{String(tx.transaction_type || '').replace(/_/g, ' ')}</TableCell>
                          <TableCell className={`font-bold ${Number(tx.amount) < 0 ? 'text-destructive' : 'text-primary'}`}>{Number(tx.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground font-mono">{tx.mpesa_reference || '-'}</TableCell>
                          <TableCell className="max-w-xs truncate font-medium">{tx.description}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(tx.created_at), 'MMM dd, yyyy')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {!loading && renderPagination(paginatedContributions.totalPages)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <Card className="shadow-lg border-t-4 border-primary/70">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Transactions by Date and Amount</CardTitle>
                <CardDescription>Daily net amount and volume (last 30 days in current filters)</CardDescription>
              </CardHeader>
              <CardContent>
                {transactionsByDateData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transaction data available for chart</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={transactionsByDateData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `KES ${Number(value).toLocaleString()}`} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'count') return [Number(value).toLocaleString(), 'Transactions'];
                          return [`KES ${Number(value).toLocaleString()}`, 'Net Amount'];
                        }}
                      />
                      <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} name="amount" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-xl border-t-4 border-primary">
              <CardHeader className="space-y-4 border-b pb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-bold">Transaction Details</CardTitle>
                    <CardDescription className="text-base font-medium">Full transaction report with filters and export</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      className="border-2 font-bold"
                      onClick={() => handleExportXlsx('executive_transactions', transactionDetailsData as unknown as Record<string, unknown>[], transactionHeaders)}
                    >
                      <Download className="h-5 w-5 mr-2" /> Export Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="border-2 font-bold"
                      onClick={() => handleExportCsv('executive_transactions', transactionDetailsData as unknown as Record<string, unknown>[], transactionHeaders)}
                    >
                      <FileText className="h-5 w-5 mr-2" /> Export CSV
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by member, transaction, reference..."
                      className="pl-10"
                      value={transactionSearchTerm}
                      onChange={(e) => setTransactionSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                    <SelectTrigger className="border-2 font-medium">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {transactionTypeOptions.map((option) => (
                        <SelectItem key={option} value={option} className="capitalize">
                          {option.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={transactionStatusFilter} onValueChange={setTransactionStatusFilter}>
                    <SelectTrigger className="border-2 font-medium">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      {transactionStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2">
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('id')}>Transaction ID</TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('created_at')}>Date</TableHead>
                      <TableHead className="font-bold text-foreground text-lg">Member</TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('transaction_type')}>Type</TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('status')}>Status</TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('amount')}>Amount (KES)</TableHead>
                      <TableHead className="font-bold text-foreground text-lg">Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : paginatedTransactionDetails.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No transaction data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedTransactionDetails.data.map((tx) => (
                        <TableRow key={String(tx.id)} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-medium text-primary">{String(tx.id).substring(0, 8)}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(String(tx.created_at)), 'MMM dd, yyyy HH:mm')}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{String(tx.memberName || '-')}</span>
                              <span className="text-xs text-muted-foreground">{String(tx.memberNumber || '-')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="capitalize">{String(tx.transaction_type || '').replace(/_/g, ' ')}</TableCell>
                          <TableCell>
                            <Badge variant={String(tx.status).toLowerCase() === 'success' ? 'default' : 'secondary'}>
                              {String(tx.status || 'unknown')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{Number(tx.amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{String(tx.mpesa_reference || '-')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {!loading && renderPagination(paginatedTransactionDetails.totalPages)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="defaulters" className="space-y-6">
            <DefaulterAnalyticsChart 
              byLocation={defaulterByLocation}
              totalDefaulters={defaulters.length}
              totalAmountOwed={defaulters.reduce((sum, d) => sum + Math.abs(d.walletBalance), 0)}
              title="Defaulters Analytics"
              description="Analysis of members with negative wallet balances"
            />

            <Card className="shadow-xl border-t-4 border-primary">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
                <div>
                  <CardTitle className="text-2xl font-bold flex items-center text-foreground">
                    Defaulters List
                    <span className="ml-3 px-3 py-1 bg-muted text-foreground rounded-full text-sm font-black">{defaulters.length} Total</span>
                  </CardTitle>
                  <CardDescription className="text-base font-medium">Members with negative wallet balances</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    size="lg" 
                    className="font-black shadow-lg"
                    onClick={() => handleExportXlsx('executive_defaulters', defaulters as unknown as Record<string, unknown>[], defaulterHeaders)}
                  >
                    <Download className="h-5 w-5 mr-2" /> Download Excel
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="border-2 font-bold" 
                    onClick={() => handleExportCsv('executive_defaulters', defaulters as unknown as Record<string, unknown>[], defaulterHeaders)}
                  >
                    <FileText className="h-5 w-5 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2">
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('memberNumber')}>
                        Member # {sortColumn === 'memberNumber' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('name')}>
                        Name {sortColumn === 'name' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('walletBalance')}>
                        Balance (KES) {sortColumn === 'walletBalance' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-foreground text-lg">Phone</TableHead>
                      <TableHead className="font-bold text-foreground text-lg cursor-pointer" onClick={() => handleSort('residence')}>
                        Residence {sortColumn === 'residence' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDefaulters.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedDefaulters.data.map(m => (
                        <TableRow key={String(m.id)} className="hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => navigate(`/members/${String(m.id)}`)}>
                          <TableCell className="font-black text-primary">{String(m.memberNumber || '')}</TableCell>
                          <TableCell className="font-bold text-gray-900">{String(m.name || '')}</TableCell>
                          <TableCell className="text-destructive font-extrabold text-lg">{Number(m.walletBalance || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground font-medium">{String(m.phoneNumber || '')}</TableCell>
                          <TableCell className="font-medium text-gray-700">{String(m.residence || '')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {renderPagination(paginatedDefaulters.totalPages)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-6">
            <MemberDemographicsChart 
              genderDistribution={genderDistribution}
              residenceDistribution={residenceDistribution}
              statusDistribution={statusDistribution}
              title="Member Demographics"
              description="Distribution of members by various attributes"
            />

            <Card className="shadow-xl border-t-4 border-black">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-6">
                <CardTitle className="text-2xl font-bold">General Member List</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-[250px]"
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    className="border-2 font-bold" 
                    onClick={() => handleExportXlsx('executive_members', memberReportData as unknown as Record<string, unknown>[], memberHeaders)}
                  >
                    <Download className="h-5 w-5 mr-2" /> Export Excel
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-2 font-bold" 
                    onClick={() => handleExportCsv('executive_members', memberReportData as unknown as Record<string, unknown>[], memberHeaders)}
                  >
                    <FileText className="h-5 w-5 mr-2" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('memberNumber')}>
                        Member # {sortColumn === 'memberNumber' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('name')}>
                        Name {sortColumn === 'name' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('walletBalance')}>
                        Balance {sortColumn === 'walletBalance' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg">Status</TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('totalContributions')}>
                        Total Contributed {sortColumn === 'totalContributions' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('transactionCount')}>
                        Transactions {sortColumn === 'transactionCount' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                      <TableHead className="font-bold text-black text-lg">Last Contribution</TableHead>
                      <TableHead className="font-bold text-black text-lg cursor-pointer" onClick={() => handleSort('residence')}>
                        Residence {sortColumn === 'residence' && (sortDirection === 'asc' ? <SortAsc className="inline h-4 w-4" /> : <SortDesc className="inline h-4 w-4" />)}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMembers.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedMembers.data.map(m => (
                        <TableRow key={String(m.id)} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-bold">{String(m.memberNumber || '')}</TableCell>
                          <TableCell className="font-medium">{String(m.name || '')}</TableCell>
                          <TableCell className={Number(m.walletBalance || 0) < 0 ? 'text-destructive font-bold' : 'text-primary font-bold'}>
                            {Number(m.walletBalance || 0).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={m.isActive ? 'default' : 'secondary'} className={m.isActive ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'bg-muted text-muted-foreground hover:bg-muted'}>
                              {m.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">{Number(m.totalContributions || 0).toLocaleString()}</TableCell>
                          <TableCell>{Number(m.transactionCount || 0).toLocaleString()}</TableCell>
                          <TableCell>{String(m.lastContributionDateDisplay || '-')}</TableCell>
                          <TableCell>{String(m.residence || '')}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {renderPagination(paginatedMembers.totalPages)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
