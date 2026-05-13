
import { useState } from 'react';
import { Edit, UserMinus, UserCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Member } from '@/lib/types';
import { toast } from '@/components/ui/use-toast';
import { MemberStatusBadge } from '@/components/members/MemberStatusBadge';
import { invokeWithAppToken } from '@/lib/appAuth';

interface MemberProfileCardProps {
  member: Member;
  onRefresh?: () => Promise<void> | void;
  onEdit?: () => void;
}

const MemberProfileCard = ({ member, onRefresh, onEdit }: MemberProfileCardProps) => {
  const [isDeactivating, setIsDeactivating] = useState(false);
  const isInactive = String(member.status || '').toLowerCase() === 'inactive';
  const nextStatus = isInactive ? 'active' : 'inactive';

  const handleStatusChange = async () => {
    try {
      setIsDeactivating(true);
      await invokeWithAppToken('api-member-status-update', {
        member_id: member.id,
        status: nextStatus,
      });
      
      toast({
        title: isInactive ? "Member Reactivated" : "Member Deactivated",
        description: `${member.name} has been ${isInactive ? "reactivated" : "deactivated"} successfully.`,
      });
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update member status.",
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center">
          <Avatar className="h-24 w-24 border-4 border-primary/10 mb-4">
            <AvatarFallback className="bg-primary/10 text-primary text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <h2 className="text-2xl font-bold">{member.name}</h2>
          <p className="text-muted-foreground">Member #{member.memberNumber}</p>
          
          <div className="mt-2">
            <MemberStatusBadge member={member} />
          </div>
          
          <div className="mt-6 flex flex-col gap-2 w-full">
            <Button onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
            {!isInactive ? (
              <Button 
                variant="outline" 
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={handleStatusChange}
                disabled={isDeactivating}
              >
                <UserMinus className="h-4 w-4 mr-2" />
                {isDeactivating ? "Deactivating..." : "Deactivate Member"}
              </Button>
            ) : (
              <Button 
                variant="outline" 
                className="text-green-500 hover:text-green-600 hover:bg-green-50"
                onClick={handleStatusChange}
                disabled={isDeactivating}
              >
                <UserCog className="h-4 w-4 mr-2" />
                {isDeactivating ? "Reactivating..." : "Reactivate Member"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemberProfileCard;
