
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';

interface CredentialsSectionProps {
  control: Control<any>;
  memberNumber: string;
  defaultChecked?: boolean;
}

const CredentialsSection = ({ control, memberNumber, defaultChecked = false }: CredentialsSectionProps) => {
  const [createCredentials, setCreateCredentials] = useState(defaultChecked);

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch 
          id="create-credentials" 
          checked={createCredentials}
          onCheckedChange={setCreateCredentials}
        />
        <label 
          htmlFor="create-credentials" 
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Create Login Credentials
        </label>
      </div>
      
      {createCredentials && (
        <div className="space-y-4 p-4 border rounded-md bg-muted/30">
          <FormField
            control={control}
            name="credentials.username"
            defaultValue={memberNumber}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Member ID as username" />
                </FormControl>
                <FormDescription>
                  The member ID will be used as the default username
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name="credentials.password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Admin Password (optional)</FormLabel>
                <FormControl>
                  <Input {...field} type="password" placeholder="Enter password" />
                </FormControl>
                <FormDescription>Only if this member is also an administrator</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="credentials.pin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Member Login PIN (6 digits)</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="password" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="e.g. 123456" 
                    onChange={e => field.onChange(e.target.value.replace(/\D/g, ''))}
                  />
                </FormControl>
                <FormDescription>Required for member self-service login</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default CredentialsSection;
