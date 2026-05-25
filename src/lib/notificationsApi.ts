import { invokeWithAppToken } from "@/lib/appAuth";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
}

export interface NotificationsResponse {
  success: boolean;
  unread_count: number;
  notifications: AppNotification[];
}

export async function fetchNotifications(limit = 20): Promise<NotificationsResponse> {
  const data = await invokeWithAppToken<NotificationsResponse>("api-notifications-list", { limit });
  return {
    success: Boolean(data?.success),
    unread_count: Number(data?.unread_count || 0),
    notifications: Array.isArray(data?.notifications) ? data.notifications : [],
  };
}
