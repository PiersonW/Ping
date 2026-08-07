import { supabase } from '../supabase';

export function notify(userIds: (string | null | undefined)[], title: string, body: string, data?: object) {
  const ids = Array.from(new Set(userIds.filter(Boolean))) as string[];
  if (ids.length === 0) return;

  supabase.functions
    .invoke('send-push', {
      body: { user_ids: ids, title, body, data },
    })
    .catch((err) => console.error('Push notification failed:', err));
}
