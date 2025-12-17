
import { useState } from 'react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RegistrationAccount from '@/components/accounts/RegistrationAccount';
import RenewalAccount from '@/components/accounts/RenewalAccount';
import PenaltyAccount from '@/components/accounts/PenaltyAccount';
import SuspenseAccount from '@/components/accounts/SuspenseAccount';

const Accounts = () => {
  const [activeTab, setActiveTab] = useState('registration');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">Manage financial accounts and view transaction history</p>
        </div>

        <Tabs defaultValue="registration" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-4 gap-4 w-full">
            <TabsTrigger value="registration">Registration Fees</TabsTrigger>
            <TabsTrigger value="renewal">Renewal Fees</TabsTrigger>
            <TabsTrigger value="penalty">Penalty Fees</TabsTrigger>
            <TabsTrigger value="suspense">Suspense Account</TabsTrigger>
          </TabsList>

          <TabsContent value="registration" className="space-y-6">
            <RegistrationAccount />
          </TabsContent>

          <TabsContent value="renewal" className="space-y-6">
            <RenewalAccount />
          </TabsContent>

          <TabsContent value="penalty" className="space-y-6">
            <PenaltyAccount />
          </TabsContent>

          <TabsContent value="suspense" className="space-y-6">
            <SuspenseAccount />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Accounts;
