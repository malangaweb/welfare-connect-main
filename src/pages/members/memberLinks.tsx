import { User, List, FileText, BarChart3, Home } from "lucide-react";

export const memberLinks = [
  { icon: <Home className="w-5 h-5" />, label: "Dashboard", href: "/member/dashboard" },
  { icon: <User className="w-5 h-5" />, label: "My Profile", href: "/member/summary" },
  { icon: <List className="w-5 h-5" />, label: "My Cases", href: "/member/cases" },
  { icon: <FileText className="w-5 h-5" />, label: "My Transactions", href: "/member/transactions" },
  { icon: <BarChart3 className="w-5 h-5" />, label: "My Report", href: "/member/report" },
];

export const memberLogout = (navigate) => {
  localStorage.removeItem("member_user_id");
  localStorage.removeItem("member_member_id");
  navigate("/member/login");
};
