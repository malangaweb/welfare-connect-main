import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { fetchSafeSettings } from '@/lib/settingsClient';
import { generateMemberId } from '@/utils/idGenerators';
import PersonalInfoSection from './member/PersonalInfoSection';
import ResidenceSection from './member/ResidenceSection';
import NextOfKinSection from './member/NextOfKinSection';
import DependantsSection, { validateDependants } from './member/DependantsSection';
import RegistrationFeeSection from './member/RegistrationFeeSection';
import CredentialsSection from './member/CredentialsSection';

enum RestrictedGender {
  MALE = "male",
  FEMALE = "female"
}

const formSchema = z.object({
  memberNumber: z.string().min(1, 'Member number is required'),
  name: z.string().min(2, 'Name is required'),
  gender: z.nativeEnum(RestrictedGender, {
    errorMap: () => ({ message: 'Please select a gender' }),
  }),
  dateOfBirth: z.date({ required_error: 'Date of birth is required' }),
  nationalIdNumber: z.string().min(1, 'National ID is required'),
  phoneNumber: z.string().optional(),
  // Email is always optional; empty string is allowed
  emailAddress: z.string().email('Invalid email address').optional().or(z.literal('')),
  residence: z.string().min(1, 'Residence is required'),
  nextOfKin: z.object({
    name: z.string().min(1, 'Next of kin name is required'),
    relationship: z.string().min(1, 'Relationship is required'),
    phoneNumber: z.string().min(1, 'Phone number is required'),
  }),
  // Make registration fee optional in the schema so it doesn't block Edit Member
  registrationFee: z.number().min(0, 'Registration fee must be zero or positive').optional(),
  feeStatus: z.boolean().optional().default(false),
  credentials: z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    pin: z.string().min(6, 'PIN must be 6 digits').max(6).optional().or(z.literal('')),
  }).optional(),
});

interface MemberFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  isSubmitting?: boolean;
  isEditMode?: boolean;
}

const MemberForm = ({ onSubmit, initialData, isSubmitting = false, isEditMode = false }: MemberFormProps) => {
  const [dependants, setDependants] = useState(initialData?.dependants || []);
  const [defaultFee, setDefaultFee] = useState(500);
  const [isLoadingRegistrationFee, setIsLoadingRegistrationFee] = useState(!isEditMode);
  const [isLoadingMemberId, setIsLoadingMemberId] = useState(!initialData && !isEditMode);

  const form = useForm({
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
      nextOfKin: { name: '', relationship: '', phoneNumber: '' },
      registrationFee: defaultFee,
      feeStatus: false,
      credentials: { username: '', password: '', pin: '' },
    },
  });

  useEffect(() => {
    if (!isEditMode) {
      const loadRegistrationFee = async () => {
        try {
          const settings = await fetchSafeSettings();
          const fee = Number(settings?.registration_fee);
          if (Number.isFinite(fee) && fee >= 0) {
            setDefaultFee(fee);
            form.setValue('registrationFee', fee, { shouldValidate: false });
          }
        } catch (error) {
          console.error('Failed to load registration fee:', error);
        } finally {
          setIsLoadingRegistrationFee(false);
        }
      };

      void loadRegistrationFee();
    }
  }, [form, isEditMode]);

  // FIXED: Generate pure numeric member number (NO PREFIX)
  useEffect(() => {
    const getNextMemberId = async () => {
      if (!initialData && !isEditMode) {
        const currentValue = form.getValues().memberNumber;

        if (!currentValue || currentValue.includes("NaN")) {
          setIsLoadingMemberId(true);
          form.setValue("memberNumber", "");

          try {
            const nextId = await generateMemberId(); 
            const numValue = Number(nextId);

            if (!isNaN(numValue) && numValue > 0) {
              form.setValue("memberNumber", String(nextId), { shouldValidate: false });
            } else {
              console.error("Invalid generated member number:", nextId);
              form.setValue("memberNumber", "1");
            }
          } catch (err) {
            console.error("Member ID generation failed:", err);
            form.setValue("memberNumber", "1");
          } finally {
            setIsLoadingMemberId(false);
          }
        }
      }
    };

    getNextMemberId();
  }, [form, initialData, isEditMode]);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    if (dependants.length > 0 && !validateDependants(dependants, setDependants)) {
      return;
    }

    // For Edit Member, don't force or override registration fee;
    // for New Member, always use the current default fee.
    const submissionData = isEditMode
      ? {
          ...values,
          dependants,
        }
      : {
          ...values,
          registrationFee: defaultFee,
          dependants,
        };

    onSubmit(submissionData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8 pb-24 sm:pb-0">
        <div className="grid gap-6 md:grid-cols-2">
          <PersonalInfoSection control={form.control} isLoadingMemberId={isLoadingMemberId} />
          <ResidenceSection control={form.control} />
        </div>

        <NextOfKinSection control={form.control} />
        <DependantsSection dependants={dependants} onDependantsChange={setDependants} />
        {/* Hide registration fee section in Edit Member; it's optional there */}
        {!isEditMode && (
          <RegistrationFeeSection
            control={form.control}
            fee={defaultFee}
            isLoading={isLoadingRegistrationFee}
          />
        )}

        <div className="border-t pt-6">
          <h3 className="text-lg font-medium mb-4">Login Credentials</h3>
          <CredentialsSection control={form.control} memberNumber={form.watch("memberNumber")} />
        </div>

        <div className="sticky bottom-0 z-10 -mx-2 border-t bg-card/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:static sm:z-auto sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-4">
            <Button type="button" variant="outline" className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || isLoadingMemberId || isLoadingRegistrationFee}>
            {isSubmitting ? 'Registering...' : 'Register Member'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default MemberForm;
