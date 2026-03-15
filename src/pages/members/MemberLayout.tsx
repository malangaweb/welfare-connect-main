import Sidebar from "@/components/Sidebar";
import { useNavigate } from "react-router-dom";
import { User, List, FileText, BarChart3, Home, LogOut } from "lucide-react";

const memberLinks = [
  { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/member/summary" },
  { icon: <User className="w-5 h-5" />, label: "My Profile", href: "/member/summary" },
  { icon: <List className="w-5 h-5" />, label: "My Cases", href: "/member/cases" },
  { icon: <FileText className="w-5 h-5" />, label: "My Transactions", href: "/member/transactions" },
  { icon: <BarChart3 className="w-5 h-5" />, label: "My Report", href: "/member/report" },
];

const MemberLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("member_user_id");
    localStorage.removeItem("member_member_id");
    navigate("/member/login");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar links={memberLinks} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-6">
          <div className="container mx-auto max-w-3xl">{children}</div>
        </main>
        <footer className="py-4 px-6 border-t border-border text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Malanga Community Welfare Group. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default MemberLayout;
