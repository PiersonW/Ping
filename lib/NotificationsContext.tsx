import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useNotifications } from './useNotifications';

type NotificationsContextType = ReturnType<typeof useNotifications>;

const noopAsync = async () => {};

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  pendingInvites: [],
  unreadCount: 0,
  loading: true,
  refresh: noopAsync,
  markRead: noopAsync,
  markAllRead: noopAsync,
});

// A single shared instance so the Home screen's badge and the Notifications
// screen's list are always looking at the exact same state — two separate
// hook instances bridged only by focus-refetch left the badge unable to
// notice changes made on the other screen.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const value = useNotifications(session?.user?.id);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotificationsContext = () => useContext(NotificationsContext);
