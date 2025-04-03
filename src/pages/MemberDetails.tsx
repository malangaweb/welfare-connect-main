import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { DbMember, DbDependant, mapDbMemberToMember } from '@/lib/db-types';

// Import refactored components
import MemberProfileCard from '@/components/member/MemberProfileCard';
import WalletCard from '@/components/member/WalletCard';
import PersonalDetailsCard from '@/components/member/PersonalDetailsCard';
import NextOfKinCard from '@/components/member/NextOfKinCard';
import DependantsList from '@/components/member/DependantsList';
import CasesTab from '@/components/member/CasesTab';
import MemberDetailsLoading from '@/components/member/MemberDetailsLoading';
import MemberDetailsError from '@/components/member/MemberDetailsError';

const MemberDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  useEffect(() => {
    const fetchMember = async () => {
      if (!id) {
        setError("Member ID is required");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        console.log('Fetching member with ID:', id);
        
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (memberError) {
          console.error('Error fetching member:', memberError);
          throw memberError;
        }
        
        if (!memberData) {
          throw new Error('Member not found');
        }
        
        const { data: dependantsData, error: dependantsError } = await supabase
          .from('dependants')
          .select('*')
          .eq('member_id', id);

        if (dependantsError) {
          console.error('Error fetching dependants:', dependantsError);
          throw dependantsError;
        }
        
        console.log('Member data:', memberData);
        console.log('Dependants data:', dependantsData);
        
        const dbMember = memberData as DbMember;
        const dependants = dependantsData as DbDependant[] || [];
        const memberWithDependants = mapDbMemberToMember(dbMember, dependants);
        
        setMember(memberWithDependants);
      } catch (error) {
        console.error('Error in fetchMember:', error);
        setError(error instanceof Error ? error.message : 'Failed to load member details');
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load member details.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [id, navigate]);

  const handleAddDependant = () => {
    // This would typically navigate to a form or open a modal
    toast({
      title: "Add Dependant",
      description: "This functionality is not implemented yet.",
    });
  };

  const handleViewTransactions = () => {
    // Navigate to transactions view filtered for this member
    navigate(`/transactions?memberId=${id}`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <MemberDetailsLoading onBack={() => navigate('/members')} />
      </DashboardLayout>
    );
  }

  if (error || !member) {
    return (
      <DashboardLayout>
        <MemberDetailsError error={error} onBack={() => navigate('/members')} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate('/members')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Members
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Member Details</h1>
            <p className="text-muted-foreground">View and manage member information</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3">
            <MemberProfileCard member={member} />
            <WalletCard 
              balance={member.walletBalance} 
              onViewTransactions={handleViewTransactions}
            />
          </div>
          
          <div className="md:w-2/3">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Personal Details</TabsTrigger>
                <TabsTrigger value="dependants">Dependants</TabsTrigger>
                <TabsTrigger value="cases">Cases</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-6">
                <PersonalDetailsCard member={member} />
                <NextOfKinCard nextOfKin={member.nextOfKin} />
              </TabsContent>
              
              <TabsContent value="dependants">
                <DependantsList 
                  dependants={member.dependants}
                  onAddDependant={handleAddDependant}
                />
              </TabsContent>
              
              <TabsContent value="cases">
                <CasesTab />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MemberDetails;
