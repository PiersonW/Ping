import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import EventDetailContent from '../../components/EventDetailContent';

// Full-page version of the event detail, used for deep links rather
// than tapping a card in the feed. The feed itself uses EventDetailModal
// instead, so the event opens as a card there.
export default function EventDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <EventDetailContent eventId={id} onClose={() => router.back()} variant="page" />
    </>
  );
}
