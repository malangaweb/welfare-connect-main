
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Control } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';

interface RegistrationFeeSectionProps {
  control: Control<any>;
  fee: number;
  isLoading: boolean;
}

const RegistrationFeeSection = ({ control, fee, isLoading }: RegistrationFeeSectionProps) => {
  return (
    <div className="bg-primary/5 p-5 rounded-lg space-y-4">
      <h3 className="text-lg font-medium mb-4">Registration Payment</h3>
      
      <FormField
        control={control}
        name="registrationFee"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Registration Fee (KES)*</FormLabel>
            <FormControl>
              <Input 
                type="number" 
                {...field} 
                value={isLoading ? '' : fee}
                readOnly
                className="bg-muted cursor-not-allowed"
                placeholder={isLoading ? "Loading..." : `KES ${fee}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="feeStatus"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>
                Fee Payment Status
              </FormLabel>
              <p className="text-sm text-muted-foreground">
                Check this if the registration fee has been paid
              </p>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
};

export default RegistrationFeeSection;
