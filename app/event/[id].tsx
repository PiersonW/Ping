import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import EventDetailContent from '../../components/EventDetailContent';
import MessageThread from '../../components/MessageThread';
import { colors } from '../../lib/theme';

// Full-page version of the event detail, used for deep links rather
// than tapping a card in the feed. The feed itself uses EventDetailModal
// instead, so the event opens as a card there.
//
// A `messages=1` query param (used by notification tap-through) opens
// straight to the chat thread instead of the detail view — the modal's
// flip-card mechanic doesn't apply here, so this just swaps which
// component renders.
export default function EventDetailRoute() {
  const { id, messages } = useLocalSearchParams<{ id: string; messages?: string }>();
  const router = useRouter();
  const [showMessages, setShowMessages] = useState(messages === '1');
  // If a notification deep-linked straight into chat, there's no "front of
  // card" view to flip back to yet - back should leave the event entirely
  // (returning to Notifications) instead of revealing the card underneath.
  const hasShownDetails = useRef(messages !== '1');

  const handleFlipBack = () => {
    if (!hasShownDetails.current) {
      router.back();
      return;
    }
    setShowMessages(false);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {showMessages ? (
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 16 }}>
          <MessageThread eventId={id} onFlipBack={handleFlipBack} />
        </View>
      ) : (
        <EventDetailContent
          eventId={id}
          onClose={() => router.back()}
          variant="page"
          onOpenMessages={() => {
            hasShownDetails.current = true;
            setShowMessages(true);
          }}
        />
      )}
    </>
  );
}
