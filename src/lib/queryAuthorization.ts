/**
 * Supabase Query Authorization Middleware
 * 
 * Adds authorization checks to Supabase queries to prevent
 * unauthorized data access from the frontend.
 * 
 * Since RLS is disabled (custom auth incompatible),
 * this middleware implements access control at the application level.
 */

import { getCurrentUser, getCurrentMember } from '@/lib/authorization';

export interface QueryAuthOptions {
  resourceType: 'member' | 'transaction' | 'case' | 'dependant' | 'user';
  resourceId?: string;
  memberId?: string; // For nested resources
}

/**
 * Check if current user/member is authorized to query a resource
 * 
 * @throws Error if not authorized
 */
export function authorizeQuery(options: QueryAuthOptions): void {
  const user = getCurrentUser();
  const member = getCurrentMember();

  if (!user && !member) {
    throw new Error('Not authenticated');
  }

  const { resourceType, resourceId, memberId } = options;

  switch (resourceType) {
    case 'member':
      // Only admins can access member records
      // Or members can access their own record
      if (!resourceId) {
        throw new Error('Member ID is required');
      }
      
      if (user && (user.role === 'super_admin' || user.role === 'secretary')) {
        // Admins can access any member
        return;
      }

      if (member && member.id === resourceId) {
        // Members can access their own data
        return;
      }

      throw new Error(`Not authorized to access member ${resourceId}`);

    case 'transaction':
      // Admins can access all transactions
      // Members can access their own transactions
      if (user && (user.role === 'super_admin' || user.role === 'treasurer')) {
        return;
      }

      if (member && memberId === member.id) {
        return;
      }

      throw new Error(
        `Not authorized to access transactions for member ${memberId}`
      );

    case 'case':
      // Only admins can access cases
      if (user && (user.role === 'super_admin' || user.role === 'chairperson')) {
        return;
      }

      throw new Error('Not authorized to access cases');

    case 'dependant':
      // Admins can access all dependants
      // Members can access their own dependants
      if (user && user.role === 'super_admin') {
        return;
      }

      if (member && memberId === member.id) {
        return;
      }

      throw new Error(`Not authorized to access dependants`);

    case 'user':
      // Only super admins can access user records
      if (user && user.role === 'super_admin') {
        return;
      }

      throw new Error('Not authorized to access user records');

    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}

/**
 * Build authorization filter for Supabase queries
 * Returns a filter that should be applied to .select() queries
 * 
 * Example:
 * const filter = buildAuthFilter('transaction', memberId);
 * const { data } = await supabase
 *   .from('transactions')
 *   .select('*')
 *   .eq(...filter); // Apply filter
 */
export function buildAuthFilter(
  resourceType: string,
  memberId?: string
): { column: string; value: string } | null {
  const user = getCurrentUser();
  const member = getCurrentMember();

  if (!user && !member) {
    throw new Error('Not authenticated');
  }

  // If admin, no filter needed (can access all)
  if (user && (user.role === 'super_admin' || user.role === 'treasurer')) {
    return null;
  }

  // If member portal, filter by member ID
  if (member && memberId === member.id) {
    return {
      column: 'member_id',
      value: member.id,
    };
  }

  throw new Error('Unauthorized query');
}

/**
 * Apply authorization to Supabase query
 * 
 * Usage:
 * const query = supabase.from('members').select('*');
 * const authorizedQuery = applyAuthFilter(query, 'member');
 */
export function applyAuthFilter<T extends { eq: Function }>(
  query: T,
  resourceType: string,
  memberId?: string
): T {
  const filter = buildAuthFilter(resourceType, memberId);
  
  if (!filter) {
    // No filter needed (admin access to all)
    return query;
  }

  return query.eq(filter.column, filter.value);
}

/**
 * Log a query authorization check for audit purposes
 */
export async function logQueryAuthorization(
  resourceType: string,
  action: 'read' | 'write' | 'delete',
  result: 'allowed' | 'denied',
  reason?: string
): Promise<void> {
  const user = getCurrentUser();
  const member = getCurrentMember();

  const log = {
    timestamp: new Date().toISOString(),
    userId: user?.id || member?.id,
    resourceType,
    action,
    result,
    reason,
  };

  if (result === 'denied') {
    console.warn('Authorization denied:', log);
  }

  // Could be extended to log to audit_logs table
}
