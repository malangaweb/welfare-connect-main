import { Navigate } from "react-router-dom";

export default function MemberProtectedRoute({ children }: { children: React.ReactNode }) {
  const memberId = localStorage.getItem("member_member_id");
  if (!memberId) return <Navigate to="/member/login" replace />;
  return <>{children}</>;
}
