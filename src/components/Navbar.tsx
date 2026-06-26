
import { useState, useEffect, useCallback } from 'react';
import { Bell, Search, User, Settings, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { clearAppToken } from '@/lib/appAuth';
import { AppNotification, fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/notificationsApi';

interface NavbarProps {
  onMenuClick?: () => void;
}

const Navbar = ({ onMenuClick }: NavbarProps) => {
  const [searchValue, setSearchValue] = useState('');
  const [userName, setUserName] = useState<string>('');
  const [showSearch, setShowSearch] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const loadNotifications = useCallback(async () => {
    try {
      const result = await fetchNotifications(20);
      setNotifications(result.notifications);
      setUnreadCount(result.unread_count);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    // Get logged-in user name from localStorage
    const currentUserStr = localStorage.getItem('currentUser');
    if (currentUserStr) {
      try {
        const currentUser = JSON.parse(currentUserStr);
        setUserName(currentUser.name || currentUser.username || 'User');
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await loadNotifications();
      if (cancelled) return;
    };
    void load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadNotifications]);

  const handleLogout = () => {
    clearAppToken();
    localStorage.removeItem('currentUser');
    navigate('/login');
  };

  // Get user initials for avatar
  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border bg-white/95 backdrop-blur-sm flex items-center px-3 sm:px-6 md:px-8 transition-all duration-200 gap-4">
      {/* Mobile Menu Button */}
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="h-10 w-10"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {/* Search - Hidden on mobile by default, shown as icon */}
      <div className="flex-1 flex items-center justify-between">
        {!isMobile ? (
          <div className="flex items-center w-full max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full pl-10 h-9 md:h-10 bg-slate-50 border-transparent focus:bg-white transition-all duration-200 text-sm"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
          </div>
        ) : showSearch ? (
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              type="search"
              placeholder="Search..."
              className="w-full pl-10 h-9 bg-slate-50 border-transparent focus:bg-white transition-all duration-200 text-sm"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onBlur={() => !searchValue && setShowSearch(false)}
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSearch(true)}
            className="h-9 w-9 sm:h-10 sm:w-10"
            aria-label="Search"
          >
            <Search className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        )}

        {/* Right Side Icons */}
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative hover:bg-slate-100 rounded-full h-9 w-9 sm:h-10 sm:w-10"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-[10px] px-1 text-white border border-white flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 sm:w-80 p-0 shadow-lg border-slate-200">
              <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary" onClick={async () => { await markAllNotificationsRead(); await loadNotifications(); }}>
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">No notifications</p>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-md border p-2 mb-2 cursor-pointer transition-colors ${item.is_read ? 'border-slate-50 bg-slate-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      onClick={async () => {
                        setMarkingId(item.id);
                        await markNotificationRead(item.id);
                        await loadNotifications();
                        setMarkingId(null);
                      }}
                    >
                      <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{item.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 sm:h-10 sm:w-10" aria-label="User menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs font-semibold">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 sm:w-64">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-foreground break-words max-w-full">{userName}</div>
                <div className="text-xs text-muted-foreground">Administrator</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate('/settings')}
                className="cursor-pointer gap-2"
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm">Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
