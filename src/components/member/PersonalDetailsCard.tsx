
import { format } from 'date-fns';
import { Edit } from 'lucide-react';
import { Member } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PersonalDetailsCardProps {
  member: Member;
  onEdit?: () => void;
}

const PersonalDetailsCard = ({ member, onEdit }: PersonalDetailsCardProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Personal Information</CardTitle>
        {onEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="h-8"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Full Name</dt>
            <dd className="font-medium">{member.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Gender</dt>
            <dd className="font-medium">{member.gender}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Date of Birth</dt>
            <dd className="font-medium">{format(member.dateOfBirth, 'MMMM d, yyyy')}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">National ID</dt>
            <dd className="font-medium">{member.nationalIdNumber}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Phone Number</dt>
            <dd className="font-medium">{member.phoneNumber || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Email Address</dt>
            <dd className="font-medium">{member.emailAddress || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Residence</dt>
            <dd className="font-medium">{member.residence}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Registration Date</dt>
            <dd className="font-medium">{format(member.registrationDate, 'MMMM d, yyyy')}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

export default PersonalDetailsCard;
