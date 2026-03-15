/**
 * Data Service Layer with Authorization Middleware
 * 
 * This module wraps all Supabase queries with authorization checks.
 * It ensures that all data access is controlled by the custom authorization layer.
 */

import { supabase } from '@/integrations/supabase/client';
import { authorizeQuery } from './queryAuthorization';
import { getCurrentUser } from './authorization';
import { User, Member } from './types';

/**
 * Authorization context for data operations
 */
export interface DataOperationContext {
  user: User | null;
}

/**
 * Get current authorization context
 */
function getAuthContext(): DataOperationContext {
  return {
    user: getCurrentUser(),
  };
}

/**
 * Members Data Service
 */
export const membersService = {
  /**
   * Fetch members with authorization
   */
  async fetchMembers(filters?: {
    search?: string;
    status?: string;
    location?: string;
    defaultersOnly?: boolean;
    positiveBalanceOnly?: boolean;
  }) {
    const context = getAuthContext();
    
    // Authorize query
    try {
      authorizeQuery({ resourceType: 'member' });
    } catch (error) {
      console.error('Authorization failed for members query:', error);
      throw new Error('Unauthorized: Cannot read members');
    }

    let query = supabase.from('members').select('*', { count: 'exact' });

    // Apply filters
    if (filters?.search) {
      query = query.or(
        `member_number.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,phone_number.ilike.%${filters.search}%`
      );
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.location && filters.location !== 'all') {
      query = query.eq('residences.location', filters.location);
    }

    if (filters?.defaultersOnly) {
      query = query.lt('wallet_balance', 0);
    }

    if (filters?.positiveBalanceOnly) {
      query = query.gt('wallet_balance', 0);
    }

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return { data: data as Member[], count };
  },

  /**
   * Fetch single member with authorization
   */
  async fetchMember(memberId: string) {
    const context = getAuthContext();

    // Check if user can access this member
    try {
      authorizeQuery({ resourceType: 'member', resourceId: memberId });
    } catch (error) {
      console.error(`Authorization failed for member ${memberId}:`, error);
      throw new Error('Unauthorized: Cannot access this member');
    }

    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Get member with all related data (cases, transactions, etc.)
   */
  async fetchMemberWithDetails(memberId: string) {
    const context = getAuthContext();

    // Check if user can access this member
    try {
      authorizeQuery({ resourceType: 'member', resourceId: memberId });
    } catch (error) {
      throw new Error('Unauthorized: Cannot access this member');
    }

    // Fetch member
    const memberPromise = supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();

    // Fetch cases
    const casesPromise = supabase
      .from('cases')
      .select('*')
      .eq('member_id', memberId);

    // Fetch transactions
    const transactionsPromise = supabase
      .from('transactions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    const [memberResult, casesResult, transactionsResult] = await Promise.all([
      memberPromise,
      casesPromise,
      transactionsPromise,
    ]);

    if (memberResult.error) {
      throw memberResult.error;
    }

    return {
      member: memberResult.data,
      cases: casesResult.data || [],
      transactions: transactionsResult.data || [],
    };
  },
};

/**
 * Transactions Data Service
 */
