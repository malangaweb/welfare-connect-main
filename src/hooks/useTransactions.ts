import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { transactionsService } from '@/lib/dataService';
import { persistentCache } from '@/lib/cache';
import { useDebounce } from './useDebounce';
import { useMemo } from 'react';
import { Transaction } from '@/lib/types';

interface UseTransactionsOptions {
  memberId?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  /** Enable persistent caching (default: true) */
  useCache?: boolean;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useTransactions(options: UseTransactionsOptions = {}) {
  const {
    memberId,
    type,
    status,
    page = 1,
    limit = 20,
    search = '',
    useCache = true,
  } = options;

  // Debounce search input (300ms delay)
  const debouncedSearch = useDebounce(search, 300);

  // Generate cache key based on options
  const cacheKey = useMemo(() => 
    `transactions_${memberId || 'all'}_${type || 'all'}_${status || 'all'}_${page}_${limit}_${debouncedSearch}`,
    [memberId, type, status, page, limit, debouncedSearch]
  );

  // Check cache before query
  const cachedData = useMemo(() => {
    if (!useCache) return null;
    return persistentCache.get<{
      transactions: Transaction[];
      totalCount: number;
      totalPages: number;
      currentPage: number;
    }>(cacheKey);
  }, [cacheKey, useCache]);

  return useQuery({
    queryKey: ['transactions', memberId, type, status, page, limit, debouncedSearch],
    queryFn: async () => {
      // Use the authorized data service
      const { data, count } = await transactionsService.fetchTransactions({
        memberId,
        type: type || undefined,
        status: status || undefined,
        page,
        limit,
      });

      const result = {
        transactions: data || [],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
      };

      // Cache the result
      if (useCache) {
        persistentCache.set(cacheKey, result, CACHE_TTL);
      }

      return result;
    },
    // If we have cached data, use it as initial data to show immediately
    initialData: cachedData,
    staleTime: CACHE_TTL,
    refetchOnWindowFocus: false,
  });
}

export function useRecentTransactions(limit = 10) {
  const cacheKey = `recent_transactions_${limit}`;
  
  const cachedData = useMemo(() => {
    return persistentCache.get<Transaction[]>(cacheKey);
  }, []);

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

      // Cache the result
      if (data) {
        persistentCache.set(cacheKey, data as Transaction[], CACHE_TTL);
      }

      return data || [];
    },
    initialData: cachedData,
    staleTime: CACHE_TTL,
    refetchInterval: CACHE_TTL,
  });
}

/**
 * Hook for transaction search with debouncing built-in
 * Useful for search/filter input components
 */
export function useTransactionSearch(initialSearch: string = '') {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const query = useTransactions({
    search: debouncedSearch,
    limit: 20,
    useCache: true,
  });

  return {
    ...query,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
  };
}

// Need to import useState for the search hook
import { useState } from 'react';

export default useTransactions;
