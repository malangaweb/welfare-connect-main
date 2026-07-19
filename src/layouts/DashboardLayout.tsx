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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dashboard:sidebar-collapsed') === 'true';
  });
  // Mobile sidebar should always start hidden and only open from the menu button.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Ensure mobile drawer is closed whenever we are not in mobile view.
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    localStorage.setItem('dashboard:sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Also close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar - Hidden on mobile */}
      <div className={`hidden md:flex md:flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'md:w-16 lg:w-16' : 'md:w-56 lg:w-64'}`}>
        <Sidebar
          sidebarItems={customLinks}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
          onLogout={customLogout}
        />
      </div>

      {/* Mobile Sidebar - Hidden by default, shown via menu button */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden"
             onClick={() => setSidebarOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-56 z-50 bg-white overflow-y-auto"
               onClick={(e) => e.stopPropagation()}>
            <Sidebar sidebarItems={customLinks} onLogout={customLogout} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex min-w-0 flex-col">
        <Navbar onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 overflow-x-hidden bg-slate-50/50 p-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-6 md:p-6 lg:p-10">
          <div className="mx-auto max-w-[1600px] page-transition">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
