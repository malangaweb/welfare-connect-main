
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CaseType, Member, Dependant } from '@/lib/types';
import { generateCaseId } from '@/utils/idGenerators';
import { Skeleton } from '@/components/ui/skeleton';

const formSchema = z.object({
  caseNumber: z.string().min(1, 'Case number is required'),
  affectedMemberId: z.string().min(1, 'Affected member is required'),
  caseType: z.nativeEnum(CaseType, {
    errorMap: () => ({ message: 'Please select a case type' }),
  }),
  dependantId: z.string().optional(),
  contributionPerMember: z.number().min(1, 'Contribution amount is required'),
  startDate: z.date({
    required_error: 'Start date is required',
  }),
  endDate: z.date({
    required_error: 'End date is required',
  }).refine(date => date > new Date(), {
    message: 'End date must be in the future',
  }),
});

interface CaseFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  members: Member[];
}

const CaseForm = ({ onSubmit, initialData, members }: CaseFormProps) => {
  const [isLoadingCaseId, setIsLoadingCaseId] = useState(!initialData);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      caseNumber: '',
      affectedMemberId: '',
      caseType: undefined,
      dependantId: '',
      contributionPerMember: 0,
      startDate: new Date(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 14)),
    },
  });

  // Get next case ID
  useEffect(() => {
    const getNextCaseId = async () => {
      if (!initialData && form.getValues().caseNumber === '') {
        setIsLoadingCaseId(true);
        try {
          const nextId = await generateCaseId();
          form.setValue('caseNumber', nextId);
        } catch (error) {
          console.error('Error generating case ID:', error);
        } finally {
          setIsLoadingCaseId(false);
        }
      }
    };
    
    getNextCaseId();
  }, [form, initialData]);

  const selectedMemberId = form.watch('affectedMemberId');
  const selectedMember = members.find(m => m.id === selectedMemberId);
  
  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
  };

  const getDependantsOptions = () => {
    if (!selectedMember) return [];
    return selectedMember.dependants;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="caseNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Case Number*</FormLabel>
                <FormControl>
                  {isLoadingCaseId ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Input placeholder="Enter case number" {...field} />
                  )}
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Auto-generated, but can be edited if needed
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="caseType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Case Type*</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select case type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={CaseType.EDUCATION}>Education</SelectItem>
                    <SelectItem value={CaseType.SICKNESS}>Sickness</SelectItem>
                    <SelectItem value={CaseType.DEATH}>Death</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="affectedMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Affected Member*</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} (#{member.memberNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dependantId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Affected Dependant</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={!selectedMember || getDependantsOptions().length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedMember ? "Select dependant or self" : "Select a member first"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="self">Self (Member)</SelectItem>
                    {getDependantsOptions().map((dependant: Dependant) => (
                      <SelectItem key={dependant.id} value={dependant.id}>
                        {dependant.name} ({dependant.relationship})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contributionPerMember"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contribution Per Member (KES)*</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="Enter amount" 
                    {...field} 
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date*</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date*</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      fromDate={form.watch('startDate') || new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end space-x-4 mt-8">
          <Button type="button" variant="outline">Cancel</Button>
          <Button type="submit" disabled={isLoadingCaseId}>
            Create Case
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CaseForm;
