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
        console.log('Starting to fetch members...');

        // Get all members from Supabase with the same query structure as Members.tsx
        const { data: membersData, error: membersError } = await supabase
          .from('members')
          .select(`
            *,
            dependants (*)
          `);

        if (membersError) {
          console.error('Error fetching members:', membersError);
          throw membersError;
        }

        console.log('Members data:', membersData);

        // Map database members to the application Member model
        const mappedMembers = membersData.map(dbMember => {
          try {
            return mapDbMemberToMember(dbMember, dbMember.dependants || []);
          } catch (error) {
            console.error('Error mapping member:', dbMember, error);
            return null;
          }
        }).filter(Boolean) as Member[]; // Remove any null values from mapping errors

        console.log('Mapped members:', mappedMembers);

        if (!mappedMembers || mappedMembers.length === 0) {
          console.log('No members found in database');
          toast({
            title: "No Members Found",
            description: "There are no members in the system. Please add members first.",
          });
        }

        setMembers(mappedMembers);
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
      // Create the case directly in the cases table
      const { data: result, error } = await supabase
        .from('cases')
        .insert([
          {
            case_number: data.caseNumber,
            affected_member_id: data.affectedMemberId,
            case_type: data.caseType,
            expected_amount: data.contributionPerMember,
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

      if (error) {
        console.error('Error creating case:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to create case. Please try again.",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Case created successfully.",
      });

      // Send SMS notification for new case
      try {
        const affectedMember = members.find(m => m.id === result.affected_member_id);
        if (affectedMember) {
          const payload = {
            case_number: result.case_number,
            affected_member: affectedMember.name,
            residence: affectedMember.residence,
            member_number: affectedMember.memberNumber,
            amount: result.expected_amount,
            end_date: result.end_date,
          };
          console.log('Sending case SMS with:', payload);
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
