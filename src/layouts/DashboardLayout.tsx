import { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';

interface DashboardLayoutProps {
  children: ReactNode;
  customLinks?: any[];
}

const DashboardLayout = ({ 
  children, 
  customLinks
}: DashboardLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar sidebarItems={customLinks} />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 p-6 overflow-auto">
          <div className="container mx-auto max-w-7xl page-transition">
            {children}
          </div>
        </main>
        <footer className="py-4 px-6 border-t border-border text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Malanga Community Welfare Group. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default DashboardLayout;
