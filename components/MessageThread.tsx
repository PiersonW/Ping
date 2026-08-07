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
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList>(null);

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
  }, [eventId]);

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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, fetchLatest]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !session?.user?.id) return;

    setSending(true);
    setDraft('');

    const { error } = await supabase
      .from('messages')
      .insert([{ event_id: eventId, sender_id: session.user.id, body }]);

    setSending(false);

    if (error) {
      console.error('Error sending message:', error);
      setDraft(body);
      return;
    }

    await fetchLatest();

    const [{ data: otherInvitees }, { data: eventRow }] = await Promise.all([
      supabase.from('invitees').select('user_id').eq('event_id', eventId).neq('user_id', session.user.id),
      supabase.from('events').select('title').eq('id', eventId).single(),
    ]);

    const recipientIds = (otherInvitees || []).map((i: any) => i.user_id).filter(Boolean);
    const senderDisplayName =
      session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Someone';

    notify(
      recipientIds,
      eventRow?.title ? `New message — ${eventRow.title}` : 'New message',
      `${senderDisplayName}: ${body}`,
      { eventId }
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity onPress={onFlipBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ Back to details</Text>
      </TouchableOpacity>

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
          ListEmptyComponent={<Text style={styles.emptyText}>No messages yet — say something!</Text>}
        />
      )}

      <View
        style={[
          styles.inputRow,
          // The card is inset 20px from the screen edge already (its own
          // padding), so only the keyboard height beyond that needs to be
          // reserved here, plus a small buffer so the input floats clear
          // of the keyboard instead of touching it.
          { marginBottom: keyboardHeight > 0 ? keyboardHeight - 20 + 12 : 12 },
        ]}
      >
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
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
  backButton: { marginBottom: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
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
