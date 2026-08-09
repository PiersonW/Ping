import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, useRouter } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { NotificationsProvider, useNotificationsContext } from '../lib/NotificationsContext';
import { useProfilePhone } from '../lib/useProfilePhone';
import LoginScreen from './(auth)/login';
import PhoneGateScreen from '../components/PhoneGateScreen';
import InvitePopup from '../components/InvitePopup';
import { colors } from '../lib/theme';

function InvitePopupHost() {
  const router = useRouter();
  const { popupEventId, closeInvitePopup } = useNotificationsContext();

  return (
    <InvitePopup
      eventId={popupEventId}
      onClose={closeInvitePopup}
      onOpenFull={(eventId) => {
        closeInvitePopup();
        router.push(`/event/${eventId}`);
      }}
    />
  );
}

function RootNavigation() {
  const { session, loading } = useAuth();
  const { hasPhone, loading: phoneLoading, refresh: refreshPhone } = useProfilePhone(session?.user?.id);

  if (loading || (session && phoneLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!hasPhone) {
    return <PhoneGateScreen onDone={refreshPhone} />;
  }

  return (
    <NotificationsProvider>
      <Slot />
      <InvitePopupHost />
    </NotificationsProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
