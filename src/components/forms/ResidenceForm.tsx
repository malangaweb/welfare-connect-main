
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
      toast({
        variant: "destructive",
        title: "Failed to add residence",
        description: "There was an error adding the residence. It might already exist.",
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
