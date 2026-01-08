import { useState, useEffect } from 'react';
import { User, UserRole } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

interface EditUserRoleDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EditUserRoleDialog = ({ user, open, onOpenChange, onSuccess }: EditUserRoleDialogProps) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role || UserRole.ADMIN);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update selected role when user changes
  useEffect(() => {
    if (user) {
      setSelectedRole(user.role);
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: selectedRole })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Role Updated",
        description: `${user.name}'s role has been updated to ${getRoleLabel(selectedRole)}.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating user role:', error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update user role.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return 'Super Administrator';
      case UserRole.ADMIN:
        return 'Administrator';
      case UserRole.MEMBER:
        return 'Member';
      default:
        return 'Unknown';
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User Role</DialogTitle>
          <DialogDescription>
            Change the role for {user.name} (@{user.username})
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.SUPER_ADMIN}>Super Administrator</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Administrator</SelectItem>
                <SelectItem value={UserRole.MEMBER}>Member</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedRole === UserRole.SUPER_ADMIN && "Full system access including user management"}
              {selectedRole === UserRole.ADMIN && "Administrative access to manage system operations"}
              {selectedRole === UserRole.MEMBER && "Limited access for regular members"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Update Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserRoleDialog;
