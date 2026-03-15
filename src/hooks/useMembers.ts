import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Member } from '@/lib/types';
import { mapDbMemberToMember } from '@/lib/db-types';
import { membersService } from '@/lib/dataService';

interface UseMembersOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  location?: string;
  defaultersOnly?: boolean;
  positiveBalanceOnly?: boolean;
}

export function useMembers(options: UseMembersOptions = {}) {
  const {
    page = 1,
    limit = 50,
    search = '',
    status = 'all',
    location = 'all',
    defaultersOnly = false,
    positiveBalanceOnly = false,
  } = options;

  return useQuery({
    queryKey: ['members', page, limit, search, status, location, defaultersOnly, positiveBalanceOnly],
    queryFn: async () => {
      // Use the authorized data service
      const { data, count } = await membersService.fetchMembers({
        search: search || undefined,
        status: status !== 'all' ? status : undefined,
        location: location !== 'all' ? location : undefined,
        defaultersOnly,
        positiveBalanceOnly,
      });

      const members: Member[] = data?.map(mapDbMemberToMember) || [];

      return {
        members,
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useMemberLocations() {
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

      // Get unique locations
      const locations = [...new Set(data?.map(r => r.location) || [])];
      return locations.sort();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}