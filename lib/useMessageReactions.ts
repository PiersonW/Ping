import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

export type ReactionCount = { emoji: string; count: number; mine: boolean };

type Column = 'message_id' | 'group_message_id';

type ReactionRow = { emoji: string; user_id: string };

// Shared between MessageThread (event chat) and GroupMessageThread - the
// only difference between the two is which foreign key column on
// message_reactions points at "the message" (see the migration this backs).
export function useMessageReactions(column: Column, currentUserId?: string | null) {
  const [byMessage, setByMessage] = useState<Record<string, ReactionRow[]>>({});

  const fetchForIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from('message_reactions')
        .select(`${column}, user_id, emoji`)
        .in(column, ids);
      if (error) {
        console.error('Error fetching reactions:', error);
        return;
      }
      setByMessage((prev) => {
        const next = { ...prev };
        // Cleared first so a reaction removed elsewhere actually disappears
        // here too, instead of only ever accumulating.
        ids.forEach((id) => {
          next[id] = [];
        });
        (data || []).forEach((r: any) => {
          const msgId = r[column];
          next[msgId] = [...(next[msgId] || []), { emoji: r.emoji, user_id: r.user_id }];
        });
        return next;
      });
    },
    [column]
  );

  // No server-side filter (postgres_changes filters only support simple
  // equality, not "id in this list of currently-loaded messages") - re-fetch
  // just the affected message's own reactions instead, which stays correct
  // regardless of which page of the thread that message happens to be on.
  useEffect(() => {
    const channel = supabase
      .channel(`message_reactions_${column}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        const row: any = payload.new || payload.old;
        const msgId = row?.[column];
        if (msgId) fetchForIds([msgId]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [column, fetchForIds]);

  // Tapping the reaction you already left removes it; tapping a different
  // one switches to it - matches iMessage's one-tapback-per-person model,
  // backed by the unique (message, user) index in the migration.
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const mine = (byMessage[messageId] || []).find((r) => r.user_id === currentUserId);

      if (mine && mine.emoji === emoji) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq(column, messageId)
          .eq('user_id', currentUserId);
        if (error) console.error('Error removing reaction:', error);
      } else if (mine) {
        const { error } = await supabase
          .from('message_reactions')
          .update({ emoji })
          .eq(column, messageId)
          .eq('user_id', currentUserId);
        if (error) console.error('Error updating reaction:', error);
      } else {
        const { error } = await supabase
          .from('message_reactions')
          .insert([{ [column]: messageId, user_id: currentUserId, emoji }]);
        if (error) console.error('Error adding reaction:', error);
      }
      await fetchForIds([messageId]);
    },
    [byMessage, column, currentUserId, fetchForIds]
  );

  const reactionsByMessage: Record<string, ReactionCount[]> = {};
  Object.entries(byMessage).forEach(([msgId, rows]) => {
    const counts = new Map<string, ReactionCount>();
    rows.forEach((r) => {
      const existing = counts.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      existing.count += 1;
      if (r.user_id === currentUserId) existing.mine = true;
      counts.set(r.emoji, existing);
    });
    reactionsByMessage[msgId] = Array.from(counts.values());
  });

  return { reactionsByMessage, fetchForIds, toggleReaction };
}
