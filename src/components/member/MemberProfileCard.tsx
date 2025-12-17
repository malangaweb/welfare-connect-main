
import { useState } from 'react';
import { Edit, UserMinus, Wallet, UserCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Member } from '@/lib/types';
import { toast } from '@/components/ui/use-toast';

interface MemberProfileCardProps {
  member: Member;
}

const MemberProfileCard = ({ member }: MemberProfileCardProps) => {
  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleStatusChange = async () => {
    try {
      setIsDeactivating(true);
      // API call to update member status would go here
      
      toast({
        title: member.isActive ? "Member Deactivated" : "Member Reactivated",
        description: `${member.name} has been ${member.isActive ? "deactivated" : "reactivated"} successfully.`,
      });
      
      // For demo purposes - in real app would reload member data after API call
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update member status.",
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
            {member.isActive ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">
                Inactive
              </Badge>
            )}
          </div>
          
          <div className="mt-6 flex flex-col gap-2 w-full">
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
            <Button variant="outline">
              <Wallet className="h-4 w-4 mr-2" />
              Fund Wallet
            </Button>
            {member.isActive ? (
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
