
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
          <p className="text-muted-foreground">Manage system administrators and user accounts</p>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">System Users</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 mr-2`} />
              Refresh
            </Button>
            
            {isSuperAdmin && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add New Admin
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Create New Administrator</SheetTitle>
                  </SheetHeader>
                  <div className="py-6">
                    <UserSetupForm onSuccess={handleUserAdded} />
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Administrators</CardTitle>
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
