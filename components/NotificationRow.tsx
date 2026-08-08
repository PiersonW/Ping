import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';
import { NotificationRow as NotificationRowData } from '../lib/useNotifications';

type Props = {
  notification: NotificationRowData;
  onPress: (notification: NotificationRowData) => void;
};

// Same unread visual language as CompactEventRow/CompactGroupRow (bold title,
// tinted date/preview, blue dot) — reused rather than reinvented.
export default function NotificationRow({ notification, onPress }: Props) {
  const unread = !notification.read_at;
  const dateLabel = new Date(notification.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onPress(notification)}>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={[styles.date, unread && styles.dateUnread]}>{dateLabel}</Text>
        </View>
        <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
      {unread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 10,
  },
  textCol: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  titleUnread: { fontWeight: '800' },
  date: { color: colors.textMuted, fontSize: 12, marginLeft: 8 },
  dateUnread: { color: colors.primary, fontWeight: '700' },
  preview: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
  previewUnread: { color: colors.textPrimary, fontWeight: '600' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
