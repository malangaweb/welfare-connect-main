import { useState, useEffect } from 'react'
import { Download, Shield, CheckCircle, AlertTriangle, FileCheck, UserCheck } from 'lucide-react'
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
import { toast } from '@/components/ui/use-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'

interface ComplianceIssue {
  id: string
  issue_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  affected_count: number
  recommendation: string
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

const ComplianceReports = () => {
  const [activeTab, setActiveTab] = useState('audit')
  const [loading, setLoading] = useState(true)
  
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [reversals, setReversals] = useState<ReversalEntry[]>([])
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [stats, setStats] = useState<any>(null)

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setAuditLogs(data || [])
    } catch (error: any) {
      console.error('Error fetching audit logs:', error)
    }
  }

  const fetchReversals = async () => {
    try {
      const { data, error } = await supabase
        .from('reversals_audit')
        .select('*')
        .order('reversal_date', { ascending: false })

      if (error) throw error
      setReversals(data || [])
    } catch (error: any) {
      console.error('Error fetching reversals:', error)
    }
  }

  const checkCompliance = async () => {
    const issues: ComplianceIssue[] = []

    try {
      // Check for members without phone numbers
      const { data: noPhone } = await supabase
        .from('members')
        .select('id', { count: 'exact' })
        .is('phone_number', null)

      if (noPhone && noPhone.length > 0) {
        issues.push({
          id: 'no-phone',
          issue_type: 'Missing Contact Information',
          severity: 'medium',
          description: 'Members without phone numbers',
          affected_count: noPhone.length,
          recommendation: 'Update member records with valid phone numbers',
        })
      }

      // Check for negative balance active members
      const { data: defaulters } = await supabase
        .from('active_defaulters')
        .select('id')

      if (defaulters && defaulters.length > 0) {
        issues.push({
          id: 'defaulters',
          issue_type: 'Outstanding Balances',
          severity: 'high',
          description: 'Active members with negative wallet balance',
          affected_count: defaulters.length,
          recommendation: 'Follow up with members to clear outstanding balances',
        })
      }

      // Check for pending suspense transactions
      const { data: suspense } = await supabase
        .from('wrong_mpesa_transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')

      if (suspense && suspense.length > 0) {
        issues.push({
          id: 'suspense-pending',
          issue_type: 'Unmatched Payments',
          severity: 'medium',
          description: 'M-Pesa payments pending matching to member accounts',
          affected_count: suspense.length,
          recommendation: 'Review and match suspense transactions to member accounts',
        })
      }

      // Check for members on prolonged probation
      const { data: prolongedProbation } = await supabase
        .from('members_on_probation')
        .select('id')
        .gt('days_overdue', 0)

      if (prolongedProbation && prolongedProbation.length > 0) {
        issues.push({
          id: 'prolonged-probation',
          issue_type: 'Probation Status',
          severity: 'low',
          description: 'Members whose probation period has ended but status not updated',
          affected_count: prolongedProbation.length,
          recommendation: 'Run probation auto-update or manually update member status',
        })
      }

      // Check for failed transactions
      const { data: failedTx } = await supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'failed')

      if (failedTx && failedTx.length > 0) {
        issues.push({
          id: 'failed-transactions',
          issue_type: 'Failed Transactions',
          severity: 'medium',
          description: 'Transactions that failed to complete',
          affected_count: failedTx.length,
          recommendation: 'Review failed transactions and retry or refund as necessary',
        })
      }

      setComplianceIssues(issues)
    } catch (error: any) {
      console.error('Error checking compliance:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_enhanced_dashboard_summary')
      if (error) throw error
      setStats(data?.[0] || {})
    } catch (error: any) {
      console.error('Error fetching stats:', error)
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

  const exportAuditToPDF = () => {
    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text('Audit Trail Report', 14, 20)
    doc.setFontSize(10)
    doc.text(`Generated on: ${format(new Date(), 'dd MMMM yyyy')}`, 14, 28)
    
    const tableData = auditLogs.map((log) => [
      format(new Date(log.created_at), 'dd MMM yyyy HH:mm'),
      log.action,
      log.table_name || '-',
      log.status,
      log.member_id ? `Member: ${log.member_id}` : log.user_id ? `User: ${log.user_id}` : '-',
    ])
    
    ;(doc as any).autoTable({
      head: [['Date/Time', 'Action', 'Table', 'Status', 'Reference']],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 20, left: 14, right: 14 },
    })
    
    doc.save(`audit_trail_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }

  const exportReversalsToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reversals)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reversals')
    XLSX.writeFile(wb, `reversals_audit_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600'
      case 'high':
        return 'bg-orange-600'
      case 'medium':
        return 'bg-yellow-600'
      case 'low':
        return 'bg-blue-600'
      default:
        return 'bg-gray-600'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Compliance Reports</h1>
            <p className="text-muted-foreground">Audit trails, reversals, and compliance monitoring</p>
          </div>
        </div>

        {/* Compliance Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reversals</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_reversals_count || 0}</div>
              <p className="text-xs text-muted-foreground">
                KES {stats?.total_reversals_amount?.toLocaleString() || '0'} reversed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{complianceIssues.length}</div>
              <p className="text-xs text-muted-foreground">
                {complianceIssues.filter((i) => i.severity === 'high' || i.severity === 'critical').length} critical/high
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audit Entries</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{auditLogs.length}</div>
              <p className="text-xs text-muted-foreground">Last 100 entries</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspense Pending</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.suspense_pending_count || 0}</div>
              <p className="text-xs text-muted-foreground">
                KES {stats?.suspense_pending_amount?.toLocaleString() || '0'} pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 gap-4 w-full">
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            <TabsTrigger value="reversals">Reversals Audit</TabsTrigger>
            <TabsTrigger value="compliance">Compliance Issues</TabsTrigger>
          </TabsList>

          {/* Audit Trail Tab */}
          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Audit Trail</CardTitle>
                    <CardDescription>System activity log for all actions</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportAuditToPDF}>
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
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
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : auditLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No audit logs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLogs.map((log) => (
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reversals Audit Tab */}
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
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            Loading...
                          </TableCell>
                        </TableRow>
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
                            <TableCell className="text-right font-medium text-red-600">
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

          {/* Compliance Issues Tab */}
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
                  <div className="text-center py-8">Loading...</div>
                ) : complianceIssues.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-green-600">All Clear!</h3>
                    <p className="text-muted-foreground">No compliance issues detected</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {complianceIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="border rounded-lg p-4 flex items-start gap-4"
                      >
                        <div className={`rounded-full p-2 ${getSeverityColor(issue.severity)}`}>
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
