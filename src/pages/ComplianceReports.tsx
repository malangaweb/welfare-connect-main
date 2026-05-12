import { useState, useEffect, useMemo, useCallback } from 'react'
import { Download, Shield, CheckCircle, AlertTriangle, FileCheck, UserCheck, Filter, Search, X, CalendarIcon } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import ReportsSubnav from '@/components/reports/ReportsSubnav'
import { createReportFilename } from '@/lib/reportExport'
import { loadJsPdfWithAutotable, loadXlsx } from '@/lib/reportExportLibs'
import {
  AUDIT_LOG_LIST_COLUMNS,
  MEMBERS_ON_PROBATION_COMPLIANCE_COLUMNS,
  REVERSALS_AUDIT_COLUMNS,
  WRONG_MPESA_PENDING_COUNT_COLUMNS,
} from '@/lib/supabaseSelectColumns'
import { format, subDays, startOfYear } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'

interface ComplianceIssue {
  id: string
  issue_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  affected_count: number
  recommendation: string
  details: string[]
}

interface AuditEntry {
  id: string
  action: string
  table_name: string
  status: string
  created_at: string
  user_id?: string
  member_id?: string
  metadata?: any
}

interface ReversalEntry {
  reversal_id: string
  member_name: string
  member_number: string
  reversal_amount: number
  reason: string
  reversal_date: string
  original_transaction_date: string
  original_amount: number
}

const ITEMS_PER_PAGE = 15
const MAX_EXPORT_ENTRIES = 200
const FAILED_TRANSACTION_STATUSES = ['failed', 'error', 'cancelled', 'canceled', 'reversed', 'voided']

const severityColorMap: Record<string, string> = {
  critical: 'bg-destructive',
  high: 'bg-accent',
  medium: 'bg-primary/80',
  low: 'bg-primary',
}

