import { useState, useEffect, useMemo, useCallback } from 'react'
import { Download, TrendingUp, DollarSign, Users, FileText, Search, FileSpreadsheet } from 'lucide-react'
import DashboardLayout from '@/layouts/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { supabase } from '@/integrations/supabase/client'
import {
  CASE_FUNDING_SUMMARY_COLUMNS,
  MEMBER_TRANSACTION_SUMMARY_COLUMNS,
  MONTHLY_CONTRIBUTIONS_SUMMARY_COLUMNS,
} from '@/lib/supabaseSelectColumns'
import { toast } from '@/components/ui/use-toast'
import ReportsSubnav from '@/components/reports/ReportsSubnav'
import { createReportFilename, exportRowsToCSV } from '@/lib/reportExport'
import { loadJsPdfWithAutotable, loadXlsx } from '@/lib/reportExportLibs'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'

interface MonthlySummary {
  month: string
  transaction_type: string
  transaction_count: number
  total_amount: number
  unique_members: number
}

interface CaseFunding {
  case_id: string
  case_number: string
  case_type: string
  contribution_per_member?: number
  expected_amount: number
  actual_amount: number
  variance: number
  is_active: boolean
  is_finalized: boolean
}

interface MemberContribution {
  member_id: string
  member_number: string
  name: string
  contributions_count: number
  total_contributions: number
  disbursements_count: number
  total_disbursements: number
  wallet_balance: number
}

interface ContributionTransaction {
  id: string
  created_at: string
  transaction_type: string
  amount: number
  status: string | null
  mpesa_reference: string | null
  description: string | null
  member_name: string
  member_number: string
  case_id: string | null
  case_number: string | null
}

interface DisciplineCollectionTransaction {
  id: string
  created_at: string
  transaction_type: 'arrears' | 'penalty'
  amount: number
  status: string | null
}

interface EligibleCaseOption {
  id: string
  case_number: string
  case_type: string
  contribution_per_member: number
  is_active: boolean
  is_finalized: boolean
}

interface DashboardSummary {
  total_contributions?: number
  active_members?: number
  probation_members?: number
  active_cases?: number
  defaulters_count?: number
  [key: string]: unknown
}

const MONTHS = [
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
]

const ITEMS_PER_PAGE = 15

const formatCellValue = (col: string, value: unknown): string => {
  if (value === null || value === undefined) return ''
  const numericCols = [
    'total_amount',
    'expected_amount',
    'actual_amount',
    'variance',
    'wallet_balance',
    'total_contributions',
    'total_disbursements',
    'gross_paid',
    'total_refunded',
    'net_paid',
    'outstanding_amount',
    'expected_total',
    'net_paid_total',
    'outstanding_total',
  ]
  if (typeof value === 'number') {
    if (numericCols.includes(col)) return `KES ${value.toLocaleString()}`
    if (col.includes('percent')) return `${value.toLocaleString()}%`
    return value.toString()
  }
  if (col === 'month') return value ? format(new Date(value as string), 'MMM yyyy') : ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

const safeFormatMonth = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return format(date, 'MMMM yyyy')
}

const getMonthDateRange = (selectedMonth: string, selectedYear: string) => {
  if (selectedMonth === 'all' || selectedYear === 'all') return null
  const year = Number(selectedYear)
  const month = Number(selectedMonth)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0))
  return { start: start.toISOString(), end: end.toISOString() }
}

