import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '../lib/theme';
import { useNotificationsContext } from '../lib/NotificationsContext';
import { NotificationRow as NotificationRowData } from '../lib/useNotifications';
import CompactEventRow from '../components/CompactEventRow';
import NotificationRow from '../components/NotificationRow';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, pendingInvites, loading, refresh, markRead, markAllRead } = useNotificationsContext();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const openNotification = (n: NotificationRowData) => {
    markRead(n.id);
    if (n.type === 'message' && n.event_id) {
      router.push(`/event/${n.event_id}?messages=1`);
    } else if (n.group_id) {
      router.push(`/groups/${n.group_id}`);
    } else if (n.event_id) {
      router.push(`/event/${n.event_id}`);
    }
  };

  const hasUnread = notifications.some((n) => !n.read_at);
  const isEmpty = !loading && pendingInvites.length === 0 && notifications.length === 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isEmpty ? (
        <Text style={styles.emptyText}>You're all caught up.</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {pendingInvites.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Needs your response</Text>
              </View>
              {pendingInvites.map((p) => (
                <CompactEventRow
                  key={p.id}
                  event={p.events}
                  snippet={{ senderName: 'Invited', body: 'Tap to respond', createdAt: '' }}
                  onPress={() => router.push(`/event/${p.event_id}`)}
                />
              ))}
            </View>
          )}

          {notifications.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent</Text>
                {hasUnread && (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
              </View>
              {notifications.map((n) => (
                <NotificationRow key={n.id} notification={n} onPress={openNotification} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  pageTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  section: { marginTop: 12 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  markAllText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
