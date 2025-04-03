
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, Edit, Users, User, Calendar, DollarSign, CheckCircle, TimerOff, Clock, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Case, CaseType } from '@/lib/types';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { DbCase, DbMember, mapDbCaseToCase } from '@/lib/db-types';

const CaseDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCase = async () => {
      if (!id) {
        setError("Case ID is required");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        console.log('Fetching case with ID:', id);
        
        // Fixed query to use maybeSingle() instead of single()
        const { data: caseData, error: caseError } = await supabase
          .from('cases')
          .select('*')
          .eq('id', id)
          .maybeSingle();
          
        if (caseError) {
          console.error('Error fetching case:', caseError);
          throw caseError;
        }
        
        if (!caseData) {
          throw new Error('Case not found');
        }
        
        const dbCase = caseData as DbCase;
        
        // Fixed query to use maybeSingle() for member data
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('*')
          .eq('id', dbCase.affected_member_id)
          .maybeSingle();
            
        if (memberError) {
          console.error('Error fetching affected member:', memberError);
          throw memberError;
        }
        
        if (!memberData) {
          console.warn('Associated member not found for case:', id);
        }
        
        const mappedCase = mapDbCaseToCase(dbCase, memberData as DbMember);
        setCaseData(mappedCase);
      } catch (error) {
        console.error('Error fetching case:', error);
        setError(error instanceof Error ? error.message : 'Failed to load case details');
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load case details.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
  }, [id, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <p>Loading case details...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !caseData) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)]">
          <h2 className="text-xl font-semibold mb-2">Case not found</h2>
          <p className="text-muted-foreground mb-4">{error || "The requested case could not be found."}</p>
          <Button onClick={() => navigate('/cases')}>
            Go back to cases
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const progress = caseData ? (caseData.actualAmount / caseData.expectedAmount) * 100 : 0;
  
  const getCaseTypeColor = (type: CaseType) => {
    switch (type) {
      case CaseType.EDUCATION:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      case CaseType.SICKNESS:
        return 'bg-amber-100 text-amber-800 hover:bg-amber-100';
      case CaseType.DEATH:
        return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
      default:
        return '';
    }
  };
  
  const getStatusColor = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'bg-green-100 text-green-800 hover:bg-green-100';
    if (isActive) return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
    return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  };
  
  const getStatusText = (isActive: boolean, isFinalized: boolean) => {
    if (isFinalized) return 'Finalized';
    if (isActive) return 'Active';
    return 'Draft';
  };

  const initials = caseData?.affectedMember?.name
    ? caseData.affectedMember.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2)
    : 'NA';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate('/cases')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Cases
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Case #{caseData.caseNumber}</h1>
            <div className="flex space-x-2">
              <Badge variant="outline" className={getCaseTypeColor(caseData.caseType)}>
                {caseData.caseType}
              </Badge>
              <Badge variant="outline" className={getStatusColor(caseData.isActive, caseData.isFinalized)}>
                {getStatusText(caseData.isActive, caseData.isFinalized)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Collection Progress</CardTitle>
              <CardDescription>
                {Math.round(progress)}% of target amount collected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={progress} className="h-2 mb-2" />
              <div className="flex justify-between text-sm">
                <div>
                  <p className="text-muted-foreground">Collected</p>
                  <p className="font-medium">KES {caseData.actualAmount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">Target</p>
                  <p className="font-medium">KES {caseData.expectedAmount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Case duration and status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Created on</p>
                    <p className="font-medium">{format(caseData.createdAt, 'MMMM d, yyyy')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {format(caseData.startDate, 'MMM d')} - {format(caseData.endDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Contribution per member</p>
                    <p className="font-medium">KES {caseData.contributionPerMember.toLocaleString()}</p>
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <Button variant="outline" size="sm" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    {caseData.isFinalized ? 'View Timeline' : 'Manage Timeline'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center">
              <div className="mr-4">
                <Avatar className="h-12 w-12 border-2 border-primary/10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div>
                <CardTitle className="text-base">Affected Member</CardTitle>
                <CardDescription>Case beneficiary</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{caseData.affectedMember?.name}</p>
                  <p className="text-sm text-muted-foreground">Member #{caseData.affectedMember?.memberNumber}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{caseData.affectedMember?.gender}</span>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => caseData.affectedMember && navigate(`/members/${caseData.affectedMember.id}`)}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    View Member Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="contributions">Contributions</TabsTrigger>
            <TabsTrigger value="disbursements">Disbursements</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Case Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium mb-2">Summary</h3>
                    <p className="text-muted-foreground text-sm">
                      This is a {caseData.caseType.toLowerCase()} case for {caseData.affectedMember?.name}.
                      The case was created on {format(caseData.createdAt, 'MMMM d, yyyy')} and 
                      {caseData.isFinalized ? ' has been finalized.' : caseData.isActive ? ' is currently active.' : ' is in draft state.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium mb-2">Actions</h3>
                    <div className="space-y-2">
                      {!caseData.isFinalized && (
                        <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Case
                        </Button>
                      )}
                      {caseData.isActive && !caseData.isFinalized && (
                        <Button variant="outline" size="sm" className="w-full">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Finalize Case
                        </Button>
                      )}
                      {!caseData.isActive && !caseData.isFinalized && (
                        <Button variant="outline" size="sm" className="w-full">
                          <Clock className="h-4 w-4 mr-2" />
                          Activate Case
                        </Button>
                      )}
                      {caseData.isActive && !caseData.isFinalized && (
                        <Button variant="outline" size="sm" className="w-full text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                          <TimerOff className="h-4 w-4 mr-2" />
                          Suspend Case
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="contributions">
            <Card>
              <CardHeader>
                <CardTitle>Member Contributions</CardTitle>
                <CardDescription>Who has contributed to this case</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <p className="font-medium">All Members</p>
                    <p className="text-sm text-muted-foreground">Expected contribution: KES {caseData.contributionPerMember.toLocaleString()} per member</p>
                  </div>
                  <div>
                    <Button variant="outline" size="sm">
                      <Users className="h-4 w-4 mr-2" />
                      View All Members
                    </Button>
                  </div>
                </div>
                
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">Loading contribution data...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="disbursements">
            <Card>
              <CardHeader>
                <CardTitle>Disbursements</CardTitle>
                <CardDescription>Funds released to the beneficiary</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">No disbursements have been made yet.</p>
                  {caseData.isActive && !caseData.isFinalized && (
                    <Button variant="outline" size="sm" className="mt-4">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Record Disbursement
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CaseDetails;