const FiscalReports = () => {
  const [activeTab, setActiveTab] = useState('contributions')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedYear, setSelectedYear] = useState('all')
  const [loading, setLoading] = useState(true)
  const [casesLoading, setCasesLoading] = useState(false)
  const [contributionTxLoading, setContributionTxLoading] = useState(false)

  const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([])
  const [caseData, setCaseData] = useState<CaseFunding[]>([])
  const [allCaseOptions, setAllCaseOptions] = useState<EligibleCaseOption[]>([])
  const [memberContributions, setMemberContributions] = useState<MemberContribution[]>([])
  const [contributionTransactions, setContributionTransactions] = useState<ContributionTransaction[]>([])
  const [disciplineCollectionTransactions, setDisciplineCollectionTransactions] = useState<DisciplineCollectionTransaction[]>([])
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [contributionTxTotalCount, setContributionTxTotalCount] = useState(0)
  const [caseFundingTotalCount, setCaseFundingTotalCount] = useState(0)

  const [contributionsSearch, setContributionsSearch] = useState('')
  const [contributionTransactionsSearch, setContributionTransactionsSearch] = useState('')
  const [contributionTypeFilter, setContributionTypeFilter] = useState<'all' | 'contribution' | 'contribution_refund'>('all')
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [caseFilterSearch, setCaseFilterSearch] = useState('')
  const [casesSearch, setCasesSearch] = useState('')
  const [caseFundingStatusFilter, setCaseFundingStatusFilter] = useState<'all' | 'active' | 'finalized' | 'closed'>('all')
  const [caseFundingTypeFilter, setCaseFundingTypeFilter] = useState('all')
  const [membersSearch, setMembersSearch] = useState('')
  const [contributionsPage, setContributionsPage] = useState(1)
  const [contributionTransactionsPage, setContributionTransactionsPage] = useState(1)
  const [casesPage, setCasesPage] = useState(1)
  const [membersPage, setMembersPage] = useState(1)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [
          { data: monthly },
          { data: memberTx },
          { data: disciplineRows },
          { data: dashSummary },
          { data: caseOptions },
        ] = await Promise.all([
          supabase.from('monthly_contributions_summary').select(MONTHLY_CONTRIBUTIONS_SUMMARY_COLUMNS).order('month', { ascending: false }),
          supabase.from('member_transaction_summary').select(MEMBER_TRANSACTION_SUMMARY_COLUMNS).order('member_number'),
          supabase
            .from('transactions')
            .select('id, created_at, transaction_type, amount, status')
            .in('transaction_type', ['arrears', 'penalty'])
            .in('status', ['success', 'completed'])
            .order('created_at', { ascending: false })
            .limit(5000),
          supabase.rpc('get_enhanced_dashboard_summary'),
          supabase
            .from('cases')
            .select('id, case_number, case_type, contribution_per_member, is_active, is_finalized')
            .order('case_number', { ascending: false })
            .range(0, 49999),
        ])

        setMonthlyData((monthly || []) as MonthlySummary[])
        setMemberContributions((memberTx || []) as MemberContribution[])
        setSummary(((dashSummary as any)?.[0] || {}) as DashboardSummary)
        setAllCaseOptions(
          ((caseOptions || []) as any[]).map((c) => ({
            id: String(c.id),
            case_number: String(c.case_number || ''),
            case_type: String(c.case_type || ''),
            contribution_per_member: Number(c.contribution_per_member || 0),
            is_active: Boolean(c.is_active),
            is_finalized: Boolean(c.is_finalized),
          }))
        )
        setDisciplineCollectionTransactions(
          ((disciplineRows || []) as any[]).map((tx) => ({
            id: tx.id,
            created_at: tx.created_at,
            transaction_type: tx.transaction_type,
            amount: Number(tx.amount || 0),
            status: tx.status || null,
          }))
        )
      } catch (error: any) {
        console.error('Fiscal reports load error:', error)
        toast({ title: 'Error', description: 'Failed to load fiscal reports.', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    const fetchCaseFundingPage = async () => {
      setCasesLoading(true)
      try {
        let query = supabase
          .from('case_funding_summary')
          .select(CASE_FUNDING_SUMMARY_COLUMNS, { count: 'exact' })
          .order('case_number', { ascending: false })

        const term = casesSearch.trim()
        if (term) {
          query = query.or(`case_number.ilike.%${term}%,case_type.ilike.%${term}%`)
        }

        if (caseFundingStatusFilter === 'active') query = query.eq('is_active', true)
        if (caseFundingStatusFilter === 'finalized') query = query.eq('is_finalized', true)
        if (caseFundingStatusFilter === 'closed') query = query.eq('is_active', false).eq('is_finalized', false)
        if (caseFundingTypeFilter !== 'all') query = query.eq('case_type', caseFundingTypeFilter)

        const from = (casesPage - 1) * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1
        const { data, error, count } = await query.range(from, to)
        if (error) throw error
        setCaseData((data || []) as CaseFunding[])
        setCaseFundingTotalCount(Number(count || 0))
      } catch (error: any) {
        console.error('Case funding fetch error:', error)
        toast({ title: 'Error', description: 'Failed to load case funding report.', variant: 'destructive' })
      } finally {
        setCasesLoading(false)
      }
    }

    fetchCaseFundingPage()
  }, [casesPage, casesSearch, caseFundingStatusFilter, caseFundingTypeFilter])

  useEffect(() => {
    const fetchContributionTransactionsPage = async () => {
      setContributionTxLoading(true)
      try {
        let query = supabase
          .from('transactions')
          .select('id, created_at, transaction_type, amount, status, mpesa_reference, description, case_id, members(member_number, name), cases(case_number)', { count: 'exact' })
          .order('created_at', { ascending: false })

        if (contributionTypeFilter === 'all') {
          query = query.in('transaction_type', ['contribution', 'contribution_refund'])
        } else {
          query = query.eq('transaction_type', contributionTypeFilter)
        }

        const dateRange = getMonthDateRange(selectedMonth, selectedYear)
        if (dateRange) {
          query = query.gte('created_at', dateRange.start).lt('created_at', dateRange.end)
        } else if (selectedYear !== 'all') {
          const year = Number(selectedYear)
          if (Number.isInteger(year)) {
            const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString()
            const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString()
            query = query.gte('created_at', start).lt('created_at', end)
          }
        }

        if (selectedCaseIds.length > 0) query = query.in('case_id', selectedCaseIds)

        const term = contributionTransactionsSearch.trim()
        if (term) {
          query = query.or(`mpesa_reference.ilike.%${term}%,description.ilike.%${term}%,members.name.ilike.%${term}%,members.member_number.ilike.%${term}%,cases.case_number.ilike.%${term}%`)
        }

        const from = (contributionTransactionsPage - 1) * ITEMS_PER_PAGE
        const to = from + ITEMS_PER_PAGE - 1
        const { data: txRows, error, count } = await query.range(from, to)
        if (error) throw error

        setContributionTransactions(
          ((txRows || []) as any[]).map((tx) => {
            const membersData = Array.isArray(tx.members) ? tx.members[0] : tx.members
            return {
              id: tx.id,
              created_at: tx.created_at,
              transaction_type: tx.transaction_type,
              amount: Number(tx.amount || 0),
              status: tx.status || null,
              mpesa_reference: tx.mpesa_reference || null,
              description: tx.description || null,
              member_name: membersData?.name || 'Unknown',
              member_number: membersData?.member_number || '-',
              case_id: tx.case_id || null,
              case_number: (Array.isArray(tx.cases) ? tx.cases[0] : tx.cases)?.case_number || null,
            } as ContributionTransaction
          })
        )
        setContributionTxTotalCount(Number(count || 0))
      } catch (error: any) {
        console.error('Contribution transactions fetch error:', error)
        toast({ title: 'Error', description: 'Failed to load contribution transactions.', variant: 'destructive' })
      } finally {
        setContributionTxLoading(false)
      }
    }

    fetchContributionTransactionsPage()
  }, [contributionTransactionsPage, selectedMonth, selectedYear, contributionTypeFilter, selectedCaseIds, contributionTransactionsSearch])

  const exportToPDF = useCallback(async (title: string, data: any[], columns: string[]) => {
    try {
      if (!data.length) {
        toast({ title: 'No data to export', description: 'Adjust filters and try again.', variant: 'destructive' })
        return
      }
      const jsPDF = await loadJsPdfWithAutotable()
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text(title, 14, 20)
      doc.setFontSize(10)
      doc.text(`Generated on: ${format(new Date(), 'dd MMMM yyyy')}`, 14, 28)

      const tableData = data.map((row: any) => columns.map((col: string) => formatCellValue(col, row[col])))
      ;(doc as any).autoTable({
        head: [columns.map((col: string) => col.replace(/_/g, ' ').toUpperCase())],
        body: tableData,
        startY: 35,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] },
        margin: { top: 20, left: 14, right: 14 },
      })

      doc.save(createReportFilename(title.toLowerCase().replace(/\s+/g, '_'), 'pdf'))
      toast({ title: 'PDF exported', description: `${title} report downloaded successfully.` })
    } catch {
      toast({ title: 'Export failed', description: 'There was an error generating the PDF.', variant: 'destructive' })
    }
  }, [])

  const exportToExcel = useCallback(async (title: string, data: any[]) => {
    try {
      if (!data.length) {
        toast({ title: 'No data to export', description: 'Adjust filters and try again.', variant: 'destructive' })
        return
      }
      const XLSX = await loadXlsx()
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, title)
      XLSX.writeFile(wb, createReportFilename(title.toLowerCase().replace(/\s+/g, '_'), 'xlsx'))
      toast({ title: 'Excel exported', description: `${title} report downloaded successfully.` })
    } catch {
      toast({ title: 'Export failed', description: 'There was an error generating the Excel file.', variant: 'destructive' })
    }
  }, [])

  const exportToCSV = useCallback((title: string, data: any[]) => {
    try {
      if (!data.length) {
        toast({ title: 'No data to export', description: 'Adjust filters and try again.', variant: 'destructive' })
        return
      }
      const columns = Object.keys(data[0]).map((col) => ({ key: col, label: col.replace(/_/g, ' ').toUpperCase() }))
      const normalized = data.map((row) => {
        const mapped: Record<string, unknown> = {}
        Object.keys(row).forEach((col) => {
          mapped[col] = formatCellValue(col, row[col])
        })
        return mapped
      })
      exportRowsToCSV(createReportFilename(title.toLowerCase().replace(/\s+/g, '_'), 'csv'), normalized, columns)
      toast({ title: 'CSV exported', description: `${title} report downloaded successfully.` })
    } catch {
      toast({ title: 'Export failed', description: 'There was an error generating the CSV.', variant: 'destructive' })
    }
  }, [])

  const filteredMonthlyData = useMemo(() => {
    return monthlyData.filter((item) => {
      const date = new Date(item.month)
      const monthMatch = selectedMonth === 'all' || date.getMonth() === parseInt(selectedMonth)
      const yearMatch = selectedYear === 'all' || date.getFullYear().toString() === selectedYear
      const searchMatch = contributionsSearch === '' || String(item.transaction_type || '').toLowerCase().includes(contributionsSearch.toLowerCase())
      return monthMatch && yearMatch && searchMatch
    })
  }, [monthlyData, selectedMonth, selectedYear, contributionsSearch])

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    monthlyData.forEach((item) => {
      const d = new Date(item.month)
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear())
    })
    contributionTransactions.forEach((item) => {
      const d = new Date(item.created_at)
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear())
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [monthlyData, contributionTransactions])

  const caseFilterOptions = useMemo(() => {
    return allCaseOptions
      .map((c) => ({
        id: String(c.id),
        label: `#${c.case_number} - ${String(c.case_type || '').toUpperCase()}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allCaseOptions])

  const caseTypeOptions = useMemo(() => {
    const set = new Set<string>()
    allCaseOptions.forEach((c) => {
      const value = String(c.case_type || '').trim()
      if (value) set.add(value)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allCaseOptions])

  const filteredCaseFilterOptions = useMemo(() => {
    const term = caseFilterSearch.trim().toLowerCase()
    if (!term) return caseFilterOptions
    return caseFilterOptions.filter((c) => c.label.toLowerCase().includes(term))
  }, [caseFilterOptions, caseFilterSearch])

  const filteredDisciplineCollections = useMemo(() => {
    const grouped = new Map<string, { transaction_type: 'arrears' | 'penalty'; transaction_count: number; total_amount: number }>()

    disciplineCollectionTransactions.forEach((tx) => {
      const date = new Date(tx.created_at)
      const monthMatch = selectedMonth === 'all' || date.getMonth() === Number(selectedMonth)
      const yearMatch = selectedYear === 'all' || date.getFullYear().toString() === selectedYear
      if (!monthMatch || !yearMatch) return

      const key = tx.transaction_type
      const existing = grouped.get(key) || { transaction_type: tx.transaction_type, transaction_count: 0, total_amount: 0 }
      existing.transaction_count += 1
      existing.total_amount += Math.abs(Number(tx.amount || 0))
      grouped.set(key, existing)
    })

    return Array.from(grouped.values()).sort((a, b) => a.transaction_type.localeCompare(b.transaction_type))
  }, [disciplineCollectionTransactions, selectedMonth, selectedYear])

  const filteredMemberData = useMemo(() => {
    return memberContributions.filter((item) => {
      const term = membersSearch.toLowerCase()
      return term === '' || String(item.name || '').toLowerCase().includes(term) || String(item.member_number || '').toLowerCase().includes(term)
    })
  }, [memberContributions, membersSearch])

  const paginate = <T,>(arr: T[], page: number) => {
    const start = (page - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    return {
      data: arr.slice(start, end),
      total: arr.length,
      totalPages: Math.max(1, Math.ceil(arr.length / ITEMS_PER_PAGE)),
      start,
      end,
    }
  }

  const paginatedMonthlyData = useMemo(() => paginate(filteredMonthlyData, contributionsPage), [filteredMonthlyData, contributionsPage])
  const caseDataTotalPages = Math.max(1, Math.ceil(caseFundingTotalCount / ITEMS_PER_PAGE))
  const contributionTransactionsTotalPages = Math.max(1, Math.ceil(contributionTxTotalCount / ITEMS_PER_PAGE))
  const paginatedMemberData = useMemo(() => paginate(filteredMemberData, membersPage), [filteredMemberData, membersPage])

  useEffect(() => {
    setContributionsPage(1)
    setContributionTransactionsPage(1)
  }, [selectedMonth, selectedYear, contributionsSearch, contributionTransactionsSearch, contributionTypeFilter, selectedCaseIds])

  useEffect(() => {
    setCasesPage(1)
  }, [casesSearch, caseFundingStatusFilter, caseFundingTypeFilter])

  const renderPagination = (currentPage: number, totalPages: number, onPageChange: (page: number) => void, total: number, start: number, end: number) => {
    if (totalPages <= 1) return null

    return (
      <div className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted-foreground">Showing {total === 0 ? 0 : start + 1}-{Math.min(end, total)} of {total} results</p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => onPageChange(Math.max(1, currentPage - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
            {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink isActive={i + 1 === currentPage} onClick={() => onPageChange(i + 1)}>
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    )
  }

  const renderSkeletonRows = (colSpan: number) => (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: colSpan }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Fiscal Reports</h1>
          <p className="text-muted-foreground">Financial reports and analytics</p>
        </div>

        <ReportsSubnav />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Contributions</CardTitle></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">KES {Number(summary?.total_contributions || 0).toLocaleString()}</div>}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active Members</CardTitle></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{Number(summary?.active_members || 0).toLocaleString()}</div>}<p className="text-xs text-muted-foreground">{Number(summary?.probation_members || 0)} on probation</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active Cases</CardTitle></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{Number(summary?.active_cases || 0).toLocaleString()}</div>}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Defaulters</CardTitle></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold text-destructive">{Number(summary?.defaulters_count || 0).toLocaleString()}</div>}</CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setContributionsPage(1); setCasesPage(1); setMembersPage(1) }} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 p-1 sm:grid-cols-3">
            <TabsTrigger value="contributions" className="min-h-10 whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm">Contributions Analysis</TabsTrigger>
            <TabsTrigger value="cases" className="min-h-10 whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm">Case Funding</TabsTrigger>
            <TabsTrigger value="members" className="min-h-10 whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm">Member Contributions</TabsTrigger>
          </TabsList>

          <TabsContent value="contributions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Monthly Contributions Summary</CardTitle>
                      <CardDescription>Breakdown of contributions by month and type</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => exportToPDF('Monthly Contributions', filteredMonthlyData, ['month', 'transaction_type', 'transaction_count', 'total_amount', 'unique_members'])}><Download className="mr-2 h-4 w-4" />PDF</Button>
                      <Button variant="outline" size="sm" onClick={() => exportToExcel('Monthly Contributions', filteredMonthlyData)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
                      <Button variant="outline" size="sm" onClick={() => exportToCSV('Monthly Contributions', filteredMonthlyData)}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by type..." value={contributionsSearch} onChange={(e) => { setContributionsSearch(e.target.value); setContributionsPage(1) }} className="pl-8" /></div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Year</Badge>
                      <Button variant={selectedYear === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedYear('all')}>All</Button>
                      {availableYears.map((year) => (
                        <Button
                          key={year}
                          variant={selectedYear === String(year) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedYear(String(year))}
                        >
                          {year}
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Month</Badge>
                      <Button variant={selectedMonth === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedMonth('all')}>All</Button>
                      {MONTHS.map((month) => (
                        <Button
                          key={month.value}
                          variant={selectedMonth === month.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedMonth(month.value)}
                        >
                          {month.label.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Unique Members</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {loading ? renderSkeletonRows(5) : paginatedMonthlyData.data.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No data available</TableCell></TableRow>
                      ) : paginatedMonthlyData.data.map((item) => (
                        <TableRow key={`${item.month}-${item.transaction_type}`}>
                          <TableCell>{safeFormatMonth(item.month)}</TableCell>
                          <TableCell className="capitalize">{String(item.transaction_type).replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-right">{Number(item.transaction_count).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">KES {Number(item.total_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{Number(item.unique_members).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {renderPagination(contributionsPage, paginatedMonthlyData.totalPages, setContributionsPage, paginatedMonthlyData.total, paginatedMonthlyData.start, paginatedMonthlyData.end)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Default/Discipline Collections Split</CardTitle>
                    <CardDescription>Arrears and reinstatement penalties for selected period</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportToPDF('Default Discipline Collections', filteredDisciplineCollections, ['transaction_type', 'transaction_count', 'total_amount'])}><Download className="mr-2 h-4 w-4" />PDF</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToExcel('Default Discipline Collections', filteredDisciplineCollections)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV('Default Discipline Collections', filteredDisciplineCollections)}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? renderSkeletonRows(3) : filteredDisciplineCollections.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No arrears/penalty data for selected period</TableCell></TableRow>
                      ) : (
                        filteredDisciplineCollections.map((row) => (
                          <TableRow key={row.transaction_type}>
                            <TableCell className="capitalize">{row.transaction_type.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="text-right">{row.transaction_count.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">KES {row.total_amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Contribution Transactions</CardTitle>
                    <CardDescription>Raw contribution transaction records for the selected period</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={contributionTypeFilter} onValueChange={(value: 'all' | 'contribution' | 'contribution_refund') => setContributionTypeFilter(value)}>
                      <SelectTrigger className="w-full sm:w-[190px]">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Contribution Types</SelectItem>
                        <SelectItem value="contribution">Contribution</SelectItem>
                        <SelectItem value="contribution_refund">Contribution Refund</SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full sm:min-w-[220px] justify-start">
                          {selectedCaseIds.length === 0 ? 'All cases' : `${selectedCaseIds.length} case(s) selected`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[95vw] sm:w-[320px] p-3" align="end">
                        <div className="space-y-3">
                          <Input
                            placeholder="Search cases..."
                            value={caseFilterSearch}
                            onChange={(e) => setCaseFilterSearch(e.target.value)}
                          />
                          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                            {filteredCaseFilterOptions.map((option) => (
                              <label key={option.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={selectedCaseIds.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    setSelectedCaseIds((prev) => {
                                      if (checked) {
                                        return prev.includes(option.id) ? prev : [...prev, option.id]
                                      }
                                      return prev.filter((id) => id !== option.id)
                                    })
                                  }}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                            {filteredCaseFilterOptions.length === 0 && (
                              <p className="text-xs text-muted-foreground py-2">No cases match your search.</p>
                            )}
                          </div>
                          <div className="flex justify-between gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCaseIds([])}
                              disabled={selectedCaseIds.length === 0}
                            >
                              Clear
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCaseIds(caseFilterOptions.map((c) => c.id))}
                              disabled={caseFilterOptions.length === 0 || selectedCaseIds.length === caseFilterOptions.length}
                            >
                              Select all
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToExcel('Case Contribution Transactions', contributionTransactions)}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToCSV('Case Contribution Transactions', contributionTransactions)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      CSV
                    </Button>
                  </div>
                </div>
                <div className="relative max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by member, reference, or description..."
                    value={contributionTransactionsSearch}
                    onChange={(e) => setContributionTransactionsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Case</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading || contributionTxLoading ? renderSkeletonRows(8) : contributionTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No contribution transactions found</TableCell>
                        </TableRow>
                      ) : (
                        contributionTransactions.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                            <TableCell className="font-medium">{item.case_number ? `#${item.case_number}` : '-'}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.member_name}</p>
                                <p className="text-xs text-muted-foreground">{item.member_number}</p>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{item.transaction_type.replace(/_/g, ' ')}</TableCell>
                            <TableCell>
                              <Badge variant={String(item.status || '').toLowerCase() === 'success' ? 'default' : 'secondary'}>
                                {item.status || 'unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{item.mpesa_reference || '-'}</TableCell>
                            <TableCell className="max-w-[240px] truncate">{item.description || '-'}</TableCell>
                            <TableCell className="text-right font-medium">
                              <span className={item.transaction_type === 'contribution_refund' ? 'text-destructive' : 'text-primary'}>
                                {item.transaction_type === 'contribution_refund' ? '-' : '+'}KES {Math.abs(Number(item.amount || 0)).toLocaleString()}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {renderPagination(
                  contributionTransactionsPage,
                  contributionTransactionsTotalPages,
                  setContributionTransactionsPage,
                  contributionTxTotalCount,
                  (contributionTransactionsPage - 1) * ITEMS_PER_PAGE,
                  contributionTransactionsPage * ITEMS_PER_PAGE
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Case Funding Summary</CardTitle>
                    <CardDescription>Progress of fundraising for each case</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportToPDF('Case Funding Report', caseData, ['case_number', 'case_type', 'expected_amount', 'actual_amount', 'variance', 'is_active'])}><Download className="mr-2 h-4 w-4" />PDF</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToExcel('Case Funding Report', caseData)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV('Case Funding Report', caseData)}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="relative max-w-sm flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by case number or type..." value={casesSearch} onChange={(e) => { setCasesSearch(e.target.value); setCasesPage(1) }} className="pl-8" /></div>
                  <Select value={caseFundingStatusFilter} onValueChange={(value: 'all' | 'active' | 'finalized' | 'closed') => setCaseFundingStatusFilter(value)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="finalized">Finalized</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={caseFundingTypeFilter} onValueChange={setCaseFundingTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Case Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Case Types</SelectItem>
                      {caseTypeOptions.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Case Number</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Raised</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {loading || casesLoading ? renderSkeletonRows(6) : caseData.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No cases found</TableCell></TableRow> : caseData.map((item) => (
                        <TableRow key={item.case_id}>
                          <TableCell className="font-medium">{item.case_number}</TableCell>
                          <TableCell className="capitalize">{item.case_type}</TableCell>
                          <TableCell className="text-right">KES {Number(item.expected_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">KES {Number(item.actual_amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right"><span className={item.variance >= 0 ? 'text-primary' : 'text-destructive'}>{item.variance >= 0 ? '+' : ''}KES {Number(item.variance).toLocaleString()}</span></TableCell>
                          <TableCell><span className={`rounded-full px-2 py-1 text-xs ${item.is_active ? 'bg-primary/15 text-primary' : item.is_finalized ? 'bg-accent/15 text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>{item.is_active ? 'Active' : item.is_finalized ? 'Finalized' : 'Closed'}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {renderPagination(casesPage, caseDataTotalPages, setCasesPage, caseFundingTotalCount, (casesPage - 1) * ITEMS_PER_PAGE, casesPage * ITEMS_PER_PAGE)}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Member Contribution Report</CardTitle>
                    <CardDescription>Individual member contribution history</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportToPDF('Member Contributions', filteredMemberData, ['member_number', 'name', 'contributions_count', 'total_contributions', 'disbursements_count', 'total_disbursements', 'wallet_balance'])}><Download className="mr-2 h-4 w-4" />PDF</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToExcel('Member Contributions', filteredMemberData)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
                    <Button variant="outline" size="sm" onClick={() => exportToCSV('Member Contributions', filteredMemberData)}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
                  </div>
                </div>
                <div className="relative max-w-sm"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by name or member number..." value={membersSearch} onChange={(e) => { setMembersSearch(e.target.value); setMembersPage(1) }} className="pl-8" /></div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Member No</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Contributions</TableHead><TableHead className="text-right">Total Contributed</TableHead><TableHead className="text-right">Disbursements</TableHead><TableHead className="text-right">Total Received</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {loading ? renderSkeletonRows(7) : paginatedMemberData.data.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No data available</TableCell></TableRow> : paginatedMemberData.data.map((member) => (
                        <TableRow key={member.member_id}>
                          <TableCell className="font-medium">{member.member_number}</TableCell>
                          <TableCell>{member.name}</TableCell>
                          <TableCell className="text-right">{Number(member.contributions_count).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">KES {Number(member.total_contributions).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{Number(member.disbursements_count).toLocaleString()}</TableCell>
                          <TableCell className="text-right">KES {Number(member.total_disbursements).toLocaleString()}</TableCell>
                          <TableCell className="text-right"><span className={member.wallet_balance < 0 ? 'text-destructive font-medium' : 'text-primary'}>KES {Number(member.wallet_balance).toLocaleString()}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {renderPagination(membersPage, paginatedMemberData.totalPages, setMembersPage, paginatedMemberData.total, paginatedMemberData.start, paginatedMemberData.end)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

export default FiscalReports
