import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { transactionsService } from '@/lib/dataService';

interface UseTransactionsOptions {
  memberId?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const {
    memberId,
    type,
    status,
    page = 1,
    limit = 20,
  } = options;

  return useQuery({
    queryKey: ['transactions', memberId, type, status, page, limit],
    queryFn: async () => {
      // Use the authorized data service
      const { data, count } = await transactionsService.fetchTransactions({
        memberId,
        type: type || undefined,
        status: status || undefined,
        page,
        limit,
      });

      return {
        transactions: data || [],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useRecentTransactions(limit = 10) {
  return useQuery({
    queryKey: ['recent-transactions', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, members(member_number, first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    },
    staleTime: 1000 * 60 * 1, // 1 minute
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });
}