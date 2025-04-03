
import { User, Phone, MapPin, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Member } from '@/lib/types';
import { format } from 'date-fns';

interface MemberCardProps {
  member: Member;
  onClick?: () => void;
}

const MemberCard = ({ member, onClick }: MemberCardProps) => {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <Card 
      className={`overflow-hidden hover-lift ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex space-x-4">
            <Avatar className="h-12 w-12 border-2 border-primary/10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <h3 className="font-medium text-base flex items-center gap-1">
                {member.name}
                {member.isActive ? (
                  <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 hover:bg-green-100">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 bg-red-100 text-red-800 hover:bg-red-100">
                    Inactive
                  </Badge>
                )}
              </h3>
              
              <p className="text-sm text-muted-foreground">
                Member #{member.memberNumber}
              </p>
              
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{member.phoneNumber || 'N/A'}</span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{member.residence}</span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <User className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{member.gender}</span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{format(member.dateOfBirth, 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>
          </div>
          
          {onClick && (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        
        <div className="mt-4 flex justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Wallet Balance</p>
            <p className={`text-sm font-semibold ${member.walletBalance < 0 ? 'text-red-500' : 'text-green-500'}`}>
              KES {member.walletBalance.toLocaleString()}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dependants</p>
            <p className="text-sm font-semibold">
              {member.dependants.length}
            </p>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-1">Registration Date</p>
            <p className="text-sm font-semibold">
              {format(member.registrationDate, 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemberCard;
