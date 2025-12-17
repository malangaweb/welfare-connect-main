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
import { Case, CaseType } from '@/lib/types';
import { mapDbCaseToCase } from '@/lib/db-types';

// Internal formatting helper functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const Cases = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [mpesaCollectedByCase, setMpesaCollectedByCase] = useState<{ [caseNumber: string]: number }>({});
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setLoading(true);
        console.log('Fetching cases data...');

        // Get all cases from Supabase
        const { data: casesData, error: casesError } = await supabase
          .from('cases')
          .select('*')
          .order('created_at', { ascending: false });

        if (casesError) {
          console.error('Error fetching cases:', casesError);
          throw casesError;
        }

        console.log('Cases data:', casesData);

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

        console.log(`Fetched ${allMembers.length} members for cases calculation`);

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

        console.log('Mapped cases:', mappedCases);
        setCases(mappedCases);

        // Fetch cumulative collected from contribution transactions for each case (with pagination)
        const totals: { [caseNumber: string]: number } = {};
        for (const c of mappedCases) {
          if (!c.caseNumber) continue;
          
          const pageSize = 1000;
          let from = 0;
          let totalCollected = 0;
          
          while (true) {
            const { data: contribTx, error: contribError } = await supabase
              .from('transactions')
              .select('amount, description, transaction_type')
              .eq('transaction_type', 'contribution')
              .ilike('description', `%Case #${c.caseNumber}%`)
              .range(from, from + pageSize - 1);
              
            if (contribError) {
              totalCollected = 0;
              break;
            }
            
            const batch = contribTx || [];
            totalCollected += batch.reduce((sum, row) => {
              const amt = Number(row.amount) || 0;
              return sum + (amt < 0 ? -amt : amt);
            }, 0);
            
            if (batch.length < pageSize) break; // no more pages
            from += pageSize;
          }
          
          totals[c.caseNumber] = totalCollected;
        }
        setMpesaCollectedByCase(totals);
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

  const handleDeleteCase = async (caseId: string, caseNumber: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete case ${caseNumber}?\n\nThis action cannot be undone and will remove:\n- The case record\n- All associated transactions\n- All related data`
    );
    
    if (!confirmed) return;

    try {
      setDeletingCaseId(caseId);
      
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (error) {
        throw error;
      }

      // Remove the case from local state
      setCases(prevCases => prevCases.filter(c => c.id !== caseId));
      
      // Remove from collected amounts
      setMpesaCollectedByCase(prev => {
        const updated = { ...prev };
        delete updated[caseNumber];
        return updated;
      });

      toast({
        title: 'Case deleted',
        description: `Case ${caseNumber} has been permanently deleted.`,
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
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Cases</h1>
            <p className="text-muted-foreground">Manage welfare cases</p>
          </div>
          <Button onClick={() => navigate('/cases/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Case
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search cases..."
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
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredCases.map((caseItem) => (
              <Card 
                key={caseItem.id} 
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/cases/${caseItem.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{caseItem.caseNumber}</CardTitle>
                      <CardDescription>
                        {caseItem.affectedMember?.name || 'Unknown Member'}
                      </CardDescription>
                    </div>
                    <Badge className={getCaseTypeColor(caseItem.caseType)}>
                      {caseItem.caseType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Start Date:</span>
                      <span>{formatDate(caseItem.startDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">End Date:</span>
                      <span>{formatDate(caseItem.endDate)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-muted-foreground">Amount per Member:</span>
                      <span>{formatCurrency(caseItem.contributionPerMember)}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getCaseStatusColor(caseItem.isActive, caseItem.isFinalized)}
                    >
                      {getCaseStatusText(caseItem.isActive, caseItem.isFinalized)}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCase(caseItem.id, caseItem.caseNumber);
                      }}
                      disabled={deletingCaseId === caseItem.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {deletingCaseId === caseItem.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Progress</div>
                    <div className="font-medium">
                      {formatCurrency(mpesaCollectedByCase[caseItem.caseNumber] || 0)} / {formatCurrency(caseItem.expectedAmount)}
                      <div className="text-xs text-muted-foreground">(Collected)</div>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No cases found</p>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' 
                ? "Try changing your search or filters" 
                : "Create a new case to get started"}
            </p>
            {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
              <Button onClick={() => navigate('/cases/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Case
              </Button>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Cases;
