import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, AlertCircle, Trash2 } from 'lucide-react';
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { persistentCache } from '@/lib/cache';
import { Case, CaseType } from '@/lib/types';
import { mapDbCaseToCase } from '@/lib/db-types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Internal formatting helper functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
};

const buildCaseDescriptionPatterns = (caseNumber: string) => {
  const patterns = new Set<string>();
  const trimmed = String(caseNumber || '').trim();
  const isNumericOnly = /^\d+$/.test(trimmed);

  if (trimmed && !isNumericOnly) {
    patterns.add(trimmed);
  }

  const digitsRaw = trimmed.replace(/\D/g, '');
  const parsedDigits = digitsRaw ? parseInt(digitsRaw, 10) : NaN;
  const digits = !isNaN(parsedDigits) && parsedDigits > 0 ? String(parsedDigits) : '';

  if (digits) {
    patterns.add(`Case ${digits}`);
    patterns.add(`Case #${digits}`);
    patterns.add(`#${digits}`);
  }

  return Array.from(patterns);
};

const buildCaseTransactionOrFilter = (caseId: string, caseNumber: string) => {
  const patterns = buildCaseDescriptionPatterns(caseNumber);
  const clauses = [`case_id.eq.${caseId}`];
  for (const pattern of patterns) {
    clauses.push(`description.ilike.%${pattern}%`);
  }
  return clauses.join(',');
};

const invalidateCaseCaches = () => {
  persistentCache.invalidate('cases-list');
  persistentCache.invalidate('cases-mpesa-v2');
};

