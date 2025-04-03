
import { format } from 'date-fns';
import { Member } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface PersonalDetailsCardProps {
  member: Member;
}

const PersonalDetailsCard = ({ member }: PersonalDetailsCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
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
