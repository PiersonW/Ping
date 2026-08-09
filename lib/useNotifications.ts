import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { NotificationType } from './notify';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  event_id: string | null;
  group_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type PendingInvite = {
  id: string;
  event_id: string;
  events: {
    id: string;
    title: string;
    location: string;
    event_date: string;
    host_id: string | null;
    is_public: boolean;
    image_url: string | null;
    status: 'sent' | 'draft';
  };
};

// Pending-invite reminders are always computed live from `invitees` rather
// than stored — they naturally disappear once the user actually responds, no
// separate "mark as seen" bookkeeping needed.
export function useNotifications(userId?: string | null) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!userId) return;

    const [{ data: notifs, error: notifsError }, { data: pending, error: pendingError }] = await Promise.all([
      // event_reminder rows are inserted up front dated at their future fire
      // time (see lib/eventReminders.ts) so they don't count as "new" or show
      // up here until that time actually arrives.
      supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .lte('created_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('invitees')
        .select('id, event_id, events(*)')
        .eq('user_id', userId)
        .eq('rsvp_status', 'pending')
        .is('responded_at', null),
    ]);

    if (notifsError) console.error('Error fetching notifications:', notifsError);
    if (pendingError) console.error('Error fetching pending invites:', pendingError);

    setNotifications((notifs as NotificationRow[]) || []);

    const now = Date.now();
    const upcoming = ((pending as any[]) || []).filter(
      (p) => p.events && new Date(p.events.event_date).getTime() >= now
    ) as PendingInvite[];
    upcoming.sort((a, b) => new Date(a.events.event_date).getTime() - new Date(b.events.event_date).getTime());
    setPendingInvites(upcoming);
  }, [userId]);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  // A future-dated event_reminder row "becoming due" isn't a database write
  // — nothing fires a realtime event for it. A minute-granularity poll is
  // the simplest reliable way to notice that transition without needing the
  // app to be reopened.
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [userId, fetchAll]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          // A reminder scheduled for the future still fires this INSERT
          // event immediately — ignore it here, it'll surface on a later
          // refresh() once its dated created_at has actually passed.
          if (new Date(row.created_at).getTime() > Date.now()) return;
          setNotifications((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          // A repeated chat message updates its existing unread row in
          // place (see lib/notify.ts consolidateMessageNotification)
          // rather than inserting a new one — move it back to the top with
          // its refreshed body/timestamp.
          const row = payload.new as NotificationRow;
          setNotifications((prev) => {
            const rest = prev.filter((n) => n.id !== row.id);
            return [row, ...rest];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('Error marking notification read:', error);
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error } = await supabase.from('notifications').update({ read_at: now }).in('id', unreadIds);
    if (error) console.error('Error marking all notifications read:', error);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length + pendingInvites.length;

  return { notifications, pendingInvites, unreadCount, loading, refresh: fetchAll, markRead, markAllRead };
}
