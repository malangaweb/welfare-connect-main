
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import MemberForm from '@/components/forms/MemberForm';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/lib/types';

const NewMember = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    console.log('Member data to submit:', data);
    
    try {
      // Get the residence name for this ID
      const { data: residenceData, error: residenceError } = await supabase
        .from('residences')
        .select('name')
        .eq('id', data.residence)
        .single();
        
      if (residenceError) throw residenceError;
      
      // Create the member record
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .insert({
          member_number: data.memberNumber,
          name: data.name,
          gender: data.gender,
          date_of_birth: data.dateOfBirth.toISOString().split('T')[0],
          national_id_number: data.nationalIdNumber,
          phone_number: data.phoneNumber || null,
          email_address: data.emailAddress || null,
          residence: residenceData.name, // Store the residence name, not the ID
          next_of_kin: {
            name: data.nextOfKin.name,
            relationship: data.nextOfKin.relationship,
            phoneNumber: data.nextOfKin.phoneNumber
          },
          wallet_balance: 0,
          is_active: true
        })
        .select()
        .single();
        
      if (memberError) throw memberError;
      
      console.log('Member created:', memberData);
      
      // Add dependants if any
      if (data.dependants && data.dependants.length > 0) {
        const dependantsToInsert = data.dependants.map((dep: any) => ({
          member_id: memberData.id,
          name: dep.name,
          gender: dep.gender,
          relationship: dep.relationship,
          date_of_birth: dep.dateOfBirth.toISOString().split('T')[0],
          is_disabled: dep.isDisabled,
          is_eligible: true // Default all dependants to eligible
        }));
        
        const { error: dependantsError } = await supabase
          .from('dependants')
          .insert(dependantsToInsert);
          
        if (dependantsError) throw dependantsError;
      }
      
      // Create login credentials if provided
      if (data.credentials && data.credentials.username && data.credentials.password) {
        // First check if username already exists
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('username', data.credentials.username);
          
        if (checkError) throw checkError;
        
        if (existingUser && existingUser.length > 0) {
          throw new Error('Username already exists. Please choose a different username.');
        }
        
        // Create user record
        const { data: userData, error: userError } = await supabase
          .from('users')
          .insert({
            username: data.credentials.username,
            name: data.name,
            role: UserRole.MEMBER,
            is_active: true,
            member_id: memberData.id
          })
          .select()
          .single();
          
        if (userError) throw userError;
        
        // Create credentials
        const { error: credError } = await supabase
          .from('user_credentials')
          .insert({
            user_id: userData.id,
            password: data.credentials.password, // In real app, this would be hashed
          });
          
        if (credError) throw credError;
      }
      
      // Create registration fee transaction if fee status is checked
      if (data.feeStatus && data.registrationFee && data.registrationFee > 0) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            member_id: memberData.id,
            amount: data.registrationFee,
            transaction_type: 'registration',
            description: 'Registration fee payment'
          });
          
        if (transactionError) {
          console.error('Error creating registration transaction:', transactionError);
          // Continue without failing the whole process
        }
        
        // Update member's wallet balance with the paid amount
        const { error: updateError } = await supabase
          .from('members')
          .update({ wallet_balance: data.registrationFee })
          .eq('id', memberData.id);
          
        if (updateError) {
          console.error('Error updating member wallet balance:', updateError);
        }
      }
      
      // Update member ID start in settings if this ID is higher than current start
      if (data.memberNumber.startsWith('M')) {
        const memberId = parseInt(data.memberNumber.substring(1));
        if (!isNaN(memberId)) {
          await supabase.rpc('update_member_id_start', { new_id: memberId + 1 });
        }
      }
      
      toast({
        title: "Member registered successfully",
        description: `${data.name} has been registered with member number ${data.memberNumber}`,
      });
      
      navigate('/members');
    } catch (error: any) {
      console.error('Error registering member:', error);
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "There was an error registering the member. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate('/members')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Members
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Register New Member</h1>
            <p className="text-muted-foreground">Add a new member to the organization</p>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6">
          <MemberForm 
            onSubmit={handleSubmit} 
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewMember;
