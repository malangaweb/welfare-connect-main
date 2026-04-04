
import { useState, useEffect } from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PlusCircle } from 'lucide-react';
import { Control } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import ResidenceForm from '../ResidenceForm';

interface Residence {
  id: string;
  name: string;
}

interface ResidenceSectionProps {
  control: Control<any>;
}

const ResidenceSection = ({ control }: ResidenceSectionProps) => {
  const [residences, setResidences] = useState<Residence[]>([]);
  const [isLoadingResidences, setIsLoadingResidences] = useState(true);
  const [refreshResidences, setRefreshResidences] = useState(0);

  useEffect(() => {
    const fetchResidences = async () => {
      setIsLoadingResidences(true);
      try {
        const { data, error } = await supabase
          .from('residences')
          .select('id, name')
          .order('name', { ascending: true });
          
        if (error) throw error;
        
        setResidences(data || []);
      } catch (error) {
        console.error('Error fetching residences:', error);
        toast({
          variant: "destructive",
          title: "Failed to load residences",
          description: "There was an error loading the residence data.",
        });
      } finally {
        setIsLoadingResidences(false);
      }
    };

    fetchResidences();
  }, [refreshResidences]);

  const handleResidenceAdded = () => {
    setRefreshResidences(prev => prev + 1);
  };

  return (
    <FormField
      control={control}
      name="residence"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Residence*</FormLabel>
          <div className="flex gap-2">
            <FormControl className="flex-1">
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger disabled={isLoadingResidences}>
                  <SelectValue placeholder={isLoadingResidences ? "Loading..." : "Select residence"} />
                </SelectTrigger>
                <SelectContent>
                  {residences.map((residence) => (
                    <SelectItem key={residence.id} value={residence.id}>
                      {residence.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon">
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Add New Residence Location</SheetTitle>
                </SheetHeader>
                <div className="py-6">
                  <ResidenceForm onSuccess={handleResidenceAdded} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default ResidenceSection;
