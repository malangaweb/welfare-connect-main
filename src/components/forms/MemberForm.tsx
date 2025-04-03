
import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { generateMemberId } from '@/utils/idGenerators';

// Import the components
import PersonalInfoSection from './member/PersonalInfoSection';
import ResidenceSection from './member/ResidenceSection';
import NextOfKinSection from './member/NextOfKinSection';
import DependantsSection, { validateDependants } from './member/DependantsSection';
import RegistrationFeeSection from './member/RegistrationFeeSection';
import CredentialsSection from './member/CredentialsSection';

// Modify the Gender enum to only include MALE and FEMALE
enum RestrictedGender {
  MALE = "male",
  FEMALE = "female"
}

// Form schema definition
const formSchema = z.object({
  memberNumber: z.string().min(1, 'Member number is required'),
  name: z.string().min(2, 'Name is required'),
  gender: z.nativeEnum(RestrictedGender, {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
  dateOfBirth: z.date({
    required_error: 'Date of birth is required',
  }),
  nationalIdNumber: z.string().min(1, 'National ID is required'),
  phoneNumber: z.string().optional(),
  emailAddress: z.string().email('Invalid email address').optional().or(z.literal('')),
  residence: z.string().min(1, 'Residence is required'),
  nextOfKin: z.object({
    name: z.string().min(1, 'Next of kin name is required'),
    relationship: z.string().min(1, 'Relationship is required'),
    phoneNumber: z.string().min(1, 'Phone number is required'),
  }),
  registrationFee: z.number().min(0, 'Registration fee is required'),
  feeStatus: z.boolean().optional().default(false),
  credentials: z.object({
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
});

interface DependantFormData {
  id: string;
  name: string;
  gender: RestrictedGender;
  relationship: string;
  dateOfBirth: Date;
  isDisabled: boolean;
  errors?: {
    name?: string;
    gender?: string;
    relationship?: string;
    dateOfBirth?: string;
  };
}

interface MemberFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  isSubmitting?: boolean;
}

const MemberForm = ({ onSubmit, initialData, isSubmitting = false }: MemberFormProps) => {
  const [dependants, setDependants] = useState<DependantFormData[]>(initialData?.dependants || []);
  const [defaultFee, setDefaultFee] = useState(500);
  const [isLoadingMemberId, setIsLoadingMemberId] = useState(!initialData);

  // Fetch default fee from settings
  useEffect(() => {
    const fetchDefaultFee = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('registration_fee')
          .limit(1)
          .maybeSingle();
          
        if (error) throw error;
        
        if (data && data.registration_fee) {
          setDefaultFee(Number(data.registration_fee));
        }
      } catch (error) {
        console.error('Error fetching default registration fee:', error);
      }
    };

    fetchDefaultFee();
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      memberNumber: '',
      name: '',
      gender: undefined,
      dateOfBirth: undefined,
      nationalIdNumber: '',
      phoneNumber: '',
      emailAddress: '',
      residence: '',
      nextOfKin: {
        name: '',
        relationship: '',
        phoneNumber: '',
      },
      registrationFee: defaultFee,
      feeStatus: false,
      credentials: {
        username: '',
        password: '',
      },
    },
  });

  // Get next member ID
  useEffect(() => {
    const getNextMemberId = async () => {
      if (!initialData && form.getValues().memberNumber === '') {
        setIsLoadingMemberId(true);
        try {
          const nextId = await generateMemberId();
          form.setValue('memberNumber', nextId);
        } catch (error) {
          console.error('Error generating member ID:', error);
        } finally {
          setIsLoadingMemberId(false);
        }
      }
    };
    
    getNextMemberId();
  }, [form, initialData]);

  // Update the registration fee when the default fee is fetched
  useEffect(() => {
    form.setValue('registrationFee', defaultFee);
  }, [defaultFee, form]);

  useEffect(() => {
    // Set default residence to Malanga if available and no residence is selected
    const setDefaultResidence = async () => {
      if (!form.getValues().residence) {
        try {
          const { data, error } = await supabase
            .from('residences')
            .select('id, name')
            .order('name', { ascending: true });
            
          if (error) throw error;
          
          if (data && data.length > 0) {
            const malanga = data.find(r => r.name === 'Malanga');
            if (malanga) {
              form.setValue('residence', malanga.id);
            } else if (data[0]) {
              form.setValue('residence', data[0].id);
            }
          }
        } catch (error) {
          console.error('Error fetching residences for default:', error);
        }
      }
    };

    setDefaultResidence();
  }, [form]);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    // Validate dependants before submission
    if (dependants.length > 0 && !validateDependants(dependants, setDependants)) {
      return;
    }
    
    // Always use the default fee from settings
    const submissionData = {
      ...values,
      registrationFee: defaultFee,
      dependants,
    };
    
    onSubmit(submissionData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <PersonalInfoSection 
            control={form.control} 
            isLoadingMemberId={isLoadingMemberId} 
          />
          <ResidenceSection control={form.control} />
        </div>

        <NextOfKinSection control={form.control} />
        
        <DependantsSection 
          dependants={dependants} 
          onDependantsChange={setDependants}
        />

        <RegistrationFeeSection control={form.control} />
        
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium mb-4">Login Credentials</h3>
          <CredentialsSection 
            control={form.control} 
            memberNumber={form.watch('memberNumber')}
          />
        </div>

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline">Cancel</Button>
          <Button type="submit" disabled={isSubmitting || isLoadingMemberId}>
            {isSubmitting ? 'Registering...' : 'Register Member'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default MemberForm;
