import { useCallback, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { displayName } from './displayName';

export type LatestMessageInfo = {
  senderName: string;
  body: string;
  createdAt: string;
};

// PostgREST can't express "top-1 per group" without a view/RPC, and this
// repo has no tracked migrations to ship one. A shared .limit() across all
// events would let one chatty event crowd a quieter event's real latest
// message out of the result window, so we fetch one event at a time.
export function useLatestMessages(sessionUserId?: string | null) {
  const [latestByEvent, setLatestByEvent] = useState<Record<string, LatestMessageInfo>>({});
  const fetchedIds = useRef<Set<string>>(new Set());

  const fetchLatestFor = useCallback(
    async (eventIds: string[], force = false) => {
      const idsToFetch = force ? eventIds : eventIds.filter((id) => !fetchedIds.current.has(id));
      if (idsToFetch.length === 0) return;
      idsToFetch.forEach((id) => fetchedIds.current.add(id));

      const results = await Promise.all(
        idsToFetch.map(async (eventId) => {
          const { data, error } = await supabase
            .from('messages')
            .select('sender_id, body, created_at, profiles(full_name, email)')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error || !data) return [eventId, null] as const;

          const senderName =
            data.sender_id === sessionUserId ? 'You' : displayName(data.profiles as any, 'Someone');

          return [
            eventId,
            { senderName, body: data.body, createdAt: data.created_at } as LatestMessageInfo,
          ] as const;
        })
      );

      setLatestByEvent((prev) => {
        const next = { ...prev };
        results.forEach(([eventId, info]) => {
          if (info) next[eventId] = info;
        });
        return next;
      });
    },
    [sessionUserId]
  );

  const refresh = useCallback(
    (eventIds: string[]) => fetchLatestFor(eventIds, true),
    [fetchLatestFor]
  );

  return { latestByEvent, fetchLatestFor, refresh };
}
