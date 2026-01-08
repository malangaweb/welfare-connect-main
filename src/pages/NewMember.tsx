import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import MemberForm from '@/components/forms/MemberForm';
import { Button } from '@/components/ui/button';
import { supabase, supabaseAdmin } from '@/integrations/supabase/client';
import { UserRole } from '@/lib/types';

// Function to send SMS
const sendSMS = async (name: string, phoneNumber: string, memberNumber: string) => {
  try {
    const response = await fetch('https://siha.javanet.co.ke/send_notification.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        phone_number: phoneNumber,
        member_number: memberNumber,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send SMS:', response.statusText);
      return;
    }

    const result = await response.json();
    console.log('SMS API response:', result);
  } catch (error) {
    console.error('Error sending SMS:', error);
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
    console.log('Member data to submit:', data);
    
    try {
      // Get the residence name for this ID using service role client
      const { data: residenceData, error: residenceError } = await supabaseAdmin
        .from('residences')
        .select('name')
        .eq('id', data.residence)
        .single();
        
      if (residenceError) throw residenceError;
      
      // Create the member record using the database function
      const { data: memberData, error: memberError } = await supabase
        .rpc('insert_member', {
          p_member_number: data.memberNumber,
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
          p_wallet_balance: 0,
          p_is_active: true,
          p_registration_date: new Date().toISOString().split('T')[0]
        });
        
      if (memberError) {
        console.error('Error creating member:', memberError);
        throw memberError;
      }

      if (!memberData) {
        throw new Error('Failed to create member: No data returned');
      }

      console.log('Member created:', memberData);

      // Send welcome SMS if phone number is provided
      if (data.phoneNumber && data.name) {
        const name = String(data.name).trim();
        const phoneNumber = String(data.phoneNumber).trim();
        const memberNumber = String(data.memberNumber).trim();
        console.log('Sending SMS with:', { name, phoneNumber, memberNumber });
        if (name && phoneNumber && memberNumber) {
          await sendSMS(name, phoneNumber, memberNumber);
        }
      }

      // Create login credentials if provided
      if (data.credentials && data.credentials.username && data.credentials.password) {
        try {
          // First check if username already exists using service role client
          const { data: existingUser, error: checkError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('username', data.credentials.username);
            
          if (checkError) throw checkError;
          
          if (existingUser && existingUser.length > 0) {
            throw new Error('Username already exists. Please choose a different username.');
          }
          
          // Create user record in users table with password using service role client
          const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .insert({
              username: data.credentials.username,
              name: data.name,
              password: data.credentials.password, // In a real app, this would be hashed
              role: 'member',
              is_active: true,
              member_id: memberData.id
            })
            .select()
            .single();
            
          if (userError) throw userError;
          
          if (!userData) {
            throw new Error('Failed to create user account');
          }
        } catch (error) {
          console.error('Error creating user account:', error);
          // Don't throw, just log the error
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
