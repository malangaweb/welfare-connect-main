import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/lib/types";
import { getCurrentUser, logAuthorizationFailure } from "@/lib/authorization";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

/**
 * ProtectedRoute Component
 * 
 * Enforces app-level authorization by checking:
 * 1. User is authenticated (has token and currentUser in localStorage)
 * 2. User's role is in the allowedRoles list
 * 
 * This replaces RLS which is incompatible with custom auth.
 */
export default function ProtectedRoute({
  children,
  allowedRoles = [UserRole.SUPER_ADMIN, UserRole.CHAIRPERSON, UserRole.TREASURER, UserRole.SECRETARY],
}: ProtectedRouteProps) {
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
        
        const authorized = allowedRoles.includes(normalizedRole);
        
        // Log authorization failures
        if (!authorized) {
          await logAuthorizationFailure(
            'route_access',
            window.location.pathname,
            `User role '${normalizedRole}' not in allowed roles: ${allowedRoles.join(', ')}`
          );
        }
        
        setIsAuthorized(authorized);
      } catch (error) {
        console.error('Error checking authorization:', error);
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
        
        const authorized = allowedRoles.includes(normalizedRole);
        if (!authorized) {
          logAuthorizationFailure(
            'session_change',
            window.location.pathname,
            `User role '${normalizedRole}' not in allowed roles`
          ).catch(() => {});
        }
        
        setIsAuthorized(authorized);
      } catch (error) {
        console.error('Error checking authorization on session change:', error);
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
