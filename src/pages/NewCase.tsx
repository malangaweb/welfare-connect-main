import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import CaseForm from '@/components/forms/CaseForm';
import { Button } from '@/components/ui/button';
import { Gender, Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

const NewCase = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const { data, error } = await supabase
          .from('members')
          .select('*');

        if (error) {
          console.error('Error fetching members:', error);
          throw error;
        }

        console.log('Fetched members:', data); // Debug log
        setMembers(data);
      } catch (error) {
        console.error('Error in fetchMembers:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load members. Please try again.",
        });
      }
    };

    fetchMembers();
  }, []);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    console.log('Starting case creation with data:', data);
    
    try {
      // 1. Get all members first to calculate expected amount
      console.log('Fetching members...');
      const { data: allMembers, error: membersError } = await supabase
        .from('members')
        .select('id, wallet_balance');

      if (membersError) {
        console.error('Error fetching members:', membersError);
        throw new Error(`Failed to fetch members: ${membersError.message}`);
      }

      // Calculate expected amount
      const expectedAmount = data.contributionPerMember * allMembers.length;
      console.log('Expected amount:', expectedAmount);

      // 2. Create the case with expected_amount
      console.log('Creating case...');
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .insert([
          {
            case_number: data.caseNumber,
            affected_member_id: data.affectedMemberId,
            dependant_id: data.dependantId || null,
            case_type: data.caseType,
            contribution_per_member: data.contributionPerMember,
            expected_amount: expectedAmount,
            start_date: data.startDate.toISOString(),
            end_date: data.endDate.toISOString(),
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (caseError) {
        console.error('Error creating case:', caseError);
        throw new Error(`Failed to create case: ${caseError.message}`);
      }

      console.log('Case created successfully:', caseData);

      // 3. Process each member
      for (const member of allMembers) {
        console.log(`Processing member ${member.id}...`);

        // Calculate new balance
        const currentBalance = member.wallet_balance || 0;
        const newBalance = currentBalance - data.contributionPerMember;

        // Create transaction record
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            member_id: member.id,
            amount: -data.contributionPerMember, // Negative amount for deduction
            transaction_type: 'case_contribution',
            description: `Contribution for case: ${data.caseNumber}`,
            created_at: new Date().toISOString(),
          });

        if (transactionError) {
          console.error(`Error creating transaction for member ${member.id}:`, transactionError);
          throw new Error(`Failed to create transaction for member ${member.id}: ${transactionError.message}`);
        }

        // Update member's wallet balance
        const { error: updateError } = await supabase
          .from('members')
          .update({ wallet_balance: newBalance })
          .eq('id', member.id);

        if (updateError) {
          console.error(`Error updating wallet for member ${member.id}:`, updateError);
          throw new Error(`Failed to update wallet for member ${member.id}: ${updateError.message}`);
        }

        console.log(`Updated balance for member ${member.id}:`, newBalance);
      }

      toast({
        title: "Case created successfully",
        description: `Case ${data.caseNumber} has been created and contributions have been deducted from all members`,
      });
      navigate('/cases');
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast({
        variant: "destructive",
        title: "Case creation failed",
        description: error instanceof Error ? error.message : "There was an error creating the case. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate('/cases')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Cases
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Create New Case</h1>
            <p className="text-muted-foreground">Start a new welfare case</p>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <CaseForm onSubmit={handleSubmit} members={members} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewCase;
