import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import CaseForm from '@/components/forms/CaseForm';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Member } from '@/lib/types';
import { mapDbMemberToMember } from '@/lib/db-types';

type CaseUpdate = Database["public"]["Tables"]["cases"]["Update"];

type DbCaseRow = Database["public"]["Tables"]["cases"]["Row"];

type DbMemberRow = Database["public"]["Tables"]["members"]["Row"];

const EditCase = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialData, setInitialData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setIsLoading(true);

        const { data: caseData, error: caseError } = await supabase
          .from('cases')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (caseError) throw caseError;
        if (!caseData) throw new Error('Case not found');

        const dbCase = caseData as DbCaseRow;

        // Get all members from Supabase with pagination to handle >1000 members
        const pageSize = 1000;
        let from = 0;
        let allMembersData: DbMemberRow[] = [];

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
              dependants,
              registration_date,
              is_active,
              wallet_balance
            `)
            .range(from, from + pageSize - 1);

          if (membersError) throw membersError;

          if (membersBatch && membersBatch.length > 0) {
            allMembersData = allMembersData.concat(membersBatch as DbMemberRow[]);
          }

          if (!membersBatch || membersBatch.length < pageSize) {
            break; // No more pages
          }

          from += pageSize;
        }

        // Fetch dependants from the dependants table
        const { data: dependantsData, error: dependantsError } = await (supabase as any)
          .from('dependants')
          .select('*');
        
        if (dependantsError) {
          console.error('Error fetching dependants:', dependantsError);
        }
        
        // Group dependants by member_id
        const dependantsByMember: Record<string, any[]> = {};
        if (dependantsData) {
          for (const dep of dependantsData) {
            if (!dependantsByMember[dep.member_id]) {
              dependantsByMember[dep.member_id] = [];
            }
            dependantsByMember[dep.member_id].push({
              id: dep.id,
              name: dep.name,
              gender: dep.gender,
              relationship: dep.relationship,
              dateOfBirth: dep.date_of_birth,
              isDisabled: dep.is_disabled || false,
              isEligible: dep.is_eligible || true,
            });
          }
        }

        // Map database members to the application Member model
        const mappedMembers = allMembersData.map(dbMember => {
          try {
            const memberDependants = dependantsByMember[dbMember.id] || [];
            return mapDbMemberToMember(dbMember as any, memberDependants as any);
          } catch (error) {
            console.error('Error mapping member:', dbMember, error);
            return null;
          }
        }).filter(Boolean) as Member[];

        const sortedMembers = mappedMembers.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(sortedMembers);

        const dependantId = dbCase.dependant_id && dbCase.dependant_id !== 'self'
          ? dbCase.dependant_id
          : undefined;

        setInitialData({
          caseNumber: dbCase.case_number,
          affectedMemberId: dbCase.affected_member_id,
          caseType: dbCase.case_type,
          dependantId,
          contributionPerMember: Number(dbCase.contribution_per_member || 0),
          startDate: dbCase.start_date ? new Date(dbCase.start_date) : new Date(),
          endDate: dbCase.end_date ? new Date(dbCase.end_date) : new Date(),
        });
      } catch (error) {
        console.error('Error loading case data:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load case details. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleSubmit = async (data: any) => {
    if (!id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const trimmedCaseNumber = String(data.caseNumber || '').trim();
      if (!trimmedCaseNumber) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Case number is required.',
        });
        return;
      }

      // Prevent duplicate case numbers (excluding current case)
      const { data: existingCase, error: existingError } = await supabase
        .from('cases')
        .select('id')
        .eq('case_number', trimmedCaseNumber)
        .neq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existingCase) {
        toast({
          variant: 'destructive',
          title: 'Duplicate Case Number',
          description: `Case number ${trimmedCaseNumber} already exists.`,
        });
        return;
      }

      const { count: memberCount, error: countError } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      const totalMembers = memberCount || 0;
      const expectedAmount = Number(data.contributionPerMember || 0) * totalMembers;
      const dependantId = data.dependantId === 'self' ? null : (data.dependantId || null);

      const caseUpdate: CaseUpdate = {
        case_number: trimmedCaseNumber,
        affected_member_id: data.affectedMemberId,
        case_type: data.caseType,
        dependant_id: dependantId,
        contribution_per_member: data.contributionPerMember,
        start_date: data.startDate,
        end_date: data.endDate,
        expected_amount: expectedAmount,
      };

      const { error: updateError } = await (supabase.from('cases') as any)
        .update(caseUpdate)
        .eq('id', id);

      if (updateError) throw updateError;

      toast({
        title: 'Case updated',
        description: `Case ${trimmedCaseNumber} has been updated successfully.`,
      });

      navigate(`/cases/${id}`);
    } catch (error: any) {
      console.error('Error updating case:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to update case',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate(`/cases/${id}`)} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Case
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Edit Case</h1>
            <p className="text-muted-foreground">Update case details</p>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6">
          {isLoading || !initialData ? (
            <div className="flex items-center justify-center p-8">
              <p>Loading case details...</p>
            </div>
          ) : (
            <CaseForm
              onSubmit={handleSubmit}
              members={members}
              initialData={initialData}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default EditCase;
