import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Member } from '@/lib/types';
import { DbMember, mapDbMemberToMember } from '@/lib/db-types';
import { membersService } from '@/lib/dataService';
import { persistentCache } from '@/lib/cache';
import { useDebounce } from './useDebounce';
import { useState, useMemo } from 'react';

interface UseMembersOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  location?: string;
  defaultersOnly?: boolean;
  positiveBalanceOnly?: boolean;
  /** Enable persistent caching (default: true) */
  useCache?: boolean;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useMembers(options: UseMembersOptions = {}) {
  const {
    page = 1,
    limit = 50,
    search = '',
    status = 'all',
    location = 'all',
    defaultersOnly = false,
    positiveBalanceOnly = false,
    useCache = true,
  } = options;

  // Debounce search input (300ms delay)
  const debouncedSearch = useDebounce(search, 300);

  // Generate cache key based on options
  const cacheKey = useMemo(() => 
    `members_${page}_${limit}_${debouncedSearch}_${status}_${location}_${defaultersOnly}_${positiveBalanceOnly}`,
    [page, limit, debouncedSearch, status, location, defaultersOnly, positiveBalanceOnly]
  );

  // Check cache before query
  const cachedData = useMemo(() => {
    if (!useCache) return null;
    return persistentCache.get<{
      members: Member[];
      totalCount: number;
      totalPages: number;
      currentPage: number;
    }>(cacheKey);
  }, [cacheKey, useCache]);

  const query = useQuery({
    queryKey: ['members', page, limit, debouncedSearch, status, location, defaultersOnly, positiveBalanceOnly],
    queryFn: async () => {
      // Use the authorized data service
      const { data, count } = await membersService.fetchMembers({
        search: debouncedSearch || undefined,
        status: status !== 'all' ? status : undefined,
        location: location !== 'all' ? location : undefined,
        defaultersOnly,
        positiveBalanceOnly,
      });

      const members = (data || []).map((dbMember: unknown) => mapDbMemberToMember(dbMember as Parameters<typeof mapDbMemberToMember>[0]));

      const result = {
        members,
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
    // Refetch in background even with cached data to ensure freshness
    refetchOnWindowFocus: false,
  });

  return query;
}

export function useMemberLocations() {
  const cacheKey = 'member_locations';
  
  const cachedLocations = useMemo(() => {
    return persistentCache.get<string[]>(cacheKey);
  }, []);

  return useQuery({
    queryKey: ['member-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('residences')
        .select('location')
        .not('location', 'is', null);

      if (error) {
        throw error;
      }

      // Get unique locations - explicitly type the data
      const rawData = data as { location: string }[] | null;
      const locations = [...new Set((rawData || []).map(r => r.location).filter(Boolean))];
      const sortedLocations = locations.sort();
      
      // Cache the result
      persistentCache.set(cacheKey, sortedLocations, CACHE_TTL);
      
      return sortedLocations;
    },
    initialData: cachedLocations,
    staleTime: CACHE_TTL,
  });
}

/**
 * Hook for member search with debouncing built-in
 * Useful for search input components
 */
export function useMemberSearch(initialSearch: string = '') {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const query = useMembers({
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

export default useMembers;
