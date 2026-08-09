import { supabase } from '../supabase';

export type NotificationType =
  | 'invite'
  | 'event_canceled'
  | 'event_updated'
  | 'message'
  | 'group_message'
  | 'rsvp_update'
  | 'item_claimed'
  | 'event_reminder';

type NotifyOptions = {
  eventId?: string;
  groupId?: string;
  type?: NotificationType;
  // Muted threads still get an in-app notification row (so there's
  // something to review later), just no push banner/buzz for it.
  silent?: boolean;
};

export function notify(
  userIds: (string | null | undefined)[],
  title: string,
  body: string,
  opts?: NotifyOptions
) {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[];
  if (ids.length === 0) return;

  const CONSOLIDATED_TYPES: NotificationType[] = ['message', 'group_message', 'rsvp_update', 'event_updated'];
  if (opts?.type && CONSOLIDATED_TYPES.includes(opts.type)) {
    // Chat messages arrive in bursts, and someone can flip their RSVP
    // several times before the event - collapse repeats into a single
    // row per recipient/event (or group), updated and bumped back to
    // unread each time, instead of piling up one notification per change -
    // same as how a phone shows one thread for several texts in a row
    // rather than a line per text.
    const type = opts.type;
    const eventId = opts.eventId ?? null;
    const groupId = opts.groupId ?? null;
    ids.forEach((id) => {
      consolidateNotification(id, type, eventId, groupId, title, body);
    });
  } else if (opts?.type) {
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

  if (opts?.silent) return;

  supabase.functions
    .invoke('send-push', {
      body: { user_ids: ids, title, body, data: { eventId: opts?.eventId, groupId: opts?.groupId, type: opts?.type } },
    })
    .catch((err) => console.error('Push notification failed:', err));
}

async function consolidateNotification(
  recipientId: string,
  type: NotificationType,
  eventId: string | null,
  groupId: string | null,
  title: string,
  body: string
) {
  // A separate SELECT-then-INSERT/UPDATE here was a check-then-act race:
  // two messages landing close together (normal for an actual
  // conversation) could both run their SELECT before either's INSERT
  // committed, so both saw "no existing row" and both inserted - producing
  // exactly the duplicate lines this is supposed to prevent. thread_key
  // (event_id or group_id, always non-null for these consolidated types)
  // backs a real unique index, so this upsert is atomic at the database
  // level instead of racy round-trips from the client.
  const { error } = await supabase.from('notifications').upsert(
    {
      recipient_id: recipientId,
      type,
      event_id: eventId,
      group_id: groupId,
      thread_key: eventId ?? groupId,
      title,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    },
    { onConflict: 'recipient_id,type,thread_key' }
  );
  if (error) console.error('Error upserting notification:', error);
}
