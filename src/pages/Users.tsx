
import { useState, useEffect } from 'react';
import { UserPlus, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import UserSetupForm from '@/components/forms/UserSetupForm';
import UsersList from '@/components/users/UsersList';
import { toast } from '@/components/ui/use-toast';
import { UserRole } from '@/lib/types';

const Users = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    // Load current user role from localStorage
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUserRole(user.role as UserRole);
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleUserAdded = () => {
    toast({
      title: "User added successfully",
      description: "The new administrator account has been created.",
    });
    handleRefresh();
  };

  const isSuperAdmin = currentUserRole === UserRole.SUPER_ADMIN;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">User Management</h1>
          <p className="text-muted-foreground">Manage system administrators and their roles</p>
        </div>

        {/* Admin Management Section */}
        {isSuperAdmin && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Administrator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create new administrator accounts with different roles. Each admin must be linked to an existing member record.
                </p>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add New Admin
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="flex flex-col overflow-hidden">
                    <SheetHeader className="flex-shrink-0">
                      <SheetTitle>Create New Administrator</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto py-6">
                      <UserSetupForm onSuccess={handleUserAdded} />
                    </div>
                  </SheetContent>
                </Sheet>
                <div className="mt-4 p-4 bg-background rounded-lg border">
                  <h4 className="font-semibold mb-2 text-sm">Available Roles:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">Super Administrator:</span> Full system access including user management, role assignment, and all administrative functions.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Administrator:</span> Administrative access to manage system operations, members, cases, and transactions.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Member:</span> Limited access for regular members to view their own information and cases.
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">System Users</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 mr-2`} />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All System Users</CardTitle>
          </CardHeader>
          <CardContent>
            <UsersList key={refreshTrigger} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
