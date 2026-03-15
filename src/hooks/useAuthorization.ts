/**
 * Authorization Hooks for Data Access Control
 * 
 * These hooks provide component-level access control checks.
 * Use them to conditionally render UI elements or block data access.
 */

import { useCallback } from 'react';
import {
  getCurrentUser,
  getCurrentMember,
  canViewMember as canViewMemberAuth,
  canViewTransactions as canViewTransactionsAuth,
  canModifyMember as canModifyMemberAuth,
  canProcessPayments as canProcessPaymentsAuth,
  canAccessSettings as canAccessSettingsAuth,
  isAdmin as isAdminAuth,
} from '@/lib/authorization';

/**
 * Hook to check if current user is an admin
 */
export function useIsAdmin(): boolean {
  return isAdminAuth();
}

/**
 * Hook to check if current user can view a specific member
 */
export function useCanViewMember(memberId: string): boolean {
  const canView = useCallback(() => {
    return canViewMemberAuth(memberId);
  }, [memberId]);

  return canView();
}

/**
 * Hook to check if current user can view transactions
 */
export function useCanViewTransactions(memberId?: string): boolean {
  const canView = useCallback(() => {
    return canViewTransactionsAuth(memberId);
  }, [memberId]);

  return canView();
}

/**
 * Hook to check if current user can modify member data
 */
export function useCanModifyMember(): boolean {
  const canModify = useCallback(() => {
    return canModifyMemberAuth();
  }, []);

  return canModify();
}

/**
 * Hook to check if current user can process payments
 */
export function useCanProcessPayments(): boolean {
  const canProcess = useCallback(() => {
    return canProcessPaymentsAuth();
  }, []);

  return canProcess();
}

/**
 * Hook to check if current user can access settings
 */
export function useCanAccessSettings(): boolean {
  const canAccess = useCallback(() => {
    return canAccessSettingsAuth();
  }, []);

  return canAccess();
}

/**
 * Hook to get current user info
 */
export function useCurrentUser() {
  return getCurrentUser();
}

/**
 * Hook to get current member info (member portal)
 */
export function useCurrentMember() {
  return getCurrentMember();
}

/**
 * Hook to authorize a data query
 * Returns { canAccess: boolean, reason: string }
 * 
 * Usage:
 * const { canAccess, reason } = useAuthorizeQuery('member', memberId);
 * if (!canAccess) throw new Error(reason);
 */
export function useAuthorizeQuery(
  resourceType: 'member' | 'transaction' | 'case' | 'report',
  resourceId?: string
): { canAccess: boolean; reason: string } {
  const user = getCurrentUser();
  const member = getCurrentMember();

  const authorize = useCallback(() => {
    // Not authenticated
    if (!user && !member) {
      return {
        canAccess: false,
        reason: 'You must be logged in to access this resource',
      };
    }

    switch (resourceType) {
      case 'member':
        if (!resourceId) {
          return { canAccess: false, reason: 'Member ID is required' };
        }
        if (canViewMemberAuth(resourceId)) {
          return { canAccess: true, reason: '' };
        }
        return {
          canAccess: false,
          reason: 'You do not have permission to view this member',
        };

      case 'transaction':
        if (canViewTransactionsAuth(resourceId)) {
          return { canAccess: true, reason: '' };
        }
        return {
          canAccess: false,
          reason: 'You do not have permission to view these transactions',
        };

      case 'case':
        if (user && isAdminAuth()) {
          return { canAccess: true, reason: '' };
        }
        return {
          canAccess: false,
          reason: 'You do not have permission to view this case',
        };

      case 'report':
        if (user && isAdminAuth()) {
          return { canAccess: true, reason: '' };
        }
        return {
          canAccess: false,
          reason: 'You do not have permission to access reports',
        };

      default:
        return {
          canAccess: false,
          reason: 'Unknown resource type',
        };
    }
  }, [resourceType, resourceId, user, member]);

  return authorize();
}

/**
 * Hook to generate authorization header for API calls
 * 
 * Usage:
 * const authHeader = useAuthHeader();
 * const response = await fetch('/api/data', {
 *   headers: { ...authHeader }
 * });
 */
export function useAuthHeader() {
  const user = getCurrentUser();

  return {
    'X-User-ID': user?.id || '',
    'X-User-Role': user?.role || '',
    'Authorization': `Bearer ${localStorage.getItem('token')}` || '',
  };
}
