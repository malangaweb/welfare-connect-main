import { useState, useEffect } from 'react'
import { Download, Calendar, TrendingUp, DollarSign, Users, FileText } from 'lucide-react'
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
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/components/ui/use-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'

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
  contribution_per_member: number
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

const FiscalReports = () => {
  const [activeTab, setActiveTab] = useState('contributions')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [loading, setLoading] = useState(true)
  
  const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([])
  const [caseData, setCaseData] = useState<CaseFunding[]>([])
  const [memberContributions, setMemberContributions] = useState<MemberContribution[]>([])
  const [summary, setSummary] = useState<any>(null)

  // Generate month options
  const months = [
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

  // Generate year options (last 5 years + current)
  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - i
    return { value: year.toString(), label: year.toString() }
  })

  const fetchMonthlyContributions = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_contributions_summary')
        .select('*')
        .order('month', { ascending: false })

      if (error) throw error
      setMonthlyData(data || [])
    } catch (error: any) {
      console.error('Error fetching monthly contributions:', error)
    }
  }

  const fetchCaseFunding = async () => {
    try {
      const { data, error } = await supabase
        .from('case_funding_summary')
        .select('*')

      if (error) throw error
      setCaseData(data || [])
    } catch (error: any) {
      console.error('Error fetching case funding:', error)
    }
  }

  const fetchMemberContributions = async () => {
    try {
      const { data, error } = await supabase
        .from('member_transaction_summary')
        .select('*')
        .order('member_number')

      if (error) throw error
      setMemberContributions(data || [])
    } catch (error: any) {
      console.error('Error fetching member contributions:', error)
    }
  }

  const fetchSummary = async () => {
    try {
      const { data, error } = await supabase.rpc('get_enhanced_dashboard_summary')
      if (error) throw error
      setSummary(data?.[0] || {})
    } catch (error: any) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      await Promise.all([
        fetchMonthlyContributions(),
        fetchCaseFunding(),
        fetchMemberContributions(),
        fetchSummary(),
      ])
      setLoading(false)
    }
    fetchData()
  }, [])

  const exportToPDF = (title: string, data: any[], columns: string[]) => {
    const doc = new jsPDF()
    
    // Add title
    doc.setFontSize(16)
    doc.text(title, 14, 20)
    doc.setFontSize(10)
    doc.text(`Generated on: ${format(new Date(), 'dd MMMM yyyy')}`, 14, 28)
    
    // Prepare table data
    const tableData = data.map((row: any) => 
      columns.map((col: string) => {
        const value = row[col]
        if (value === null || value === undefined) return ''
        if (typeof value === 'number') {
          return col.includes('amount') || col.includes('balance') 
            ? `KES ${value.toLocaleString()}` 
            : value.toString()
        }
        if (col.includes('date') || col.includes('month')) {
          return value ? format(new Date(value), 'MMM yyyy') : ''
        }
        return String(value)
      })
    )
    
    // Add table
    ;(doc as any).autoTable({
      head: [columns.map((col: string) => col.replace(/_/g, ' ').toUpperCase())],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      margin: { top: 20, left: 14, right: 14 },
    })
    
    doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }

  const exportToExcel = (title: string, data: any[]) => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, title)
    XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const filteredMonthlyData = monthlyData.filter((item) => {
    const date = new Date(item.month)
    const monthMatch = selectedMonth === '' || date.getMonth().toString() === selectedMonth
    const yearMatch = selectedYear === '' || date.getFullYear().toString() === selectedYear
    return monthMatch && yearMatch
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Fiscal Reports</h1>
            <p className="text-muted-foreground">Financial reports and analytics</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contributions</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                KES {summary?.total_contributions?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">All time contributions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.active_members?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary?.probation_members || 0} on probation
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.active_cases?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">Ongoing welfare cases</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Defaulters</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary?.defaulters_count?.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">Members with negative balance</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 gap-4 w-full">
            <TabsTrigger value="contributions">Contributions Analysis</TabsTrigger>
            <TabsTrigger value="cases">Case Funding</TabsTrigger>
            <TabsTrigger value="members">Member Contributions</TabsTrigger>
          </TabsList>

          {/* Contributions Analysis Tab */}
          <TabsContent value="contributions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Monthly Contributions Summary</CardTitle>
                    <CardDescription>Breakdown of contributions by month and type</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Months" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All Months</SelectItem>
                        {months.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y.value} value={y.value}>
                            {y.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToPDF('Monthly Contributions', filteredMonthlyData, [
                        'month',
                        'transaction_type',
                        'transaction_count',
                        'total_amount',
                        'unique_members',
                      ])}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToExcel('Monthly Contributions', filteredMonthlyData)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Unique Members</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : filteredMonthlyData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No data available
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMonthlyData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {format(new Date(item.month), 'MMMM yyyy')}
                            </TableCell>
                            <TableCell className="capitalize">
                              {item.transaction_type.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.transaction_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              KES {item.total_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.unique_members.toLocaleString()}
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

          {/* Case Funding Tab */}
          <TabsContent value="cases" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Case Funding Summary</CardTitle>
                    <CardDescription>Progress of fundraising for each case</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToPDF('Case Funding Report', caseData, [
                      'case_number',
                      'case_type',
                      'expected_amount',
                      'actual_amount',
                      'variance',
                      'is_active',
                    ])}
                  >
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
                        <TableHead>Case Number</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Raised</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : caseData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No cases found
                          </TableCell>
                        </TableRow>
                      ) : (
                        caseData.map((item) => (
                          <TableRow key={item.case_id}>
                            <TableCell className="font-medium">{item.case_number}</TableCell>
                            <TableCell className="capitalize">{item.case_type}</TableCell>
                            <TableCell className="text-right">
                              KES {item.expected_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              KES {item.actual_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={item.variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {item.variance >= 0 ? '+' : ''}KES {item.variance.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                item.is_active 
                                  ? 'bg-green-100 text-green-700' 
                                  : item.is_finalized 
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                              }`}>
                                {item.is_active ? 'Active' : item.is_finalized ? 'Finalized' : 'Closed'}
                              </span>
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

          {/* Member Contributions Tab */}
          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Member Contribution Report</CardTitle>
                    <CardDescription>Individual member contribution history</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel('Member Contributions', memberContributions)}
                  >
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
                        <TableHead>Member No</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Contributions</TableHead>
                        <TableHead className="text-right">Total Contributed</TableHead>
                        <TableHead className="text-right">Disbursements</TableHead>
                        <TableHead className="text-right">Total Received</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : memberContributions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No data available
                          </TableCell>
                        </TableRow>
                      ) : (
                        memberContributions.map((member) => (
                          <TableRow key={member.member_id}>
                            <TableCell className="font-medium">{member.member_number}</TableCell>
                            <TableCell>{member.name}</TableCell>
                            <TableCell className="text-right">
                              {member.contributions_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              KES {member.total_contributions.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {member.disbursements_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              KES {member.total_disbursements.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={member.wallet_balance < 0 ? 'text-red-600 font-medium' : ''}>
                                KES {member.wallet_balance.toLocaleString()}
                              </span>
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
        </Tabs>
      </div>
    </DashboardLayout>
  )
}

export default FiscalReports
