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
    // unread row per recipient/event (or group) instead of piling up one
    // notification per change, same as how a phone shows one thread for
    // several texts in a row rather than a line per text.
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
  let query = supabase
    .from('notifications')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('type', type)
    .is('read_at', null);
  query = eventId ? query.eq('event_id', eventId) : query.eq('group_id', groupId);

  const { data: existing, error: findError } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) {
    console.error('Error checking existing notification:', findError);
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from('notifications')
      .update({ title, body, created_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) console.error('Error updating notification:', error);
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .insert([{ recipient_id: recipientId, type, event_id: eventId, group_id: groupId, title, body }]);
  if (error) console.error('Error saving notification:', error);
}
