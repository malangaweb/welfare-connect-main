
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Users, 
  FileText, 
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

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const Sidebar = () => {
  const location = useLocation();
  
  const sidebarItems: SidebarItem[] = [
    { 
      icon: <Home className="w-5 h-5" />, 
      label: 'Dashboard', 
      href: '/dashboard' 
    },
    { 
      icon: <Users className="w-5 h-5" />, 
      label: 'Members', 
      href: '/members' 
    },
    { 
      icon: <Calendar className="w-5 h-5" />, 
      label: 'Cases', 
      href: '/cases' 
    },
    { 
      icon: <CreditCard className="w-5 h-5" />, 
      label: 'Transactions', 
      href: '/transactions' 
    },
    { 
      icon: <Wallet className="w-5 h-5" />, 
      label: 'Accounts', 
      href: '/accounts' 
    },
    { 
      icon: <UserCog className="w-5 h-5" />, 
      label: 'Users', 
      href: '/users' 
    },
    { 
      icon: <BarChart3 className="w-5 h-5" />, 
      label: 'Reports', 
      href: '/reports' 
    },
    { 
      icon: <Settings className="w-5 h-5" />, 
      label: 'Settings', 
      href: '/settings' 
    },
  ];

  return (
    <aside className="bg-sidebar w-64 h-screen sticky top-0 flex flex-col shadow-lg">
      <div className="p-6 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="bg-primary/90 text-white rounded-lg p-1.5">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-sidebar-foreground font-bold text-xl">MCWG</h1>
        </Link>
      </div>
      
      <nav className="flex-1 py-6 px-3 overflow-y-auto">
        <ul className="space-y-1.5">
          {sidebarItems.map((item) => {
            const isActive = location.pathname === item.href || 
                           (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent group",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/90"
                  )}
                >
                  <span className={cn(
                    "transition-colors duration-200",
                    isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"
                  )}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/90 hover:text-sidebar-foreground hover:bg-sidebar-accent">
          <LogOut className="w-5 h-5 mr-2" />
          Log Out
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
