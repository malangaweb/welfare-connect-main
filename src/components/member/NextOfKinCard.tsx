
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { NextOfKin } from '@/lib/types';

interface NextOfKinCardProps {
  nextOfKin: NextOfKin;
}

const NextOfKinCard = ({ nextOfKin }: NextOfKinCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next of Kin</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd className="font-medium">{nextOfKin.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Relationship</dt>
            <dd className="font-medium">{nextOfKin.relationship}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Phone Number</dt>
            <dd className="font-medium">{nextOfKin.phoneNumber}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

export default NextOfKinCard;
