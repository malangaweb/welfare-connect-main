
import { User, Phone, MapPin, Calendar, ChevronRight, Edit } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Member } from '@/lib/types';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';

interface MemberCardProps {
  member?: Member;
  onClick?: () => void;
  onEdit?: () => void;
  /** When true, shows skeleton loading state */
  isLoading?: boolean;
}

const MemberCard = ({ member, onClick, onEdit, isLoading }: MemberCardProps) => {
  const isMobile = useIsMobile();

  // Show skeleton when loading
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-2 sm:gap-4 min-w-0">
              <Skeleton className="h-10 sm:h-12 w-10 sm:w-12 rounded-full flex-shrink-0" />
              
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 sm:h-5 w-32 mb-2" />
                <Skeleton className="h-3 sm:h-4 w-20 mb-2" />
                
                {!isMobile && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Skeleton className="h-2 sm:h-3 w-20" />
                    <Skeleton className="h-2 sm:h-3 w-24" />
                  </div>
                )}
              </div>
            </div>
            
            <Skeleton className="h-4 sm:h-5 w-4 sm:w-5 flex-shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no member provided but not loading, render nothing or placeholder
  if (!member) {
    return null;
  }

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <Card 
      className={`overflow-hidden hover-lift ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-5">
        {/* Primary Row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex gap-2 sm:gap-4 min-w-0 flex-1">
            <Avatar className="h-10 sm:h-12 w-10 sm:w-12 border-2 border-primary/10 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                <h3 className="font-medium text-sm sm:text-base truncate">
                  {member.name}
                </h3>
                {member.isActive ? (
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-800 hover:bg-green-100 flex-shrink-0">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-red-100 text-red-800 hover:bg-red-100 flex-shrink-0">
                    Inactive
                  </Badge>
                )}
              </div>
              
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Member #{member.memberNumber}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEditClick}
                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
              >
                <Edit className="h-3 sm:h-4 w-3 sm:w-4" />
              </Button>
            )}
            {onClick && (
              <ChevronRight className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" />
            )}
          </div>
        </div>
        
        {/* Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="flex items-center text-xs text-muted-foreground gap-1 min-w-0">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{member.phoneNumber || 'N/A'}</span>
          </div>
          <div className="flex items-center text-xs text-muted-foreground gap-1 min-w-0">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{member.residence || 'N/A'}</span>
          </div>
          {!isMobile && (
            <>
              <div className="flex items-center text-xs text-muted-foreground gap-1 min-w-0">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{member.gender}</span>
              </div>
              <div className="flex items-center text-xs text-muted-foreground gap-1 min-w-0">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{format(member.dateOfBirth, 'MMM d, yyyy')}</span>
              </div>
            </>
          )}
        </div>
        
        {/* Bottom Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Wallet</p>
            <p className={`text-xs font-semibold ${member.walletBalance < 0 ? 'text-red-600' : member.walletBalance > 0 ? 'text-green-600' : 'text-slate-600'}`}>
              KES {(member.walletBalance / 1000).toFixed(1)}k
            </p>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Dependants</p>
            <p className="text-xs font-semibold text-slate-900">
              {member.dependants?.length || 0}
            </p>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Reg. Date</p>
            <p className="text-xs font-semibold text-slate-900">
              {format(member.registrationDate, 'MMM yy')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemberCard;
