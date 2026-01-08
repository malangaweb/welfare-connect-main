import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { UserRole } from '@/lib/types';

const formSchema = z.object({
  memberNumber: z.string().min(1, 'Member number is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Please enter a valid email address'),
  role: z.enum([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
});

interface UserSetupFormProps {
  onSuccess: () => void;
}

const UserSetupForm = ({ onSuccess }: UserSetupFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberNumber: '',
      username: '',
      password: '',
      name: '',
      email: '',
      role: UserRole.ADMIN,
    },
  });

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const { data: memberRow, error: memberError } = await supabase
        .from('members')
        .select('id, member_number, name, is_active')
        .eq('member_number', values.memberNumber)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!memberRow) {
        throw new Error('No member found with that member number');
      }
      if (!memberRow.is_active) {
        throw new Error('That member record is inactive');
      }

      // Check if user already exists
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('username', values.username);
        
      if (checkError) throw checkError;
      
      if (existingUsers && existingUsers.length > 0) {
        throw new Error('Username already exists');
      }
      
      // Create new user with password
      const { data, error } = await supabase
        .from('users')
        .insert({
          username: values.username,
          name: values.name,
          email: values.email, // Store the email address
          password: values.password, // In a real app, this would be hashed
          role: values.role,
          is_active: true,
          member_id: memberRow.id,
        })
        .select()
        .single();
        
      if (error) throw error;
      
      form.reset();
      onSuccess();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: error.message || "There was an error creating the user.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pb-4">
        <FormField
          control={form.control}
          name="memberNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Member Number (link admin to member)</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input type="email" placeholder="john.doe@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="******" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={UserRole.ADMIN}>Administrator</SelectItem>
                  <SelectItem value={UserRole.SUPER_ADMIN}>Super Administrator</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-6 mt-6 border-t pt-4">
          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="min-w-[120px]"
            size="lg"
          >
            {isSubmitting ? 'Creating...' : 'Create Admin'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UserSetupForm;
