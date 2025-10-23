
import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

const formSchema = z.object({
  name: z.string().min(2, 'Residence name is required')
});

const ResidenceForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    
    try {
      // First, let's check if the residences table exists by trying to fetch from it
      const { error: testError } = await supabase
        .from('residences')
        .select('id')
        .limit(1);
        
      if (testError) {
        throw new Error(`Database error: ${testError.message}`);
      }
      
      // Check if a residence with this name already exists
      const { data: existingResidence, error: checkError } = await supabase
        .from('residences')
        .select('id, name')
        .eq('name', values.name)
        .single();
        
      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
        throw checkError;
      }
      
      if (existingResidence) {
        throw new Error('A residence with this name already exists.');
      }
      
      const { data, error } = await supabase
        .from('residences')
        .insert({ name: values.name })
        .select('id, name')
        .single();
        
      if (error) throw error;
      
      toast({
        title: "Residence added",
        description: `${values.name} has been added successfully`,
      });
      
      form.reset();
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error adding residence:', error);
      
      // Provide more specific error messages
      let errorMessage = "There was an error adding the residence.";
      
      if (error && typeof error === 'object' && 'message' in error) {
        const errorObj = error as any;
        if (errorObj.message?.includes('duplicate key')) {
          errorMessage = "A residence with this name already exists.";
        } else if (errorObj.message?.includes('relation "residences" does not exist')) {
          errorMessage = "The residences table does not exist. Please contact the administrator.";
        } else if (errorObj.message?.includes('permission denied')) {
          errorMessage = "You don't have permission to add residences.";
        } else {
          errorMessage = `Error: ${errorObj.message}`;
        }
      }
      
      toast({
        variant: "destructive",
        title: "Failed to add residence",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Residence Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter residence name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          <Plus className="h-4 w-4 mr-2" />
          Add Residence
        </Button>
      </form>
    </Form>
  );
};

export default ResidenceForm;