export const transactionsService = {
  /**
   * Fetch transactions with authorization
   */
  async fetchTransactions(filters?: {
    memberId?: string;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const context = getAuthContext();
    const memberId = filters?.memberId;

    // If fetching member-specific transactions, check authorization
    if (memberId) {
      try {
        authorizeQuery({ resourceType: 'transaction', memberId });
      } catch (error) {
        console.error(`Authorization failed for transaction query`, error);
        throw new Error('Unauthorized: Cannot access these transactions');
      }
    } else {
      // General transaction access check
      try {
        authorizeQuery({ resourceType: 'transaction' });
      } catch (error) {
        throw new Error('Unauthorized: Cannot read transactions');
      }
    }

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' });

    if (memberId) {
      query = query.eq('member_id', memberId);
    }

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Order by created_at descending
    query = query.order('created_at', { ascending: false, nullsFirst: false });

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return { data, count };
  },

  /**
   * Fetch single transaction with authorization
   */
  async fetchTransaction(transactionId: string) {
    const context = getAuthContext();

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (error) {
      throw error;
    }

    if (data && typeof data === 'object' && 'member_id' in data) {
      try {
        authorizeQuery({ resourceType: 'transaction', memberId: (data as any).member_id });
      } catch (error) {
        throw new Error('Unauthorized: Cannot access this transaction');
      }
    }

    return data;
  },
};

/**
 * Cases Data Service
 */
export const casesService = {
  /**
   * Fetch cases with authorization
   */
  async fetchCases(filters?: {
    memberId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const context = getAuthContext();

    // Check authorization
    try {
      authorizeQuery({ resourceType: 'case' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read cases');
    }

    let query = supabase
      .from('cases')
      .select('*', { count: 'exact' });

    if (filters?.memberId) {
      // Check if user can access this member's cases
      try {
        authorizeQuery({ resourceType: 'member', resourceId: filters.memberId });
      } catch (error) {
        throw new Error('Unauthorized: Cannot access these cases');
      }

      query = query.eq('member_id', filters.memberId);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return { data, count };
  },

  /**
   * Fetch single case with authorization
   */
  async fetchCase(caseId: string) {
    const context = getAuthContext();

    const { data: caseData, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (error) {
      throw error;
    }

    // Check if user can access this case
    if (caseData && typeof caseData === 'object' && 'member_id' in caseData) {
      try {
        authorizeQuery({ resourceType: 'member', resourceId: (caseData as any).member_id });
      } catch (error) {
        throw new Error('Unauthorized: Cannot access this case');
      }
    }

    return caseData;
  },
};

/**
 * Users Data Service
 */
export const usersService = {
  /**
   * Fetch users with authorization (admin only)
   */
  async fetchUsers() {
    const context = getAuthContext();

    // Check authorization - only admins can fetch users
    try {
      authorizeQuery({ resourceType: 'user' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read users');
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Fetch single user with authorization
   */
  async fetchUser(userId: string) {
    const context = getAuthContext();

    // Check authorization - admins only
    try {
      authorizeQuery({ resourceType: 'user' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read users');
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
};

/**
 * Dashboard Data Service
 */
export const dashboardService = {
  /**
   * Fetch dashboard summary with authorization
   */
  async fetchDashboardSummary() {
    const context = getAuthContext();

    // Check authorization
    try {
      authorizeQuery({ resourceType: 'member' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read dashboard data');
    }

    const { data, error } = await supabase.rpc('get_dashboard_summary');

    if (error) {
      throw error;
    }

    const stats = (data && data[0]) || {
      total_members: 0,
      active_members: 0,
      defaulters_count: 0,
      total_wallet_balance: 0,
      active_cases: 0,
      total_contributions: 0,
    };

    return {
      totalMembers: stats.total_members,
      activeMembers: stats.active_members,
      defaulters: stats.defaulters_count,
      totalWalletBalance: stats.total_wallet_balance,
      activeCases: stats.active_cases,
      totalContributions: stats.total_contributions,
    };
  },

  /**
   * Fetch defaulters list with authorization
   */
  async fetchDefaulters(limit: number = 10) {
    const context = getAuthContext();

    // Check authorization
    try {
      authorizeQuery({ resourceType: 'member' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read defaulters data');
    }

    const { data, error } = await supabase
      .from('members')
      .select('*')
      .lt('wallet_balance', 0)
      .order('wallet_balance', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Fetch weekly statistics with authorization
   */
  async fetchWeeklyStats() {
    const context = getAuthContext();

    // Check authorization
    try {
      authorizeQuery({ resourceType: 'member' });
    } catch (error) {
      throw new Error('Unauthorized: Cannot read statistics');
    }

    const { data, error } = await supabase.rpc('get_weekly_stats');

    if (error) {
      throw error;
    }

    return data;
  },
};

/**
 * Generic authorized query function
 * Use this for custom queries
 */
export async function executeAuthorizedQuery<T>(
  resource: string,
  action: 'read' | 'write' | 'delete',
  queryFn: () => Promise<T>
): Promise<T> {
  const context = getAuthContext();

  try {
    authorizeQuery({ resourceType: resource as any });
  } catch (error) {
    throw new Error(`Unauthorized: Cannot ${action} ${resource}`);
  }

  return queryFn();
}
