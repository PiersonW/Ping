import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';
import { useNotifications } from './useNotifications';
import { submitRsvp, RsvpStatus } from './rsvp';
import { displayName } from './displayName';

const QUICK_RSVP_ACTIONS: Record<string, Exclude<RsvpStatus, 'pending'>> = {
  accept: 'accepted',
  interested: 'interested',
  decline: 'declined',
};

// Fired when someone RSVPs straight from the notification's Accept/
// Interested/Decline quick-actions instead of opening the InvitePopup -
// looks up the same data the popup would have already had loaded.
async function submitQuickRsvp(eventId: string, userId: string, status: Exclude<RsvpStatus, 'pending'>) {
  const [{ data: eventRow }, { data: inviteeRow }, { data: profile }] = await Promise.all([
    supabase.from('events').select('title, host_id').eq('id', eventId).maybeSingle(),
    supabase.from('invitees').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('full_name, email').eq('id', userId).maybeSingle(),
  ]);
  if (!eventRow) return;

  await submitRsvp({
    eventId,
    hostId: eventRow.host_id,
    eventTitle: eventRow.title,
    userId,
    myInviteeId: inviteeRow?.id || null,
    responderName: displayName(profile),
    status,
  });
}

type PendingEventModal = { eventId: string; startOnMessages: boolean } | null;

type NotificationsContextType = ReturnType<typeof useNotifications> & {
  popupEventId: string | null;
  openInvitePopup: (eventId: string) => void;
  closeInvitePopup: () => void;
  pendingEventModal: PendingEventModal;
  openEventModal: (eventId: string, startOnMessages?: boolean) => void;
  clearEventModal: () => void;
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
  pendingEventModal: null,
  openEventModal: () => {},
  clearEventModal: () => {},
});

function getNotificationData(data: unknown): { type: string; eventId?: string; groupId?: string } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as any;
  return typeof d.type === 'string' ? d : null;
}

function isInviteNotificationData(data: unknown): data is { type: string; eventId: string } {
  const d = getNotificationData(data);
  return !!d && d.type === 'invite' && !!d.eventId;
}

// A single shared instance so the Home screen's badge and the Notifications
// screen's list are always looking at the exact same state — two separate
// hook instances bridged only by focus-refetch left the badge unable to
// notice changes made on the other screen.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const notificationsValue = useNotifications(session?.user?.id);
  const [popupEventId, setPopupEventId] = useState<string | null>(null);
  const [pendingEventModal, setPendingEventModal] = useState<PendingEventModal>(null);

  const openInvitePopup = (eventId: string) => setPopupEventId(eventId);
  const closeInvitePopup = () => setPopupEventId(null);
  const openEventModal = (eventId: string, startOnMessages = false) =>
    setPendingEventModal({ eventId, startOnMessages });
  const clearEventModal = () => setPendingEventModal(null);

  // Turns an incoming/tapped push notification into the right in-app view
  // instead of leaving the tap to do nothing (no listener for this existed
  // before) or relying on the native banner alone - an invite opens the
  // InvitePopup, anything else with an event opens the same card modal used
  // everywhere else in the app (Home screen listens for pendingEventModal).
  useEffect(() => {
    if (!session?.user?.id) return;

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (isInviteNotificationData(data)) openInvitePopup(data.eventId);
    });

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;

      if (isInviteNotificationData(data)) {
        const quickStatus = QUICK_RSVP_ACTIONS[response.actionIdentifier];
        if (quickStatus) {
          submitQuickRsvp(data.eventId, session.user.id, quickStatus);
          return;
        }
        openInvitePopup(data.eventId);
        return;
      }

      const generic = getNotificationData(data);
      if (generic?.eventId) {
        openEventModal(generic.eventId, generic.type === 'message');
      }
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [session?.user?.id]);

  const value: NotificationsContextType = {
    ...notificationsValue,
    popupEventId,
    openInvitePopup,
    closeInvitePopup,
    pendingEventModal,
    openEventModal,
    clearEventModal,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotificationsContext = () => useContext(NotificationsContext);
