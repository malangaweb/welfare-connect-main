import { useEffect, useState } from 'react';
import { PlusCircle, User, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CASE_ROW_COLUMNS } from '@/lib/supabaseSelectColumns';
import { Case, CaseType } from '@/lib/types';
import { mapDbCaseToCase } from '@/lib/db-types';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface CasesTabProps {
  memberId: string;
}

const getCaseTypeColor = (caseType: CaseType) => {
  switch (caseType) {
    case CaseType.EDUCATION:
      return 'bg-blue-100 text-blue-800';
    case CaseType.SICKNESS:
      return 'bg-amber-100 text-amber-800';
    case CaseType.DEATH:
      return 'bg-purple-100 text-purple-800';
    default:
      return '';
  }
};

const getStatusColor = (isActive: boolean, isFinalized: boolean) => {
  if (isFinalized) return 'bg-green-100 text-green-800';
  if (isActive) return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-800';
};

const getStatusText = (isActive: boolean, isFinalized: boolean) => {
  if (isFinalized) return 'Finalized';
  if (isActive) return 'Active';
  return 'Inactive';
};

const CasesTab = ({ memberId }: CasesTabProps) => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCases = async () => {
      if (!memberId) {
        setLoading(false);
        return;
      }

      try {
        const { data: casesData, error: casesError } = await supabase
          .from('cases')
          .select(CASE_ROW_COLUMNS)
          .eq('affected_member_id', memberId)
          .order('created_at', { ascending: false });

        if (casesError) throw casesError;

        const mappedCases = (casesData || []).map((dbCase: any) =>
          mapDbCaseToCase(dbCase)
        );

        setCases(mappedCases);
      } catch (error) {
        console.error('Error fetching cases for member:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, [memberId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Associated Cases</CardTitle>
        <Button variant="outline" size="sm" onClick={() => navigate('/cases/new')}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Case
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">This member has no associated cases.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cases.map((caseItem) => (
              <div
                key={caseItem.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/cases/${caseItem.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">Case #{caseItem.caseNumber}</span>
                    <Badge variant="outline" className={`text-xs ${getCaseTypeColor(caseItem.caseType)}`}>
                      {caseItem.caseType}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${getStatusColor(caseItem.isActive, caseItem.isFinalized)}`}>
                      {getStatusText(caseItem.isActive, caseItem.isFinalized)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(caseItem.startDate, 'MMM d')} - {format(caseItem.endDate, 'MMM d, yyyy')}
                    </span>
                    <span>KES {caseItem.contributionPerMember.toLocaleString()}/member</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CasesTab;