const Cases = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cases, setCases] = useState<Case[]>(() => {
    const cached = persistentCache.get<Case[]>('cases-list');
    return cached || [];
  });
  const [loading, setLoading] = useState(true);
  const [mpesaCollectedByCase, setMpesaCollectedByCase] = useState<{ [caseNumber: string]: number }>({});
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<{ id: string; caseNumber: string } | null>(null);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        // Check cache first
        const cachedCases = persistentCache.get<Case[]>('cases-list');
        const cachedMpesa = persistentCache.get<{ [caseNumber: string]: number }>('cases-mpesa-v2');
        
        if (cachedCases && cachedMpesa) {
          setCases(cachedCases);
          setMpesaCollectedByCase(cachedMpesa);
          setLoading(false);
          return;
        }

        setLoading(true);

        // Get all cases from Supabase
        const { data: casesData, error: casesError } = await (supabase as any)
          .from('cases')
          .select('*')
          .order('created_at', { ascending: false });

        if (casesError) {
          console.error('Error fetching cases:', casesError);
          throw casesError;
        }

        // Get affected members to pass to the mapping function (with pagination)
        const pageSize = 1000;
        let from = 0;
        let allMembers: any[] = [];
        
        while (true) {
          const { data: membersBatch, error: membersError } = await supabase
            .from('members')
            .select('*')
            .range(from, from + pageSize - 1);

          if (membersError) {
            console.error('Error fetching members:', membersError);
            throw membersError;
          }

          if (membersBatch && membersBatch.length > 0) {
            allMembers = allMembers.concat(membersBatch);
          }

          if (!membersBatch || membersBatch.length < pageSize) {
            break; // No more pages
          }
          
          from += pageSize;
        }

        // Create a lookup for members by ID
        const membersById = allMembers.reduce((acc, member) => {
          acc[member.id] = member;
          return acc;
        }, {});

        // Get all members to determine the count
        const memberCount = allMembers.length;

        // Map database cases to the application Case model
        const mappedCases = casesData.map(dbCase => {
          const caseObj = mapDbCaseToCase(dbCase, membersById[dbCase.affected_member_id]);
          // Overwrite expectedAmount to be contributionPerMember * memberCount
          return {
            ...caseObj,
            expectedAmount: caseObj.contributionPerMember * memberCount
          };
        });

        setCases(mappedCases);

        // Fetch cumulative collected from contribution transactions for each case (with pagination)
        // NET amount = contributions - refunds
        const totals: { [caseNumber: string]: number } = {};
        for (const c of mappedCases) {
          if (!c.caseNumber) continue;

          const pageSize = 1000;
          let from = 0;
          let totalContributions = 0;
          let totalRefunds = 0;
          const orFilter = buildCaseTransactionOrFilter(c.id, c.caseNumber);

          // Get contributions - use case_id for accurate matching
          while (true) {
            const { data: contribTx, error: contribError } = await (supabase as any)
              .from('transactions')
              .select('amount, description, transaction_type, status')
              .in('transaction_type', ['contribution', 'case_wallet_deduction'])
              .or(orFilter)
              .range(from, from + pageSize - 1);

            if (contribError) {
              totalContributions = 0;
              break;
            }

            const batch = contribTx || [];
            totalContributions += batch.reduce((sum, row) => {
              if (row.status && row.status !== 'completed') return sum;
              const amt = Number(row.amount) || 0;
              return sum + (amt < 0 ? -amt : amt);
            }, 0);

            if (batch.length < pageSize) break;
            from += pageSize;
          }

          // Get refunds - use case_id for accurate matching
          from = 0;
          while (true) {
            const { data: refundTx, error: refundError } = await (supabase as any)
              .from('transactions')
              .select('amount, transaction_type, status')
              .in('transaction_type', ['contribution_refund', 'case_wallet_refund'])
              .or(orFilter)
              .range(from, from + pageSize - 1);

            if (refundError) {
              totalRefunds = 0;
              break;
            }

            const batch = refundTx || [];
            totalRefunds += batch.reduce((sum, row) => {
              if (row.status && row.status !== 'completed') return sum;
              const amt = Number(row.amount) || 0;
              return sum + (amt > 0 ? amt : 0); // Refunds are positive
            }, 0);

            if (batch.length < pageSize) break;
            from += pageSize;
          }

          // NET collected = contributions - refunds
          totals[c.caseNumber] = Math.max(0, totalContributions - totalRefunds);
        }

        setMpesaCollectedByCase(totals);
        
        // Cache this massive payload for 5 minutes
        persistentCache.set('cases-list', mappedCases, 5 * 60 * 1000);
        persistentCache.set('cases-mpesa-v2', totals, 5 * 60 * 1000);
        
      } catch (error) {
        console.error('Error in fetchCases:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load cases. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, []);

  const filteredCases = cases.filter((caseItem) => {
    const matchesSearch = 
      caseItem.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (caseItem.affectedMember?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && caseItem.isActive) ||
      (statusFilter === 'inactive' && !caseItem.isActive) ||
      (statusFilter === 'finalized' && caseItem.isFinalized);
    
    const matchesType = 
      typeFilter === 'all' ||
      caseItem.caseType.toLowerCase() === typeFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getCaseTypeColor = (caseType: CaseType) => {
    switch (caseType) {
      case CaseType.EDUCATION:
        return 'bg-blue-100 text-blue-800';
      case CaseType.SICKNESS:
        return 'bg-amber-100 text-amber-800';
      case CaseType.DEATH:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCaseStatusColor = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'bg-green-100 text-green-800';
    if (isActive) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getCaseStatusText = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'Finalized';
    if (isActive) return 'Active';
    return 'Inactive';
  };

  const handleDeleteClick = (caseId: string, caseNumber: string) => {
    setCaseToDelete({ id: caseId, caseNumber });
    setDeleteDialogOpen(true);
  };

  const handleDeleteCase = async () => {
    if (!caseToDelete) return;

    try {
      setDeletingCaseId(caseToDelete.id);
      setDeleteDialogOpen(false);

      // Unlink related transactions first so case deletion succeeds even if the
      // database does not currently enforce ON DELETE SET NULL as expected.
      const { error: unlinkError } = await (supabase as any)
        .from('transactions')
        .update({ case_id: null })
        .eq('case_id', caseToDelete.id);

      if (unlinkError) {
        throw unlinkError;
      }
      
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseToDelete.id);

      if (error) {
        throw error;
      }

      // Remove the case from local state
      setCases(prevCases => prevCases.filter(c => c.id !== caseToDelete.id));
      
      // Remove from collected amounts
      setMpesaCollectedByCase(prev => {
        const updated = { ...prev };
        delete updated[caseToDelete.caseNumber];
        return updated;
      });

      invalidateCaseCaches();
      setCaseToDelete(null);

      toast({
        title: 'Case deleted',
        description: `Case ${caseToDelete.caseNumber} has been permanently deleted.`,
      });
    } catch (error) {
      console.error('Error deleting case:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to delete case',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDeletingCaseId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1">Cases</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Manage welfare cases</p>
          </div>
          <Button onClick={() => navigate('/cases/new')} className="text-xs md:text-sm h-9">
            <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
            <span className="hidden sm:inline">Create New Case</span>
            <span className="sm:hidden">New Case</span>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search cases..."
              className="w-full pl-9 h-9 md:h-10 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9 md:h-10 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9 md:h-10 text-sm">
              <SelectValue placeholder="Case Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="sickness">Sickness</SelectItem>
              <SelectItem value="death">Death</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="border rounded-lg p-3 md:p-4 space-y-2 md:space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 md:h-5 w-32 md:w-40" />
                  <Skeleton className="h-4 md:h-5 w-16 md:w-20" />
                </div>
                <Skeleton className="h-3 md:h-4 w-full" />
                <Skeleton className="h-3 md:h-4 w-2/3" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 md:h-4 w-16 md:w-20" />
                  <Skeleton className="h-3 md:h-4 w-20 md:w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {filteredCases.map((caseItem) => (
              <Card
                key={caseItem.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/cases/${caseItem.id}`)}
              >
                <CardHeader className="pb-2 p-3 md:p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base md:text-lg truncate">{caseItem.caseNumber}</CardTitle>
                      <CardDescription className="text-xs md:text-sm truncate">
                        {caseItem.affectedMember?.name || 'Unknown Member'}
                      </CardDescription>
                    </div>
                    <Badge className={`${getCaseTypeColor(caseItem.caseType)} text-[10px] md:text-xs flex-shrink-0`}>
                      {caseItem.caseType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-2 p-3 md:p-4">
                  <div className="space-y-1 md:space-y-2 text-xs md:text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Start Date:</span>
                      <span className="truncate">{formatDate(caseItem.startDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">End Date:</span>
                      <span className="truncate">{formatDate(caseItem.endDate)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-muted-foreground">Amount per Member:</span>
                      <span className="truncate">{formatCurrency(caseItem.contributionPerMember)}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-start sm:items-center pt-2 p-3 md:p-4">
                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                    <Badge
                      variant="outline"
                      className={`${getCaseStatusColor(caseItem.isActive, caseItem.isFinalized)} text-[10px] md:text-xs`}
                    >
                      {getCaseStatusText(caseItem.isActive, caseItem.isFinalized)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/cases/${caseItem.id}/edit`);
                      }}
                      className="text-xs md:text-sm h-8"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(caseItem.id, caseItem.caseNumber);
                      }}
                      disabled={deletingCaseId === caseItem.id}
                      className="text-xs md:text-sm h-8"
                    >
                      <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1" />
                      <span className="hidden sm:inline">{deletingCaseId === caseItem.id ? 'Deleting...' : 'Delete'}</span>
                      <span className="sm:hidden">{deletingCaseId === caseItem.id ? '...' : 'Del'}</span>
                    </Button>
                  </div>
                  <div className="text-right w-full sm:w-auto">
                    <div className="text-[10px] md:text-xs text-muted-foreground">Progress</div>
                    <div className="font-medium text-xs md:text-sm">
                      {formatCurrency(mpesaCollectedByCase[caseItem.caseNumber] || 0)} / {formatCurrency(caseItem.expectedAmount)}
                      <div className="text-[10px] md:text-xs text-muted-foreground">(Collected)</div>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 md:py-12 border rounded-lg">
            <AlertCircle className="mx-auto h-10 w-10 md:h-12 md:w-12 text-muted-foreground mb-3 md:mb-4" />
            <p className="text-sm md:text-lg font-medium mb-2">No cases found</p>
            <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? "Try changing your search or filters"
                : "Create a new case to get started"}
            </p>
            {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
              <Button onClick={() => navigate('/cases/new')} className="text-xs md:text-sm h-9">
                <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                <span className="hidden sm:inline">Create Case</span>
                <span className="sm:hidden">Create</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Case</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete case {caseToDelete?.caseNumber}?
              
              This action cannot be undone and will remove:
              - The case record
              - Case links on related transactions
              - Related case data
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCase}
              disabled={!!deletingCaseId}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingCaseId ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Cases;
