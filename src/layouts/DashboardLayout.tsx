import { ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { useIsMobile } from '@/hooks/use-mobile';

interface DashboardLayoutProps {
  children: ReactNode;
  customLinks?: any[];
  customLogout?: () => void;
}

const DashboardLayout = ({ 
  children, 
  customLinks,
  customLogout
}: DashboardLayoutProps) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  // Mobile sidebar should always start hidden and only open from the menu button.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Ensure mobile drawer is closed whenever we are not in mobile view.
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Also close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden md:flex md:w-56 lg:w-64 md:flex-shrink-0">
        <Sidebar sidebarItems={customLinks} />
      </div>

      {/* Mobile Sidebar - Hidden by default, shown via menu button */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden"
             onClick={() => setSidebarOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-56 z-50 bg-white overflow-y-auto"
               onClick={(e) => e.stopPropagation()}>
            <Sidebar sidebarItems={customLinks} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-10 overflow-auto bg-slate-50/50">
          <div className="max-w-[1600px] mx-auto page-transition h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
