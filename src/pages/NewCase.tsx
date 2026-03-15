import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import CaseForm from '@/components/forms/CaseForm';
import { Button } from '@/components/ui/button';
import { Gender, Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { mapDbMemberToMember } from '@/lib/db-types';

const NewCase = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setIsLoading(true);

        // Get all members from Supabase with pagination to handle >1000 members
        const pageSize = 1000;
        let from = 0;
        let allMembersData: any[] = [];
        
        while (true) {
          const { data: membersBatch, error: membersError } = await supabase
            .from('members')
            .select(`
              id,
              member_number,
              name,
              gender,
              date_of_birth,
              national_id_number,
              phone_number,
              email_address,
              residence,
              next_of_kin,
              registration_date,
              is_active,
              wallet_balance
            `)
            .range(from, from + pageSize - 1);

          if (membersError) {
            console.error('Error fetching members batch:', membersError);
            throw membersError;
          }

          if (membersBatch && membersBatch.length > 0) {
            allMembersData = allMembersData.concat(membersBatch);
          }

          if (!membersBatch || membersBatch.length < pageSize) {
            break; // No more pages
          }
          
          from += pageSize;
        }

        // Extract dependants from members data (stored as JSONB in the members table)
        const dependantsByMember: Record<string, any[]> = {};
        if (allMembersData) {
          for (const member of allMembersData) {
            const dependants = member.dependants as any[] || [];
            dependantsByMember[member.id] = dependants;
          }
        }

        // Map database members to the application Member model
        const mappedMembers = allMembersData.map(dbMember => {
          try {
            const memberDependants = dependantsByMember[dbMember.id] || [];
            const mapped = mapDbMemberToMember(dbMember, memberDependants);
            return mapped;
          } catch (error) {
            console.error('Error mapping member:', dbMember, error);
            console.error('Member ID:', dbMember.id, 'Name:', dbMember.name);
            console.error('Member data:', JSON.stringify(dbMember, null, 2));
            return null;
          }
        }).filter(Boolean) as Member[]; // Remove any null values from mapping errors

        if (!mappedMembers || mappedMembers.length === 0) {
          toast({
            title: "No Members Found",
            description: "There are no members in the system. Please add members first.",
          });
        } else {
          // Sort members alphabetically by name
          const sortedMembers = mappedMembers.sort((a, b) => a.name.localeCompare(b.name));
          setMembers(sortedMembers);
        }
      } catch (error) {
        console.error('Error in fetchMembers:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load members. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, []);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    
    try {
      // Get total member count for calculation
      const { count: memberCount, error: countError } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting member count:', countError);
        throw countError;
      }

      const totalMembers = memberCount || 0;
      const totalContribution = data.contributionPerMember * totalMembers;

      // Create the case directly in the cases table
      const { data: result, error } = await supabase
        .from('cases')
        // @ts-ignore - Supabase type inference issue
        .insert([
          {
            case_number: data.caseNumber,
            affected_member_id: data.affectedMemberId,
            case_type: data.caseType,
            expected_amount: totalContribution,
            contribution_per_member: data.contributionPerMember,
            start_date: data.startDate,
            end_date: data.endDate,
            is_active: true,
            is_finalized: false,
            actual_amount: 0,
            dependant_id: data.dependantId || null
          }
        ])
        .select()
        .single();

      if (error || !result) {
        console.error('Error creating case:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error?.message || "Failed to create case. Please try again.",
        });
        return;
      }

      const caseResult = result as any;

      // Get all members for automatic deduction (with pagination to handle >1000 members)
      const pageSize = 1000;
      let from = 0;
      let allMembers: any[] = [];
      
      while (true) {
        const { data: membersBatch, error: membersError } = await supabase
          .from('members')
          .select('id, name, member_number')
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

      // Create contribution transactions for all members (batch in pages to avoid large single insert limits)
      const contributionTransactions = allMembers.map(member => ({
        member_id: member.id,
        amount: -data.contributionPerMember, // Negative amount for deduction
        transaction_type: 'contribution',
        mpesa_reference: null,
        description: `Contribution for Case #${data.caseNumber} - ${data.caseType}`,
        created_at: new Date().toISOString(),
      }));

      // Insert in batches of 1000 to avoid payload limits
      const batchSize = 1000;
      for (let i = 0; i < contributionTransactions.length; i += batchSize) {
        const batch = contributionTransactions.slice(i, i + batchSize);
        const { error: transactionError } = await supabase
          .from('transactions')
          // @ts-ignore - Supabase type inference issue
          .insert(batch);
        if (transactionError) {
          console.error('Error creating contribution transactions:', transactionError);
          // Rollback the case creation
          await supabase
            .from('cases')
            .delete()
            .eq('id', caseResult.id);
          throw transactionError;
        }
      }

      // All batches inserted successfully

      // Update case actual_amount to align with actually paid (sum of inserted transactions)
      const totalCollected = contributionTransactions.reduce((sum, t) => sum + (t.amount < 0 ? -t.amount : t.amount), 0);
      const { error: updateCaseError } = await supabase
        .from('cases')
        // @ts-ignore - Supabase type inference issue
        .update({ actual_amount: totalCollected })
        .eq('id', caseResult.id);

      if (updateCaseError) {
        console.error('Error updating case actual_amount:', updateCaseError);
        throw updateCaseError;
      }

      toast({
        title: "Success",
        description: `Case created successfully. KES ${data.contributionPerMember.toLocaleString()} deducted from ${totalMembers} members' wallets.`,
      });

      // Send SMS notification for new case
      try {
        const affectedMember = members.find(m => m.id === caseResult.affected_member_id);
        if (affectedMember) {
          const payload = {
            case_number: caseResult.case_number,
            affected_member: affectedMember.name,
            residence: affectedMember.residence,
            member_number: affectedMember.memberNumber,
            amount: caseResult.expected_amount,
            end_date: caseResult.end_date,
          };
          if (
            payload.case_number &&
            payload.affected_member &&
            payload.residence &&
            payload.member_number &&
            payload.amount &&
            payload.end_date
          ) {
            await fetch('https://siha.javanet.co.ke/send_case_sms.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
        }
      } catch (smsError) {
        console.error('Error sending case SMS:', smsError);
      }

      navigate('/cases');
    } catch (error) {
      console.error('Error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
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
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <p>Loading members...</p>
            </div>
          ) : (
            <CaseForm onSubmit={handleSubmit} members={members} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewCase;
