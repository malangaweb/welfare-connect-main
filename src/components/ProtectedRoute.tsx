import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/lib/types";

export default function ProtectedRoute({
  children,
  allowedRoles = [UserRole.SUPER_ADMIN, UserRole.CHAIRPERSON, UserRole.TREASURER, UserRole.SECRETARY],
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      // First check Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!mounted) return;

      const token = localStorage.getItem('token');
      const hasAnyAuthSignal = !!session || !!token;
      if (!hasAnyAuthSignal) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      const userStr = localStorage.getItem('currentUser');
      if (!userStr) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      try {
        const user = JSON.parse(userStr);
        const role = (user?.role as string | undefined) || '';
        const normalizedRole = role.toLowerCase() as UserRole;
        setIsAuthorized(allowedRoles.includes(normalizedRole));
      } catch {
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
    
    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const token = localStorage.getItem('token');
      const hasAnyAuthSignal = !!session || !!token;

      if (!hasAnyAuthSignal) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      const userStr = localStorage.getItem('currentUser');
      if (!userStr) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      try {
        const user = JSON.parse(userStr);
        const role = (user?.role as string | undefined) || '';
        const normalizedRole = role.toLowerCase() as UserRole;
        setIsAuthorized(allowedRoles.includes(normalizedRole));
      } catch {
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    });
    
    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, [allowedRoles]);

  if (loading) {
    // Show a loading indicator instead of a blank screen
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
