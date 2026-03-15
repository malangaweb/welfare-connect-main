/**
 * Authorization & Access Control Utilities
 * 
 * Since RLS policies are disabled (custom auth incompatible with auth.uid()),
 * we implement app-level authorization checks to control data access.
 * 
 * This strategy ensures:
 * - Users can only access data they have permission for
 * - Role-based access control is enforced
 * - Admin operations are restricted to authorized roles
 */

import { UserRole } from './types';

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: UserRole;
  memberId?: string;
  isActive: boolean;
}

/**
 * Get the currently logged-in user from localStorage
 */
export function getCurrentUser(): CurrentUser | null {
  try {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    
    const user = JSON.parse(userStr);
    // Normalize role to lowercase to match enum
    return {
      ...user,
      role: (user.role as string).toLowerCase() as UserRole,
    };
  } catch (error) {
    console.error('Error parsing current user:', error);
    return null;
  }
}

/**
 * Get the currently logged-in member from localStorage (for member portal)
 */
export function getCurrentMember() {
  try {
    const memberId = localStorage.getItem('member_member_id');
    const memberName = localStorage.getItem('member_name');
    const memberPhone = localStorage.getItem('member_phone_number');
    
    if (!memberId) return null;
    
    return {
      id: memberId,
      name: memberName || 'Unknown',
      phoneNumber: memberPhone || '',
    };
  } catch (error) {
    console.error('Error getting current member:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (either admin or member)
 */
export function isAuthenticated(): boolean {
  const adminUser = getCurrentUser();
  const member = getCurrentMember();
  return !!adminUser || !!member;
}

/**
 * Check if current user has any of the required roles
 */
export function hasRole(requiredRoles: UserRole[]): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  
  return requiredRoles.includes(user.role);
}

/**
 * Check if current user has a specific role
 */
export function hasExactRole(role: UserRole): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  
  return user.role === role;
}

/**
 * Check if user is an admin (super_admin, chairperson, treasurer, or secretary)
 */
export function isAdmin(): boolean {
  return hasRole([
    UserRole.SUPER_ADMIN,
    UserRole.CHAIRPERSON,
    UserRole.TREASURER,
    UserRole.SECRETARY,
  ]);
}

/**
 * Check if user is a super admin
 */
export function isSuperAdmin(): boolean {
  return hasExactRole(UserRole.SUPER_ADMIN);
}

/**
 * Check if user is a treasurer or super admin (can manage financial data)
 */
export function canManageFinances(): boolean {
  return hasRole([UserRole.SUPER_ADMIN, UserRole.TREASURER]);
}

/**
 * Check if user is a chairperson or super admin (can manage cases)
 */
export function canManageCases(): boolean {
  return hasRole([UserRole.SUPER_ADMIN, UserRole.CHAIRPERSON]);
}

/**
 * Check if user is a secretary or super admin (can manage members)
 */
export function canManageMembers(): boolean {
  return hasRole([UserRole.SUPER_ADMIN, UserRole.SECRETARY]);
}

/**
 * Check if user can manage users (super admin only)
 */
export function canManageUsers(): boolean {
  return isSuperAdmin();
}

/**
 * Check if user can view a specific member's details
 * Admin users can view all members
 * Members can view their own data only
 */
export function canViewMember(memberId: string): boolean {
  // Admin can view any member
  if (isAdmin()) return true;
  
  // Members can view their own data only
  const currentMember = getCurrentMember();
  if (currentMember && currentMember.id === memberId) return true;
  
  return false;
}

/**
 * Check if user can view member transactions
 */
export function canViewTransactions(memberId?: string): boolean {
  // Admin can view all transactions
  if (isAdmin()) return true;
  
  // Members can view their own transactions
  if (memberId) {
    const currentMember = getCurrentMember();
    if (currentMember && currentMember.id === memberId) return true;
  }
  
  return false;
}

/**
 * Check if user can modify member data
 */
export function canModifyMember(): boolean {
  return hasRole([UserRole.SUPER_ADMIN, UserRole.SECRETARY]);
}

/**
 * Check if user can process payments
 */
export function canProcessPayments(): boolean {
  return hasRole([UserRole.SUPER_ADMIN, UserRole.TREASURER]);
}

/**
 * Check if user can access reports
 */
export function canAccessReports(): boolean {
  return hasRole([
    UserRole.SUPER_ADMIN,
    UserRole.CHAIRPERSON,
    UserRole.TREASURER,
  ]);
}

/**
 * Check if user can access settings
 */
export function canAccessSettings(): boolean {
  return isSuperAdmin();
}

/**
 * Check if user can perform audit log actions
 */
export function canViewAuditLogs(): boolean {
  return hasRole([
    UserRole.SUPER_ADMIN,
    UserRole.CHAIRPERSON,
    UserRole.TREASURER,
  ]);
}

/**
 * Get authorization error message based on required permission
 */
export function getAuthErrorMessage(action: string): string {
  return `You do not have permission to ${action}. Please contact an administrator.`;
}

/**
 * Log authorization failure to audit trail
 */
export async function logAuthorizationFailure(
  action: string,
  resource: string,
  reason: string
): Promise<void> {
  try {
    const user = getCurrentUser();
    const member = getCurrentMember();
    
    console.warn(`Authorization Failure: ${action}`, {
      resource,
      reason,
      user: user?.id || member?.id,
      timestamp: new Date().toISOString(),
    });
    
    // Could be extended to log to audit_logs table if needed
  } catch (error) {
    console.error('Error logging authorization failure:', error);
  }
}
