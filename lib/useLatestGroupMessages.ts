import { useCallback, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { displayName } from './displayName';

export type LatestGroupMessageInfo = {
  senderName: string;
  body: string;
  createdAt: string;
};

// Mirrors useLatestMessages.ts — same reasoning: PostgREST can't express
// "top-1 per group" without a view/RPC, and this repo has no tracked
// migrations to ship one, so we fetch one group at a time.
export function useLatestGroupMessages(sessionUserId?: string | null) {
  const [latestByGroup, setLatestByGroup] = useState<Record<string, LatestGroupMessageInfo>>({});
  const fetchedIds = useRef<Set<string>>(new Set());

  const fetchLatestFor = useCallback(
    async (groupIds: string[], force = false) => {
      const idsToFetch = force ? groupIds : groupIds.filter((id) => !fetchedIds.current.has(id));
      if (idsToFetch.length === 0) return;
      idsToFetch.forEach((id) => fetchedIds.current.add(id));

      const results = await Promise.all(
        idsToFetch.map(async (groupId) => {
          const { data, error } = await supabase
            .from('group_messages')
            .select('sender_id, body, created_at, profiles(full_name, email)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error || !data) return [groupId, null] as const;

          const senderName =
            data.sender_id === sessionUserId ? 'You' : displayName(data.profiles as any, 'Someone');

          return [
            groupId,
            { senderName, body: data.body, createdAt: data.created_at } as LatestGroupMessageInfo,
          ] as const;
        })
      );

      setLatestByGroup((prev) => {
        const next = { ...prev };
        results.forEach(([groupId, info]) => {
          if (info) next[groupId] = info;
        });
        return next;
      });
    },
    [sessionUserId]
  );

  const refresh = useCallback(
    (groupIds: string[]) => fetchLatestFor(groupIds, true),
    [fetchLatestFor]
  );

  return { latestByGroup, fetchLatestFor, refresh };
}
