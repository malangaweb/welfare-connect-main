import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, User, FileText, List, BarChart3, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const memberNav = [
  { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/member/dashboard" },
  { icon: <User className="w-5 h-5" />, label: "My Profile", href: "/member/summary" },
  { icon: <List className="w-5 h-5" />, label: "My Cases", href: "/member/cases" },
  { icon: <FileText className="w-5 h-5" />, label: "My Transactions", href: "/member/transactions" },
  { icon: <BarChart3 className="w-5 h-5" />, label: "My Report", href: "/member/report" },
];

const MemberSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("member_user_id");
    localStorage.removeItem("member_member_id");
    navigate("/member/login");
  };

  return (
    <>
      {/* Mobile Hamburger */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-background border-b">
        <span className="font-bold text-lg text-primary">Member Portal</span>
        <button onClick={() => setOpen(!open)} className="focus:outline-none">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>
      {/* Sidebar */}
      <aside
        className={`bg-sidebar w-64 h-screen fixed top-0 left-0 z-40 flex-col shadow-lg transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:relative md:flex`}
        style={{ minHeight: "100vh" }}
      >
        <div className="p-6 border-b border-sidebar-border flex items-center gap-2.5">
          <div className="bg-primary/90 text-white rounded-lg p-1.5">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-sidebar-foreground font-bold text-xl">Member Portal</h1>
        </div>
        <nav className="flex-1 py-6 px-3 overflow-y-auto">
          <ul className="space-y-1.5">
            {memberNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent group ${
                      isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/90"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    <span
                      className={`transition-colors duration-200 ${
                        isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"
                      }`}
                    >
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
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/90 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 mr-2" />
            Log Out
          </Button>
        </div>
      </aside>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default MemberSidebar;
