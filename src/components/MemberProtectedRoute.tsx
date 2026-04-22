import { Navigate } from "react-router-dom";

export default function MemberProtectedRoute({ children }: { children: React.ReactNode }) {
  const memberId = localStorage.getItem("member_member_id");
  const appToken = localStorage.getItem("app_token") || localStorage.getItem("token");
  if (!memberId || !appToken) return <Navigate to="/member/login" replace />;
  return <>{children}</>;
}
