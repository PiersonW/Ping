import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { useNotifications } from './useNotifications';

type NotificationsContextType = ReturnType<typeof useNotifications> & {
  popupEventId: string | null;
  openInvitePopup: (eventId: string) => void;
  closeInvitePopup: () => void;
};

const noopAsync = async () => {};

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  pendingInvites: [],
  unreadCount: 0,
  loading: true,
  refresh: noopAsync,
  markRead: noopAsync,
  markAllRead: noopAsync,
  popupEventId: null,
  openInvitePopup: () => {},
  closeInvitePopup: () => {},
});

function isInviteNotificationData(data: unknown): data is { type: string; eventId: string } {
  return !!data && typeof data === 'object' && (data as any).type === 'invite' && !!(data as any).eventId;
}

// A single shared instance so the Home screen's badge and the Notifications
// screen's list are always looking at the exact same state — two separate
// hook instances bridged only by focus-refetch left the badge unable to
// notice changes made on the other screen.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const notificationsValue = useNotifications(session?.user?.id);
  const [popupEventId, setPopupEventId] = useState<string | null>(null);

  const openInvitePopup = (eventId: string) => setPopupEventId(eventId);
  const closeInvitePopup = () => setPopupEventId(null);

  // Turns an incoming/tapped push notification of type 'invite' into the
  // in-app popup instead of leaving the tap to do nothing (no listener for
  // this existed before) or relying on the native banner alone.
  useEffect(() => {
    if (!session?.user?.id) return;

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (isInviteNotificationData(data)) openInvitePopup(data.eventId);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (isInviteNotificationData(data)) openInvitePopup(data.eventId);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (isInviteNotificationData(data)) openInvitePopup(data.eventId);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [session?.user?.id]);

  const value: NotificationsContextType = { ...notificationsValue, popupEventId, openInvitePopup, closeInvitePopup };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotificationsContext = () => useContext(NotificationsContext);
