import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, cardFrameGradient } from '../lib/theme';

export type PingEvent = {
  id: string;
  title: string;
  location: string;
  event_date: string;
  status?: 'sent' | 'draft';
  image_url?: string | null;
};

type Props = {
  event: PingEvent;
  onPress?: (event: PingEvent) => void;
  highlight?: boolean;
};

export default function EventCard({ event, onPress, highlight }: Props) {
  const date = new Date(event.event_date);
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={[styles.wrapper, highlight && styles.wrapperHighlight]}
      activeOpacity={0.85}
      onPress={() => onPress?.(event)}
    >
      <LinearGradient
        colors={cardFrameGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frame}
      >
        <View style={styles.inner}>
          {event.status === 'draft' && (
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>DRAFT</Text>
            </View>
          )}

          {!!event.image_url && (
            <Image source={{ uri: event.image_url }} style={styles.image} resizeMode="cover" />
          )}

          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>

          <View style={styles.statBar}>
            <Text style={styles.statText}>
              {dateLabel} · {timeLabel}
            </Text>
            {!!event.location && (
              <Text style={styles.statText} numberOfLines={1}>
                {event.location}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 20, marginVertical: 8, borderRadius: 20 },
  wrapperHighlight: {
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  frame: { borderRadius: 20, padding: 3 },
  inner: { backgroundColor: colors.surface, borderRadius: 17, padding: 10 },
  draftBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  draftBadgeText: { color: '#eee', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  image: { width: '100%', height: 140, borderRadius: 12, marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  statBar: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6, gap: 2 },
  statText: { color: colors.textSecondary, fontSize: 13 },
});
