import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import MemberForm from '@/components/forms/MemberForm';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/lib/types';
import { normalizeMemberNumber } from '@/lib/memberNumber';
import { createManagedUser } from '@/lib/adminUsersApi';
import { logSystemEvent } from '@/lib/systemLog';
import { invokeWithAppToken } from '@/lib/appAuth';

// Function to send SMS
const sendSMS = async (name: string, phoneNumber: string, memberNumber: string) => {
  try {
    const { error } = await invokeWithAppToken('send-sms', {
      phoneNumber,
      message: [
        `Malanga Welfare: Welcome ${name}.`,
        `Your member number is ${memberNumber}.`,
      ].join(' '),
    });

    if (error) {
      throw error;
    }

    await logSystemEvent({
      action: 'WELCOME_SMS_SENT',
      tableName: 'members',
      status: 'info',
      metadata: {
        name,
        phone_number: phoneNumber,
        member_number: memberNumber,
      },
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    await logSystemEvent({
      action: 'WELCOME_SMS_FAILED',
      tableName: 'members',
      status: 'warning',
      metadata: {
        name,
        phone_number: phoneNumber,
        member_number: memberNumber,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

// Format phone number to ensure it starts with +254
const formatPhoneNumber = (phone: string) => {
  if (!phone) return null;
  
  // Remove any spaces or special characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If number starts with 0, replace with +254
  if (cleaned.startsWith('0')) {
    cleaned = '+254' + cleaned.substring(1);
  }
  // If number starts with 254, add +
  else if (cleaned.startsWith('254')) {
    cleaned = '+' + cleaned;
  }
  // If number doesn't start with +, add it
  else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
};

const NewMember = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);

    try {
      const normalizedMemberNumber = normalizeMemberNumber(data.memberNumber);
      if (!normalizedMemberNumber) {
        throw new Error('Member number is required');
      }

      const { data: memberNumberTaken, error: memberNumberCheckError } = await (supabase as any).rpc('member_number_exists', {
        p_member_number: normalizedMemberNumber,
        p_exclude_member_id: null,
      });

      if (memberNumberCheckError) throw memberNumberCheckError;
      if (memberNumberTaken === true) {
        throw new Error(`Member number ${normalizedMemberNumber} already exists.`);
      }

      // Get the residence name for this ID
      const residenceResult = await (supabase
        .from('residences')
        .select('name')
        .eq('id', data.residence)
        .single() as unknown as { data: { name: string } | null; error: Error | null });
      const residenceData = residenceResult.data;
      const residenceError = residenceResult.error;

      if (residenceError) throw residenceError;

      if (!residenceData) {
        throw new Error('Residence not found');
      }

      // Create the member record using the database function
      const memberResult = await ((supabase as any)
        .rpc('insert_member', {
          p_member_number: normalizedMemberNumber,
          p_name: data.name,
          p_gender: data.gender,
          p_date_of_birth: data.dateOfBirth.toISOString().split('T')[0],
          p_national_id_number: data.nationalIdNumber,
          p_phone_number: data.phoneNumber || null,
          p_email_address: data.emailAddress || null,
          p_residence: residenceData.name,
          p_next_of_kin: {
            name: data.nextOfKin.name,
            relationship: data.nextOfKin.relationship,
            phoneNumber: data.nextOfKin.phoneNumber
          },
          p_dependants: (data.dependants || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            gender: d.gender,
            relationship: d.relationship,
            date_of_birth: d.dateOfBirth.toISOString().split('T')[0],
            is_disabled: d.isDisabled,
            is_eligible: true
          })),
          p_wallet_balance: 0,
          p_is_active: true,
          p_registration_date: new Date().toISOString().split('T')[0],
          p_pin: data.credentials?.pin || null
        }));
      const memberData = memberResult.data;
      const memberError = memberResult.error;
        
      if (memberError) {
        console.error('Error creating member:', memberError);
        throw memberError;
      }

      if (!memberData || !memberData.success) {
        throw new Error(memberData?.message || 'Failed to create member: No data returned');
      }

      await logSystemEvent({
        action: 'MEMBER_CREATED',
        tableName: 'members',
        status: 'info',
        recordId: memberData.id || null,
        metadata: {
          member_number: normalizedMemberNumber,
          name: data.name,
          residence: residenceData.name,
        },
      });

      // Send welcome SMS if phone number is provided
      if (data.phoneNumber && data.name) {
        const name = String(data.name).trim();
        const phoneNumber = String(data.phoneNumber).trim();
        const memberNumber = normalizedMemberNumber;
        if (name && phoneNumber && memberNumber) {
          await sendSMS(name, phoneNumber, memberNumber);
        }
      }

      // Create login credentials if provided
      if (data.credentials && data.credentials.username && data.credentials.password) {
        try {
          await createManagedUser({
            username: String(data.credentials.username),
            password: String(data.credentials.password),
            name: String(data.name),
            role: UserRole.MEMBER,
            is_active: true,
            member_id: String(memberData.id),
          });
          
        } catch (error) {
          console.error('Error creating user account:', error);
          // Don't throw, just log the error
        }
      }
      
      toast.success("Member registered successfully", {
        description: `${data.name} has been registered with member number ${normalizedMemberNumber}`,
      });
      
      navigate('/members');
    } catch (error: any) {
      console.error('Error registering member:', error);
      toast.error("Registration failed", {
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
