import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dashboardService } from '@/lib/dataService';

export interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  defaulters: number;
  totalWalletBalance: number;
  activeCases: number;
  totalContributions: number;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Use the authorized dashboard service
      return await dashboardService.fetchDashboardSummary();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 10, // Refetch every 10 minutes
  });
}

export function useDefaulters(limit = 10) {
  return useQuery({
    queryKey: ['defaulters', limit],
    queryFn: async () => {
      // Use the authorized dashboard service
      return await dashboardService.fetchDefaulters(limit);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}