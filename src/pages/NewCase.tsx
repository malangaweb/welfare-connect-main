
import { useState } from 'react';
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

  // Mock members for demo
  const mockMembers: Member[] = [
    {
      id: '1',
      memberNumber: 'M001',
      name: 'John Mwangi',
      gender: Gender.MALE,
      dateOfBirth: new Date('1985-04-12'),
      nationalIdNumber: '12345678',
      phoneNumber: '+254712345678',
      emailAddress: 'john.m@example.com',
      residence: 'Nakuru',
      nextOfKin: {
        name: 'Jane Mwangi',
        relationship: 'Spouse',
        phoneNumber: '+254712345679',
      },
      dependants: [
        {
          id: 'd1',
          name: 'James Mwangi',
          gender: Gender.MALE,
          relationship: 'Son',
          dateOfBirth: new Date('2010-01-15'),
          isDisabled: false,
          isEligible: true,
        },
      ],
      registrationDate: new Date('2022-01-15'),
      walletBalance: 2500,
      isActive: true,
    },
    {
      id: '2',
      memberNumber: 'M002',
      name: 'Sarah Kamau',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1990-07-22'),
      nationalIdNumber: '87654321',
      phoneNumber: '+254723456789',
      emailAddress: 'sarah.k@example.com',
      residence: 'Kisumu',
      nextOfKin: {
        name: 'Michael Kamau',
        relationship: 'Spouse',
        phoneNumber: '+254723456780',
      },
      dependants: [],
      registrationDate: new Date('2022-02-18'),
      walletBalance: -500,
      isActive: false,
    },
  ];

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    
    try {
      // In a real app, we would save the case to the database
      console.log('Case data to submit:', data);
      
      // Update case ID start in settings if this ID is higher than current start
      if (data.caseNumber.startsWith('C')) {
        const caseId = parseInt(data.caseNumber.substring(1));
        if (!isNaN(caseId)) {
          await supabase.rpc('update_case_id_start', { new_id: caseId + 1 });
        }
      }
      
      // Simulate successful submission
      setTimeout(() => {
        setIsSubmitting(false);
        toast({
          title: "Case created successfully",
          description: `Case ${data.caseNumber} has been created and is now active`,
        });
        navigate('/cases');
      }, 1000);
    } catch (error) {
      console.error('Error creating case:', error);
      setIsSubmitting(false);
      toast({
        variant: "destructive",
        title: "Case creation failed",
        description: "There was an error creating the case. Please try again.",
      });
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
          <CaseForm onSubmit={handleSubmit} members={mockMembers} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewCase;
