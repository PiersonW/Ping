import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { supabase } from '../supabase';
import { useAuth } from '../lib/AuthContext';
import { colors } from '../lib/theme';
import { notify } from '../lib/notify';
import { displayName } from '../lib/displayName';

const PAGE_SIZE = 30;

type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Props = {
  groupId: string;
};

export default function GroupMessageThread({ groupId }: Props) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const listRef = useRef<FlatList>(null);

  const updateDraft = (text: string) => {
    draftRef.current = text;
    setDraft(text);
  };

  // Owners don't have their own group_members row (see recipient logic in
  // handleSend below), so muting is only offered to actual members for now.
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('group_members')
      .select('id, muted')
      .eq('group_id', groupId)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMyMemberId(data?.id || null);
        setMuted(!!data?.muted);
      });
  }, [groupId, session?.user?.id]);

  const toggleMuted = async () => {
    if (!myMemberId) return;
    const next = !muted;
    setMuted(next);
    const { error } = await supabase.from('group_members').update({ muted: next }).eq('id', myMemberId);
    if (error) {
      console.error('Error updating mute state:', error);
      setMuted(!next);
    }
  };

  const senderName = (m: GroupMessage) =>
    m.sender_id === session?.user?.id ? 'You' : displayName(m.profiles, 'Someone');

  // Same keyboard-tracking gotcha as MessageThread.tsx: KeyboardAvoidingView
  // is unreliable inside this app's nested/animated ancestor chains, so we
  // track the real keyboard height directly instead.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fetchLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_id, body, created_at, profiles(full_name, email)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Error fetching group messages:', error);
      return;
    }
    const page = (data as any[]) || [];
    setMessages(page);
    setHasMore(page.length === PAGE_SIZE);
  }, [groupId]);

  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const oldest = messages[messages.length - 1];
    const { data, error } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_id, body, created_at, profiles(full_name, email)')
      .eq('group_id', groupId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    setLoadingMore(false);

    if (error) {
      console.error('Error loading older group messages:', error);
      return;
    }
    const page = (data as any[]) || [];
    setMessages((prev) => [...prev, ...page]);
    setHasMore(page.length === PAGE_SIZE);
  };

  useEffect(() => {
    fetchLatest().finally(() => setLoading(false));

    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as any;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [{ ...row, profiles: null }, ...prev];
          });

          // postgres_changes payloads are the raw row only - no profiles
          // join support - so the sender's name is fetched separately here
          // and patched onto the message once it arrives.
          if (row.sender_id !== session?.user?.id) {
            supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', row.sender_id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                setMessages((prev) =>
                  prev.map((m) => (m.id === row.id ? { ...m, profiles: data } : m))
                );
              });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchLatest, session?.user?.id]);

  const handleSend = async () => {
    // Same autocorrect-commit issue as MessageThread.tsx - blur first so
    // a highlighted suggestion is accepted before the text is read.
    inputRef.current?.blur();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const body = draftRef.current.trim();
    if (!body || !session?.user?.id) return;

    setSending(true);
    updateDraft('');

    const { error } = await supabase
      .from('group_messages')
      .insert([{ group_id: groupId, sender_id: session.user.id, body }]);

    setSending(false);

    if (error) {
      console.error('Error sending group message:', error);
      updateDraft(body);
      return;
    }

    await fetchLatest();

    // Recipients are the group owner plus resolved members — either role
    // could be the sender, so both need to be included and the sender
    // excluded, unlike events which only ever have one host.
    const [{ data: groupRow }, { data: memberRows }] = await Promise.all([
      supabase.from('groups').select('name, owner_id').eq('id', groupId).single(),
      // Filtering to `.not('user_id', 'is', null)` here used to silently
      // drop anyone whose group_members.user_id was never resolved (added
      // by phone before they had, or had linked, an account) - excluded
      // from the query entirely, so they never got notified even after
      // signing up. Fetch everyone and re-resolve each one's link fresh
      // below instead, same self-healing idea as healContactLink for event
      // invites.
      supabase.from('group_members').select('id, user_id, muted, contacts(linked_user_id)').eq('group_id', groupId),
    ]);

    const healedMembers = await Promise.all(
      (memberRows || []).map(async (m: any) => {
        const resolvedUserId = m.user_id || m.contacts?.linked_user_id || null;
        if (resolvedUserId && resolvedUserId !== m.user_id) {
          await supabase.from('group_members').update({ user_id: resolvedUserId }).eq('id', m.id);
        }
        return { ...m, user_id: resolvedUserId };
      })
    );

    // Owners don't have a group_members row yet (see the mute effect
    // above), so they always land in the normal bucket for now.
    const recipientIds = Array.from(
      new Set(
        [
          groupRow?.owner_id,
          ...healedMembers.filter((m) => !m.muted).map((m) => m.user_id),
        ].filter(Boolean)
      )
    ).filter((id) => id !== session.user.id);
    const mutedRecipientIds = healedMembers
      .filter((m) => m.muted && m.user_id)
      .map((m) => m.user_id as string)
      .filter((id) => id !== session.user.id);

    const senderDisplayName =
      session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Someone';
    const notifTitle = groupRow?.name ? `New message — ${groupRow.name}` : 'New group message';
    const notifBody = `${senderDisplayName}: ${body}`;

    notify(recipientIds, notifTitle, notifBody, { groupId, type: 'group_message' });
    notify(mutedRecipientIds, notifTitle, notifBody, { groupId, type: 'group_message', silent: true });
  };

  return (
    <View style={{ flex: 1 }}>
      {myMemberId && (
        <TouchableOpacity onPress={toggleMuted} style={styles.muteRow}>
          <Text style={styles.muteText}>{muted ? '🔕 Muted' : '🔔 Mute'}</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : !hasMore && messages.length > 0 ? (
              <Text style={styles.endOfThreadText}>Start of conversation</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const isMine = item.sender_id === session?.user?.id;
            return (
              <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, isMine && styles.bubbleMine]}>
                  {!isMine && <Text style={styles.senderName}>{senderName(item)}</Text>}
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.timestamp, isMine && styles.timestampMine]}>
                    {new Date(item.created_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            // FlatList's `inverted` prop flips its whole content via a
            // transform, including ListEmptyComponent — counter-flip so
            // this text renders right-side up.
            <Text style={[styles.emptyText, { transform: [{ scaleY: -1 }] }]}>
              No messages yet — say something!
            </Text>
          }
        />
      )}

      <View
        style={[
          styles.inputRow,
          { marginBottom: keyboardHeight > 0 ? keyboardHeight - 20 + 28 : 12 },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={updateDraft}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !draft.trim()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  muteRow: { alignItems: 'flex-end', marginBottom: 8 },
  muteText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  endOfThreadText: { color: colors.textMuted, textAlign: 'center', fontSize: 12, marginVertical: 12 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.primary, borderColor: colors.primary },
  senderName: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  bubbleText: { color: colors.textPrimary, fontSize: 15 },
  bubbleTextMine: { color: colors.textOnPrimary },
  timestamp: { color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  timestampMine: { color: 'rgba(255,255,255,0.75)' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    maxHeight: 100,
  },
  sendButton: { backgroundColor: colors.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  sendButtonText: { color: colors.textOnPrimary, fontWeight: '600', fontSize: 14 },
});
