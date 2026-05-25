import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, User, Settings, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AppNotification, fetchNotifications } from '@/lib/notificationsApi';

const Navbar = () => {
  const [searchValue, setSearchValue] = useState('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  // Check if a member is logged in (localStorage)
  const isMemberLoggedIn = !!localStorage.getItem("member_member_id");

  const handleLogout = () => {
    // For member logout
    localStorage.removeItem("member_user_id");
    localStorage.removeItem("member_member_id");
    navigate("/member/login");
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchNotifications(20);
        if (cancelled) return;
        setNotifications(result.notifications);
        setUnreadCount(result.unread_count);
      } catch {
        if (cancelled) return;
        setNotifications([]);
        setUnreadCount(0);
      }
    };
    void load();
    const id = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-6">
      <div className="flex-1 flex items-center justify-between">
        <div className="flex items-center w-96 mr-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full pl-9 bg-background focus-visible:ring-primary/40"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Member navigation links */}
          {isMemberLoggedIn && (
            <nav className="flex gap-4">
              <Link to="/member/summary" className="text-sm font-medium hover:underline">
                My Profile
              </Link>
              <Link to="/member/cases" className="text-sm font-medium hover:underline">
                My Cases
              </Link>
              <Link to="/member/transactions" className="text-sm font-medium hover:underline">
                My Transactions
              </Link>
              <Link to="/member/report" className="text-sm font-medium hover:underline">
                My Report
              </Link>
            </nav>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-[10px] px-1 text-white border border-white flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-[60vh] overflow-y-auto">
                <div className="flex flex-col gap-2 py-2 px-1">
                  {notifications.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">No notifications</p>
                  ) : (
                    notifications.map((item) => (
                      <div key={item.id} className="rounded-md border p-2 border-slate-100 bg-white">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary">M</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isMemberLoggedIn && (
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