const ComplianceReports = () => {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('audit')
  const [loading, setLoading] = useState(true)
  const [auditPage, setAuditPage] = useState(1)
  const [auditSearch, setAuditSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<'7days' | '30days' | '90days' | 'thisYear' | 'all'>('30days')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({})
  
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [reversals, setReversals] = useState<ReversalEntry[]>([])
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [stats, setStats] = useState<any>(null)

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(AUDIT_LOG_LIST_COLUMNS)
        .order('timestamp', { ascending: false })
        .limit(100)

      if (error) throw error
      const rows = (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        created_at: (row.created_at as string) || (row.timestamp as string),
      })) as AuditEntry[]
      setAuditLogs(rows)
    } catch (error: any) {
      console.error('Error fetching audit logs:', error)
      toast({
        title: 'Error fetching audit logs',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const fetchReversals = async () => {
    try {
      const { data, error } = await supabase
        .from('reversals_audit')
        .select(REVERSALS_AUDIT_COLUMNS)
        .order('reversal_date', { ascending: false })

      if (error) throw error
      setReversals(data || [])
    } catch (error: any) {
      console.error('Error fetching reversals:', error)
      toast({
        title: 'Error fetching reversals',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const checkCompliance = async () => {
    const issues: ComplianceIssue[] = []

    try {
      const [
        { data: noPhone },
        { data: defaulters },
        { data: suspense },
        { data: prolongedProbation },
        { data: failedTx },
      ] = await Promise.all([
        supabase
          .from('members')
          .select('id, member_number, name', { count: 'exact' })
          .is('phone_number', null),
        supabase
          .from('active_defaulters')
          .select('id, member_number, name, wallet_balance'),
        supabase
          .from('wrong_mpesa_transactions')
          .select(WRONG_MPESA_PENDING_COUNT_COLUMNS, { count: 'exact' })
          .eq('status', 'pending'),
        supabase
          .from('members_on_probation')
          .select(MEMBERS_ON_PROBATION_COMPLIANCE_COLUMNS)
          .gt('days_overdue', 0),
        supabase
          .from('transactions')
          .select('id, member_id, amount, mpesa_reference, created_at', { count: 'exact' })
          .in('status', FAILED_TRANSACTION_STATUSES),
      ])

      if (noPhone && noPhone.length > 0) {
        issues.push({
          id: 'no-phone',
          issue_type: 'Missing Contact Information',
          severity: 'medium',
          description: 'Members without phone numbers',
          affected_count: noPhone.length,
          recommendation: 'Update member records with valid phone numbers',
          details: noPhone.map((member: any) => `${member.member_number || member.id}: ${member.name || 'Unknown member'}`),
        })
      }

      if (defaulters && defaulters.length > 0) {
        issues.push({
          id: 'defaulters',
          issue_type: 'Outstanding Balances',
          severity: 'high',
          description: 'Active members with negative wallet balance',
          affected_count: defaulters.length,
          recommendation: 'Follow up with members to clear outstanding balances',
          details: defaulters.map((entry: any) => {
            const amount = Number(entry.wallet_balance || 0)
            return `${entry.member_number || entry.id}: ${entry.name || 'Unknown'} (KES ${Math.abs(amount).toLocaleString()} overdue)`
          }),
        })
      }

      if (suspense && suspense.length > 0) {
        issues.push({
          id: 'suspense-pending',
          issue_type: 'Unmatched Payments',
          severity: 'medium',
          description: 'M-Pesa payments pending matching to member accounts',
          affected_count: suspense.length,
          recommendation: 'Review and match suspense transactions to member accounts',
          details: suspense.map((entry: any) => {
            const reference = entry.reference || entry.mpesa_receipt_number || entry.id
            const amount = Number(entry.amount || 0)
            return `Ref ${reference}: KES ${Math.abs(amount).toLocaleString()} pending match`
          }),
        })
      }

      if (prolongedProbation && prolongedProbation.length > 0) {
        issues.push({
          id: 'prolonged-probation',
          issue_type: 'Probation Status',
          severity: 'low',
          description: 'Members whose probation period has ended but status not updated',
          affected_count: prolongedProbation.length,
          recommendation: 'Run probation auto-update or manually update member status',
          details: prolongedProbation.map((entry: any) => {
            const memberRef = entry.member_number || entry.id
            const memberName = entry.name || 'Unknown member'
            const overdueDays = Number(entry.days_overdue || 0)
            return `${memberRef}: ${memberName} (${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue)`
          }),
        })
      }

      if (failedTx && failedTx.length > 0) {
        issues.push({
          id: 'failed-transactions',
          issue_type: 'Failed Transactions',
          severity: 'medium',
          description: 'Transactions that failed to complete',
          affected_count: failedTx.length,
          recommendation: 'Review failed transactions and retry or refund as necessary',
          details: failedTx.map((entry: any) => {
            const reference = entry.mpesa_reference || entry.id
            const amount = Number(entry.amount || 0)
            const date = entry.created_at ? format(new Date(entry.created_at), 'dd MMM yyyy') : 'Unknown date'
            return `Ref ${reference}: KES ${Math.abs(amount).toLocaleString()} failed on ${date}`
          }),
        })
      }

      setComplianceIssues(issues)
    } catch (error: any) {
      console.error('Error checking compliance:', error)
      toast({
        title: 'Error checking compliance',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_enhanced_dashboard_summary')
      if (error) throw error
      setStats((data && data[0]) || {})
    } catch (error: any) {
      console.error('Error fetching stats:', error)
      toast({
        title: 'Error fetching stats',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      await Promise.all([
        fetchAuditLogs(),
        fetchReversals(),
        checkCompliance(),
        fetchStats(),
      ])
      setLoading(false)
    }
    fetchData()
  }, [])

  const getAuditDateRange = useCallback(() => {
    const now = new Date()
    switch (datePreset) {
      case '7days': return subDays(now, 7)
      case '30days': return subDays(now, 30)
      case '90days': return subDays(now, 90)
      case 'thisYear': return startOfYear(now)
      case 'all': return new Date(2000, 0, 1)
      default: return subDays(now, 30)
    }
  }, [datePreset])

  const filteredAuditLogs = useMemo(() => {
    const startDate = getAuditDateRange()
    return auditLogs.filter(log => {
      const logDate = new Date(log.created_at)
      if (logDate < startDate) return false
      if (auditSearch) {
        const search = auditSearch.toLowerCase()
        const matches = [
          log.action,
          log.table_name,
          log.status,
          log.member_id,
          log.user_id
        ].some(v => v?.toLowerCase().includes(search))
        if (!matches) return false
      }
      return true
    })
  }, [auditLogs, getAuditDateRange, auditSearch])

  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * ITEMS_PER_PAGE
    return {
      data: filteredAuditLogs.slice(start, start + ITEMS_PER_PAGE),
      total: filteredAuditLogs.length,
      totalPages: Math.ceil(filteredAuditLogs.length / ITEMS_PER_PAGE)
    }
  }, [filteredAuditLogs, auditPage])

  const filteredComplianceIssues = useMemo(() => {
    if (severityFilter === 'all') return complianceIssues
    return complianceIssues.filter(i => i.severity === severityFilter)
  }, [complianceIssues, severityFilter])

  const clearFilters = () => {
    setDatePreset('30days')
    setAuditSearch('')
    setSeverityFilter('all')
    setAuditPage(1)
  }

  const hasActiveFilters = datePreset !== '30days' || auditSearch !== '' || severityFilter !== 'all'
  const toggleIssueExpansion = (issueId: string) => {
    setExpandedIssues((prev) => ({ ...prev, [issueId]: !prev[issueId] }))
  }

  const exportAuditToPDF = async () => {
    try {
      const jsPDF = await loadJsPdfWithAutotable()
      const doc = new jsPDF()
      
      doc.setFontSize(16)
      doc.text('Audit Trail Report', 14, 20)
      doc.setFontSize(10)
      doc.text(`Generated on: ${format(new Date(), 'dd MMMM yyyy')}`, 14, 28)
      
      const logsToExport = filteredAuditLogs.slice(0, MAX_EXPORT_ENTRIES)
      if (!logsToExport.length) {
        toast({ title: 'No data to export', description: 'Adjust filters and try again.', variant: 'destructive' })
        return
      }
      if (filteredAuditLogs.length > MAX_EXPORT_ENTRIES) {
        doc.setFontSize(8)
        doc.text(`Note: Export limited to first ${MAX_EXPORT_ENTRIES} entries. Total entries: ${filteredAuditLogs.length}`, 14, 34)
      }
      
      const tableData = logsToExport.map((log) => [
        format(new Date(log.created_at), 'dd MMM yyyy HH:mm'),
        log.action,
        log.table_name || '-',
        log.status,
        log.member_id ? `Member: ${log.member_id}` : log.user_id ? `User: ${log.user_id}` : '-',
      ])
      
      ;(doc as any).autoTable({
        head: [['Date/Time', 'Action', 'Table', 'Status', 'Reference']],
        body: tableData,
        startY: filteredAuditLogs.length > MAX_EXPORT_ENTRIES ? 40 : 35,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] },
        margin: { top: 20, left: 14, right: 14 },
      })
      
      doc.save(createReportFilename('compliance_audit_trail', 'pdf'))
    } catch (error: any) {
      console.error('Error exporting PDF:', error)
      toast({
        title: 'Export failed',
        description: 'Failed to export audit trail to PDF.',
        variant: 'destructive',
      })
    }
  }

  const exportAuditToCSV = () => {
    try {
      const logsToExport = filteredAuditLogs.slice(0, MAX_EXPORT_ENTRIES)
      if (!logsToExport.length) {
        toast({ title: 'No data to export', description: 'Adjust filters and try again.', variant: 'destructive' })
        return
      }
      const headers = ['Date/Time', 'Action', 'Table', 'Status', 'Reference']
      const rows = logsToExport.map(log => [
        format(new Date(log.created_at), 'dd MMM yyyy HH:mm'),
        log.action,
        log.table_name || '-',
        log.status,
        log.member_id ? `Member: ${log.member_id}` : log.user_id ? `User: ${log.user_id}` : '-',
      ])

      let csvContent = headers.join(',') + '\n'
      rows.forEach(row => {
        csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n'
      })

      if (filteredAuditLogs.length > MAX_EXPORT_ENTRIES) {
        csvContent += `\n"Note: Export limited to first ${MAX_EXPORT_ENTRIES} entries. Total entries: ${filteredAuditLogs.length}"\n`
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = createReportFilename('compliance_audit_trail', 'csv')
      link.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Error exporting CSV:', error)
      toast({
        title: 'Export failed',
        description: 'Failed to export audit trail to CSV.',
        variant: 'destructive',
      })
    }
  }

  const exportReversalsToExcel = async () => {
    try {
      if (!reversals.length) {
        toast({ title: 'No data to export', description: 'No reversals available for export.', variant: 'destructive' })
        return
      }
      const XLSX = await loadXlsx()
      const ws = XLSX.utils.json_to_sheet(reversals)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Reversals')
      XLSX.writeFile(wb, createReportFilename('compliance_reversals_audit', 'xlsx'))
    } catch (error: any) {
      console.error('Error exporting Excel:', error)
      toast({
        title: 'Export failed',
        description: 'Failed to export reversals to Excel.',
        variant: 'destructive',
      })
    }
  }

  const renderSkeletonRows = (cols: number) => (
    Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cols }).map((_, j) => (
          <TableCell key={j}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ))
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Compliance Reports</h1>
            <p className="text-muted-foreground">Audit trails, reversals, and compliance monitoring</p>
          </div>
        </div>

        <ReportsSubnav />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reversals</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.total_reversals_count || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    KES {stats?.total_reversals_amount?.toLocaleString() || '0'} reversed
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{complianceIssues.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {complianceIssues.filter((i) => i.severity === 'high' || i.severity === 'critical').length} critical/high
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audit Entries</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{auditLogs.length}</div>
                  <p className="text-xs text-muted-foreground">Last 100 entries</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspense Pending</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.suspense_pending_count || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    KES {stats?.suspense_pending_amount?.toLocaleString() || '0'} pending
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={hasActiveFilters ? 'border-primary' : ''}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as any); setAuditPage(1) }}>
                    <SelectTrigger>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7days">Last 7 Days</SelectItem>
                      <SelectItem value="30days">Last 30 Days</SelectItem>
                      <SelectItem value="90days">Last 90 Days</SelectItem>
                      <SelectItem value="thisYear">This Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search Audit Logs</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by action, table, status..."
                      value={auditSearch}
                      onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1) }}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Severity Filter</label>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All severities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {datePreset !== '30days' && (
                    <Badge variant="secondary">
                      Date: {datePreset === '7days' ? 'Last 7 Days' : datePreset === '90days' ? 'Last 90 Days' : datePreset === 'thisYear' ? 'This Year' : 'All Time'}
                      <button onClick={() => setDatePreset('30days')} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {auditSearch && (
                    <Badge variant="secondary">
                      Search: {auditSearch}
                      <button onClick={() => { setAuditSearch(''); setAuditPage(1) }} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {severityFilter !== 'all' && (
                    <Badge variant="secondary">
                      Severity: {severityFilter}
                      <button onClick={() => setSeverityFilter('all')} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 gap-4 w-full">
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            <TabsTrigger value="reversals">Reversals Audit</TabsTrigger>
            <TabsTrigger value="compliance">Compliance Issues</TabsTrigger>
          </TabsList>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Audit Trail</CardTitle>
                    <CardDescription>System activity log for all actions</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportAuditToCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportAuditToPDF}>
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        renderSkeletonRows(5)
                      ) : paginatedAuditLogs.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No audit logs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedAuditLogs.data.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">
                              {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium">{log.action}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {log.table_name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {log.member_id 
                                ? `Member: ${log.member_id.substring(0, 8)}...` 
                                : log.user_id 
                                  ? `User: ${log.user_id.substring(0, 8)}...`
                                  : '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {!loading && paginatedAuditLogs.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(auditPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(auditPage * ITEMS_PER_PAGE, paginatedAuditLogs.total)} of {paginatedAuditLogs.total}
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                            className={auditPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                        {Array.from({ length: paginatedAuditLogs.totalPages }).map((_, i) => (
                          <PaginationItem key={i}>
                            <PaginationLink
                              onClick={() => setAuditPage(i + 1)}
                              isActive={auditPage === i + 1}
                              className="cursor-pointer"
                            >
                              {i + 1}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setAuditPage(p => Math.min(paginatedAuditLogs.totalPages, p + 1))}
                            className={auditPage === paginatedAuditLogs.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reversals" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Transaction Reversals</CardTitle>
                    <CardDescription>Complete audit of all transaction reversals</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportReversalsToExcel}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reversal Date</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead className="text-right">Reversal Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Original Date</TableHead>
                        <TableHead className="text-right">Original Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        renderSkeletonRows(6)
                      ) : reversals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No reversals found
                          </TableCell>
                        </TableRow>
                      ) : (
                        reversals.map((reversal) => (
                          <TableRow key={reversal.reversal_id}>
                            <TableCell className="text-sm">
                              {format(new Date(reversal.reversal_date), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{reversal.member_name}</p>
                                <p className="text-xs text-muted-foreground">{reversal.member_number}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              KES {Math.abs(reversal.reversal_amount).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {reversal.reason}
                            </TableCell>
                            <TableCell className="text-sm">
                              {reversal.original_transaction_date 
                                ? format(new Date(reversal.original_transaction_date), 'dd MMM yyyy') 
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              KES {Math.abs(reversal.original_amount || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Compliance Issues</CardTitle>
                  <CardDescription>
                    Automated compliance checks and recommendations
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="border rounded-lg p-4 flex items-start gap-4">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-64" />
                          <Skeleton className="h-3 w-56" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredComplianceIssues.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-primary">All Clear!</h3>
                    <p className="text-muted-foreground">No compliance issues detected</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredComplianceIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="border rounded-lg p-4 flex items-start gap-4"
                      >
                        <div className={`rounded-full p-2 ${severityColorMap[issue.severity] || 'bg-gray-600'}`}>
                          <AlertTriangle className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{issue.issue_type}</h4>
                            <Badge variant="outline" className="text-xs">
                              {issue.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {issue.description} - <span className="font-medium">{issue.affected_count} affected</span>
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Recommendation: </span>
                            {issue.recommendation}
                          </p>
                          {issue.details.length > 0 && (
                            <div className="mt-3 rounded-md bg-muted/50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
                              <ul className="mt-2 space-y-1 text-sm text-foreground">
                                {(expandedIssues[issue.id] ? issue.details : issue.details.slice(0, 5)).map((detail, index) => (
                                  <li key={`${issue.id}-detail-${index}`}>- {detail}</li>
                                ))}
                              </ul>
                              {issue.details.length > 5 && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="mt-2 h-auto p-0 text-xs"
                                  onClick={() => toggleIssueExpansion(issue.id)}
                                >
                                  {expandedIssues[issue.id]
                                    ? 'View less'
                                    : `View more (${issue.details.length - 5} more)`}
                                </Button>
                              )}
                              {issue.affected_count > issue.details.length && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  and {issue.affected_count - issue.details.length} more...
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

export default ComplianceReports
