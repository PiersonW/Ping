import { supabase } from '../supabase';

export type NotificationType =
  | 'invite'
  | 'event_canceled'
  | 'message'
  | 'group_message'
  | 'rsvp_update'
  | 'item_claimed'
  | 'event_reminder';

type NotifyOptions = {
  eventId?: string;
  groupId?: string;
  type?: NotificationType;
};

export function notify(
  userIds: (string | null | undefined)[],
  title: string,
  body: string,
  opts?: NotifyOptions
) {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[];
  if (ids.length === 0) return;

  if (opts?.type) {
    supabase
      .from('notifications')
      .insert(
        ids.map((id) => ({
          recipient_id: id,
          type: opts.type,
          event_id: opts.eventId ?? null,
          group_id: opts.groupId ?? null,
          title,
          body,
        }))
      )
      .then(({ error }) => {
        if (error) console.error('Error saving notification:', error);
      });
  }

  supabase.functions
    .invoke('send-push', {
      body: { user_ids: ids, title, body, data: { eventId: opts?.eventId, groupId: opts?.groupId } },
    })
    .catch((err) => console.error('Push notification failed:', err));
}
