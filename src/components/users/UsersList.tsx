
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { User as LucideUser, RefreshCw, UserCog, Key } from 'lucide-react';
import { User, UserRole } from '@/lib/types';
import { DbUser } from '@/lib/db-types';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import EditUserRoleDialog from './EditUserRoleDialog';

const UsersList = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: UserRole } | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    // Load current user from localStorage
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser({
          id: user.id,
          role: user.role as UserRole
        });
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }

    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
          
      if (error) throw error;
      
      // Map the database fields to the User interface
      const mappedUsers: User[] = (data || []).map((user: DbUser) => ({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email || undefined,
        role: user.role as UserRole,
        memberId: user.member_id || undefined,
        isActive: user.is_active || false,
      }));
      
      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      case UserRole.CHAIRPERSON:
        return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
      case UserRole.TREASURER:
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case UserRole.SECRETARY:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return 'Super Admin';
      case UserRole.CHAIRPERSON:
        return 'Chairperson';
      case UserRole.TREASURER:
        return 'Treasurer';
      case UserRole.SECRETARY:
        return 'Secretary';
      case UserRole.MEMBER:
        return 'Member';
      default:
        return 'Unknown';
    }
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    
    setProcessingAction(true);
    try {
      const newStatus = !selectedUser.isActive;
      
      const { error } = await supabase
        .from('users')
        .update({ is_active: newStatus })
        .eq('id', selectedUser.id);
        
      if (error) throw error;
      
      // Update local state
      setUsers(users.map(user => 
        user.id === selectedUser.id 
          ? { ...user, isActive: newStatus } 
          : user
      ));
      
      toast({
        title: newStatus ? "User Activated" : "User Deactivated",
        description: `${selectedUser.name} has been ${newStatus ? "activated" : "deactivated"} successfully.`,
      });
      
    } catch (error: any) {
      console.error('Error updating user status:', error);
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error.message || "Failed to update user status.",
      });
    } finally {
      setProcessingAction(false);
      setShowStatusDialog(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    setProcessingAction(true);
    try {
      // Generate a simple random password for admin to communicate to the user
      const tempPassword = Math.random().toString(36).slice(-8);
      
      const { error } = await supabase
        .from('users')
        .update({ password: tempPassword })
        .eq('id', selectedUser.id);
        
      if (error) throw error;
      
      toast({
        title: "Password Reset",
        description: `Temporary password for ${selectedUser.name}: ${tempPassword}`,
      });
      
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: error.message || "Failed to reset user password.",
      });
    } finally {
      setProcessingAction(false);
      setShowResetDialog(false);
    }
  };

  const canManageUser = (user: User) => {
    // Only super admins can manage users
    if (currentUser?.role !== UserRole.SUPER_ADMIN) return false;
    
    // Super admins can't manage other super admins (to prevent lockouts)
    if (user.role === UserRole.SUPER_ADMIN && user.id !== currentUser.id) return false;
    
    return true;
  };

  const handleRoleUpdate = () => {
    fetchUsers();
  };

  if (loading) {
    return <div className="text-center py-4">Loading users...</div>;
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-muted-foreground">No users found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status change confirmation dialog */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.isActive ? "Deactivate User" : "Activate User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.isActive 
                ? `Are you sure you want to deactivate ${selectedUser?.name}? They will no longer be able to login.`
                : `Are you sure you want to activate ${selectedUser?.name}? They will be able to login again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleToggleUserStatus}
              disabled={processingAction}
              className={selectedUser?.isActive ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {processingAction ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedUser?.isActive ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password reset confirmation dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for {selectedUser?.name}?
              A new temporary password will be generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetPassword}
              disabled={processingAction}
            >
              {processingAction ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role edit dialog */}
      <EditUserRoleDialog
        user={selectedUser}
        open={showRoleDialog}
        onOpenChange={setShowRoleDialog}
        onSuccess={handleRoleUpdate}
      />

      {users.map((user) => (
        <div 
          key={user.id} 
          className="border rounded-md p-4 flex items-center justify-between hover:bg-accent transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="bg-primary/10 p-2 rounded-full">
              <LucideUser className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
              {user.email && (
                <p className="text-sm text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge className={getRoleBadgeColor(user.role as UserRole)} variant="outline">
              {getRoleLabel(user.role as UserRole)}
            </Badge>
            <Badge variant={user.isActive ? "default" : "destructive"}>
              {user.isActive ? "Active" : "Inactive"}
            </Badge>
            
            {canManageUser(user) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserCog className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(user);
                      setShowRoleDialog(true);
                    }}
                  >
                    Edit Role
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(user);
                      setShowStatusDialog(true);
                    }}
                  >
                    {user.isActive ? "Deactivate User" : "Activate User"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(user);
                      setShowResetDialog(true);
                    }}
                  >
                    Reset Password
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default UsersList;
