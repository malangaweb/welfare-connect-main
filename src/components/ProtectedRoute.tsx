import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      // First check Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!mounted) return;
      
      if (session) {
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }
      
      // Fallback to token for demo user
      const token = localStorage.getItem('token');
      if (token) {
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }
      
      setIsAuthenticated(false);
      setLoading(false);
    };
    
    checkAuth();
    
    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAuthenticated(!!session || !!localStorage.getItem('token'));
      setLoading(false);
    });
    
    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    // Show a loading indicator instead of a blank screen
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
