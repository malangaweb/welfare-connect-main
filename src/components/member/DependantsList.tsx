
import { format } from 'date-fns';
import { Users, PlusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dependant } from '@/lib/types';

interface DependantsListProps {
  dependants: Dependant[];
  onAddDependant: () => void;
}

const DependantsList = ({ dependants, onAddDependant }: DependantsListProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Dependants</CardTitle>
        <Button variant="outline" size="sm" onClick={onAddDependant}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Add Dependant
        </Button>
      </CardHeader>
      <CardContent>
        {dependants.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-muted-foreground">No dependants registered</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onAddDependant}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Dependant
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {dependants.map((dependant) => (
              <div key={dependant.id} className="border rounded-lg p-4 hover:bg-secondary/20 transition-colors">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">{dependant.name}</h4>
                    <p className="text-sm text-muted-foreground">{dependant.relationship}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">
                      {dependant.gender}
                    </Badge>
                    {dependant.isDisabled && (
                      <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  <span>DOB: {format(dependant.dateOfBirth, 'MMM d, yyyy')}</span>
                  <span className="mx-2">•</span>
                  <span>Age: {new Date().getFullYear() - dependant.dateOfBirth.getFullYear()}</span>
                  <span className="mx-2">•</span>
                  <span>Status: {dependant.isEligible ? 'Eligible' : 'Not Eligible'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DependantsList;
