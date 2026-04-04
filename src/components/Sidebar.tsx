import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessPath, normalizeRole } from '@/lib/rbac';
import {
  Users,
  Home,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  CreditCard,
  Wallet,
  UserCog
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

// Define the default links that will always be available
const defaultLinks = [
  { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/dashboard" },
  { icon: <Users className="w-5 h-5" />, label: "Members", href: "/members" },
  { icon: <Calendar className="w-5 h-5" />, label: "Cases", href: "/cases" },
  { icon: <CreditCard className="w-5 h-5" />, label: "Transactions", href: "/transactions" },
  { icon: <Wallet className="w-5 h-5" />, label: "Accounts", href: "/accounts" },
  { icon: <BarChart3 className="w-5 h-5" />, label: "Reports", href: "/reports" },
  { icon: <UserCog className="w-5 h-5" />, label: "Users", href: "/users" },
  { icon: <Settings className="w-5 h-5" />, label: "Settings", href: "/settings" }
];

const Sidebar = ({ sidebarItems }) => {
  const { logout } = useAuth();
  const location = useLocation();

  const currentUserRole = (() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return normalizeRole(user?.role as string | undefined);
    } catch {
      return null;
    }
  })();
  const hasMemberSession = !!localStorage.getItem('member_member_id');
  
  // Use the passed sidebarItems if provided, otherwise use the default ones
  const items = (sidebarItems || defaultLinks).filter((item) => {
    // Member portal runs on separate session keys and does not use currentUser role.
    // If we are in a member session, allow member routes.
    if (hasMemberSession && item.href.startsWith('/member/')) return true;
    return canAccessPath(item.href, currentUserRole);
  });
  
  useEffect(() => {
    // Update active state when location changes
  }, [items, location.pathname]);

  return (
    <aside className="bg-sidebar w-full h-full flex flex-col border-r border-sidebar-border shadow-sm z-10 transition-colors duration-300">
      <div className="p-3 md:p-4 lg:p-5 flex-shrink-0">
        <Link to="/dashboard" className="flex items-center">
          <img
            src="/malanga-logo.png"
            alt="Malanga Welfare Connect"
            className="h-9 w-auto md:h-10 object-contain"
            loading="eager"
          />
        </Link>
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-0.5">
          {items && items.length > 0 ? (
            items.map((item) => {
              const isActive = location.pathname === item.href ||
                             (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs md:text-sm font-medium transition-all duration-200 group whitespace-nowrap',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })
          ) : (
            <div className="text-center text-xs text-muted-foreground py-6">No items</div>
          )}
        </nav>
      </ScrollArea>

      {/* Logout Button */}
      <div className="p-2 md:p-3 border-t border-sidebar-border flex-shrink-0">
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive justify-start gap-2 px-2.5 py-2 h-auto whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs md:text-sm font-medium truncate">Logout</span>
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
