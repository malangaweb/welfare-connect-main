
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Control } from 'react-hook-form';

// Next of kin relationship options
const relationshipOptions = [
  "Spouse", "Child", "Father", "Mother", "Cousin", "Niece", "Friend", "Other"
];

interface NextOfKinSectionProps {
  control: Control<any>;
}

const NextOfKinSection = ({ control }: NextOfKinSectionProps) => {
  return (
    <div className="bg-accent/40 p-5 rounded-lg">
      <h3 className="text-lg font-medium mb-4">Next of Kin Information</h3>
      <div className="grid gap-6 md:grid-cols-3">
        <FormField
          control={control}
          name="nextOfKin.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name*</FormLabel>
              <FormControl>
                <Input placeholder="Enter next of kin name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="nextOfKin.relationship"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relationship*</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipOptions.map((relationship) => (
                      <SelectItem key={relationship} value={relationship.toLowerCase()}>
                        {relationship}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="nextOfKin.phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number*</FormLabel>
              <FormControl>
                <Input placeholder="Enter phone number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};

export default NextOfKinSection;
