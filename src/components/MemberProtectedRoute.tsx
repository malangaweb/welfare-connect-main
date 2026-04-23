import { Navigate } from "react-router-dom";
import { clearMemberSession, getAppToken, isAppTokenExpired } from "@/lib/appAuth";

export default function MemberProtectedRoute({ children }: { children: React.ReactNode }) {
  const memberId = localStorage.getItem("member_member_id");
  const appToken = getAppToken();
  if (!memberId || !appToken || isAppTokenExpired(appToken)) {
    clearMemberSession();
    return <Navigate to="/member/login" replace />;
  }
  return <>{children}</>;
}
