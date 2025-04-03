
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Restricted gender for dependants
enum RestrictedGender {
  MALE = "male",
  FEMALE = "female"
}

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

interface DependantCardProps {
  dependant: DependantFormData;
  index: number;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: string, value: any) => void;
}

const DependantCard = ({ dependant, index, onRemove, onUpdate }: DependantCardProps) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-medium">Dependant #{index + 1}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(dependant.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel htmlFor={`dependant-${index}-name`}>Name*</FormLabel>
            <Input
              id={`dependant-${index}-name`}
              value={dependant.name}
              onChange={(e) => onUpdate(dependant.id, 'name', e.target.value)}
              placeholder="Enter dependant name"
              className={cn(
                dependant.errors?.name && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {dependant.errors?.name && (
              <p className="text-sm font-medium text-destructive mt-1">
                {dependant.errors.name}
              </p>
            )}
          </div>

          <div>
            <FormLabel htmlFor={`dependant-${index}-gender`}>Gender*</FormLabel>
            <Select
              value={dependant.gender}
              onValueChange={(value) => onUpdate(dependant.id, 'gender', value)}
            >
              <SelectTrigger 
                id={`dependant-${index}-gender`}
                className={cn(
                  dependant.errors?.gender && "border-destructive focus-visible:ring-destructive"
                )}
              >
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RestrictedGender.MALE}>Male</SelectItem>
                <SelectItem value={RestrictedGender.FEMALE}>Female</SelectItem>
              </SelectContent>
            </Select>
            {dependant.errors?.gender && (
              <p className="text-sm font-medium text-destructive mt-1">
                {dependant.errors.gender}
              </p>
            )}
          </div>

          <div>
            <FormLabel htmlFor={`dependant-${index}-relationship`}>Relationship*</FormLabel>
            <Input
              id={`dependant-${index}-relationship`}
              value={dependant.relationship}
              onChange={(e) => onUpdate(dependant.id, 'relationship', e.target.value)}
              placeholder="E.g. Spouse, Child, etc."
              className={cn(
                dependant.errors?.relationship && "border-destructive focus-visible:ring-destructive"
              )}
            />
            {dependant.errors?.relationship && (
              <p className="text-sm font-medium text-destructive mt-1">
                {dependant.errors.relationship}
              </p>
            )}
          </div>

          <div>
            <FormLabel htmlFor={`dependant-${index}-dob`}>Date of Birth*</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id={`dependant-${index}-dob`}
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !dependant.dateOfBirth && "text-muted-foreground",
                    dependant.errors?.dateOfBirth && "border-destructive focus-visible:ring-destructive"
                  )}
                >
                  {dependant.dateOfBirth ? (
                    format(dependant.dateOfBirth, "PPP")
                  ) : (
                    <span>Pick a date</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dependant.dateOfBirth}
                  onSelect={(date) => onUpdate(dependant.id, 'dateOfBirth', date)}
                  disabled={(date) =>
                    date > new Date() || date < new Date("1900-01-01")
                  }
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {dependant.errors?.dateOfBirth && (
              <p className="text-sm font-medium text-destructive mt-1">
                {dependant.errors.dateOfBirth}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`dependant-${index}-disabled`}
                checked={dependant.isDisabled}
                onChange={(e) => onUpdate(dependant.id, 'isDisabled', e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary"
              />
              <FormLabel htmlFor={`dependant-${index}-disabled`} className="text-sm font-normal">
                Has disability
              </FormLabel>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DependantCard;
