
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import DependantCard from './DependantCard';
import { toast } from '@/components/ui/use-toast';

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

interface DependantsSectionProps {
  dependants: DependantFormData[];
  onDependantsChange: (dependants: DependantFormData[]) => void;
}

// Define the validation function outside the component
const validateDependants = (dependants: DependantFormData[], onDependantsChange: (dependants: DependantFormData[]) => void): boolean => {
  let isValid = true;
  
  const validatedDependants = dependants.map(dep => {
    const errors: DependantFormData['errors'] = {};
    
    if (!dep.name.trim()) {
      errors.name = 'Name is required';
      isValid = false;
    }
    
    if (!dep.gender) {
      errors.gender = 'Gender is required';
      isValid = false;
    }
    
    if (!dep.relationship.trim()) {
      errors.relationship = 'Relationship is required';
      isValid = false;
    }
    
    if (!dep.dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required';
      isValid = false;
    }
    
    return { ...dep, errors };
  });
  
  onDependantsChange(validatedDependants);
  
  if (!isValid) {
    toast({
      title: "Validation Error",
      description: "Please fill in all required fields for dependants",
      variant: "destructive"
    });
  }
  
  return isValid;
};

const DependantsSection = ({ dependants, onDependantsChange }: DependantsSectionProps) => {
  const addDependant = () => {
    onDependantsChange([
      ...dependants,
      {
        id: crypto.randomUUID(),
        name: '',
        gender: RestrictedGender.MALE,
        relationship: '',
        dateOfBirth: new Date(),
        isDisabled: false,
        errors: {}
      },
    ]);
  };

  const removeDependant = (id: string) => {
    onDependantsChange(dependants.filter((dep) => dep.id !== id));
  };

  const updateDependant = (id: string, field: string, value: any) => {
    onDependantsChange(
      dependants.map((dep) => {
        if (dep.id === id) {
          // Clear the specific error when the field is updated
          const updatedErrors = dep.errors ? { ...dep.errors } : {};
          if (updatedErrors && field in updatedErrors) {
            delete updatedErrors[field as keyof typeof updatedErrors];
          }
          
          return { 
            ...dep, 
            [field]: value,
            errors: updatedErrors
          };
        }
        return dep;
      })
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Dependants</h3>
        <Button type="button" variant="outline" size="sm" onClick={addDependant}>
          <Plus className="h-4 w-4 mr-2" />
          Add Dependant
        </Button>
      </div>

      {dependants.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <p className="text-muted-foreground">No dependants added yet</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={addDependant}>
            <Plus className="h-4 w-4 mr-2" />
            Add Dependant
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {dependants.map((dependant, index) => (
            <DependantCard
              key={dependant.id}
              dependant={dependant}
              index={index}
              onRemove={removeDependant}
              onUpdate={updateDependant}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export { validateDependants };
export default DependantsSection;
