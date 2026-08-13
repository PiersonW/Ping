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
  PanResponder,
} from 'react-native';
import { supabase } from '../supabase';
import { useAuth } from '../lib/AuthContext';
import { colors } from '../lib/theme';
import { notify } from '../lib/notify';
import { displayName } from '../lib/displayName';
import { useMessageReactions } from '../lib/useMessageReactions';
import ReactionPicker from './ReactionPicker';

const PAGE_SIZE = 30;

type Message = {
  id: string;
  event_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Props = {
  eventId: string;
  onFlipBack: () => void;
};

export default function MessageThread({ eventId, onFlipBack }: Props) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const inputRef = useRef<TextInput>(null);

  const updateDraft = (text: string) => {
    draftRef.current = text;
    setDraft(text);
  };
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [myInviteeId, setMyInviteeId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [reactingToId, setReactingToId] = useState<string | null>(null);
  const { reactionsByMessage, fetchForIds, toggleReaction } = useMessageReactions(
    'message_id',
    session?.user?.id
  );

  // A rightward swipe anywhere on the thread also triggers the same
  // back-out as the button - only claims the gesture once the movement is
  // clearly horizontal, so it doesn't fight the FlatList's vertical scroll.
  const swipeBackResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 60 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5) {
          onFlipBack();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('invitees')
      .select('id, muted')
      .eq('event_id', eventId)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMyInviteeId(data?.id || null);
        setMuted(!!data?.muted);
      });
  }, [eventId, session?.user?.id]);

  const toggleMuted = async () => {
    if (!myInviteeId) return;
    const next = !muted;
    setMuted(next);
    const { error } = await supabase.from('invitees').update({ muted: next }).eq('id', myInviteeId);
    if (error) {
      console.error('Error updating mute state:', error);
      setMuted(!next);
    }
  };

  const senderName = (m: Message) =>
    m.sender_id === session?.user?.id ? 'You' : displayName(m.profiles, 'Someone');

  // KeyboardAvoidingView is unreliable inside this component's nested,
  // animated (flip-card) ancestor chain - it was observed collapsing the
  // input mid-type. Track the real keyboard height directly instead and
  // apply it as an explicit offset.
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
      .from('messages')
      .select('id, event_id, sender_id, body, created_at, profiles(full_name, email)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }
    const page = (data as any[]) || [];
    setMessages(page);
    setHasMore(page.length === PAGE_SIZE);
    fetchForIds(page.map((m) => m.id));
  }, [eventId, fetchForIds]);

  const loadOlder = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const oldest = messages[messages.length - 1];
    const { data, error } = await supabase
      .from('messages')
      .select('id, event_id, sender_id, body, created_at, profiles(full_name, email)')
      .eq('event_id', eventId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    setLoadingMore(false);

    if (error) {
      console.error('Error loading older messages:', error);
      return;
    }
    const page = (data as any[]) || [];
    setMessages((prev) => [...prev, ...page]);
    setHasMore(page.length === PAGE_SIZE);
    fetchForIds(page.map((m) => m.id));
  };

  useEffect(() => {
    fetchLatest().finally(() => setLoading(false));

    const channel = supabase
      .channel(`messages-${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
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
  }, [eventId, fetchLatest, session?.user?.id]);

  const handleSend = async () => {
    // Tapping Send while an autocorrect suggestion is still highlighted
    // doesn't "accept" it the way pressing space would - blurring forces
    // iOS to commit the pending correction, and the short wait gives its
    // onChangeText time to land before the text is read for sending.
    // Otherwise the uncorrected word goes out, with the correction landing
    // a moment later and nothing sent for it - the second send it looked
    // like this needed.
    inputRef.current?.blur();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const body = draftRef.current.trim();
    if (!body || !session?.user?.id) return;

    setSending(true);
    updateDraft('');

    const { error } = await supabase
      .from('messages')
      .insert([{ event_id: eventId, sender_id: session.user.id, body }]);

    setSending(false);

    if (error) {
      console.error('Error sending message:', error);
      updateDraft(body);
      return;
    }

    await fetchLatest();

    const [{ data: otherInvitees }, { data: eventRow }] = await Promise.all([
      supabase.from('invitees').select('user_id, muted').eq('event_id', eventId).neq('user_id', session.user.id),
      supabase.from('events').select('title').eq('id', eventId).single(),
    ]);

    const recipientIds = (otherInvitees || []).filter((i: any) => !i.muted).map((i: any) => i.user_id);
    // Muted still means "don't buzz my phone," not "hide this from me
    // entirely" - those recipients still get a silent, no-push notification
    // row so there's something to catch up on later.
    const mutedRecipientIds = (otherInvitees || []).filter((i: any) => i.muted).map((i: any) => i.user_id);
    const senderDisplayName =
      session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Someone';
    const notifTitle = eventRow?.title ? `New message — ${eventRow.title}` : 'New message';
    const notifBody = `${senderDisplayName}: ${body}`;

    notify(recipientIds, notifTitle, notifBody, { eventId, type: 'message' });
    notify(mutedRecipientIds, notifTitle, notifBody, { eventId, type: 'message', silent: true });
  };

  return (
    <View style={{ flex: 1 }} {...swipeBackResponder.panHandlers}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onFlipBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Event Details</Text>
        </TouchableOpacity>
        {myInviteeId && (
          <TouchableOpacity onPress={toggleMuted}>
            <Text style={styles.muteText}>{muted ? '🔕 Muted' : '🔔 Mute'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.header}>Messages</Text>

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
            const reactions = reactionsByMessage[item.id] || [];
            return (
              <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
                <View>
                  <TouchableOpacity
                    style={[styles.bubble, isMine && styles.bubbleMine]}
                    activeOpacity={0.85}
                    onLongPress={() => setReactingToId(item.id)}
                  >
                    {!isMine && <Text style={styles.senderName}>{senderName(item)}</Text>}
                    <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                    <Text style={[styles.timestamp, isMine && styles.timestampMine]}>
                      {new Date(item.created_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </TouchableOpacity>
                  {reactions.length > 0 && (
                    <View style={[styles.reactionRow, isMine && styles.reactionRowMine]}>
                      {reactions.map((r) => (
                        <TouchableOpacity
                          key={r.emoji}
                          style={[styles.reactionPill, r.mine && styles.reactionPillMine]}
                          onPress={() => toggleReaction(item.id, r.emoji)}
                        >
                          <Text style={styles.reactionPillText}>
                            {r.emoji}
                            {r.count > 1 ? ` ${r.count}` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
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
          // The card is inset 20px from the screen edge already (its own
          // padding), so only the keyboard height beyond that needs to be
          // reserved here, plus a small buffer so the input floats clear
          // of the keyboard instead of touching it.
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

      <ReactionPicker
        visible={!!reactingToId}
        onClose={() => setReactingToId(null)}
        onSelect={(emoji) => {
          if (reactingToId) toggleReaction(reactingToId, emoji);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backButton: {},
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  muteText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  header: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 12 },
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
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillMine: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  reactionPillText: { fontSize: 13, color: colors.textPrimary },
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
