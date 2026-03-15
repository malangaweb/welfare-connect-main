import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  getCurrentUser,
  getCurrentMember,
  isAdmin,
  canManageMembers,
  canManageFinances,
  canManageCases,
  canAccessReports,
  canProcessPayments,
  canViewMember,
} from '@/lib/authorization';
import { UserRole } from '@/lib/types';

interface AuthContextType {
  logout: () => Promise<void>;
  isAdmin: () => boolean;
  canManageMembers: () => boolean;
  canManageFinances: () => boolean;
  canManageCases: () => boolean;
  canAccessReports: () => boolean;
  canProcessPayments: () => boolean;
  canViewMember: (memberId: string) => boolean;
  getCurrentUser: typeof getCurrentUser;
  getCurrentMember: typeof getCurrentMember;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider
 * 
 * Provides authentication and authorization context throughout the app.
 * Replaces RLS with app-level access control since custom auth is incompatible
 * with Supabase RLS policies (which rely on auth.uid()).
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('token');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('member_member_id');
      localStorage.removeItem('member_name');
      localStorage.removeItem('member_phone_number');
      localStorage.removeItem('member_login_time');
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Error signing out:', error);
      // Force logout even if API call fails
      localStorage.clear();
      window.location.href = '/login';
    }
  }, [navigate]);

  const contextValue: AuthContextType = {
    logout,
    isAdmin,
    canManageMembers,
    canManageFinances,
    canManageCases,
    canAccessReports,
    canProcessPayments,
    canViewMember,
    getCurrentUser,
    getCurrentMember,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth Hook
 * 
 * Access authentication and authorization context from any component.
 * Provides methods to check permissions and get current user info.
 * 
 * Usage:
 * const { isAdmin, canManageMembers, logout } = useAuth();
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
