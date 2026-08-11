import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, cardFrameGradient } from '../lib/theme';
import { formatEventDate, formatEventTime } from '../lib/eventDate';

export type PingEvent = {
  id: string;
  title: string;
  location: string;
  event_date: string;
  end_date?: string | null;
  is_all_day?: boolean;
  status?: 'sent' | 'draft';
  image_url?: string | null;
};

type RsvpStatus = 'pending' | 'accepted' | 'interested' | 'declined';

const RSVP_BADGE: Record<'accepted' | 'interested' | 'declined', { label: string; color: string }> = {
  accepted: { label: 'Accepted', color: colors.success },
  interested: { label: 'Interested', color: colors.warning },
  declined: { label: 'Declined', color: colors.danger },
};

type Props = {
  event: PingEvent;
  onPress?: (event: PingEvent) => void;
  highlight?: boolean;
  // Your own response, shown as a small badge so you don't have to open
  // the card just to remember what you already told the host.
  rsvpStatus?: RsvpStatus;
};

export default function EventCard({ event, onPress, highlight, rsvpStatus }: Props) {
  const rsvpBadge = rsvpStatus && rsvpStatus !== 'pending' ? RSVP_BADGE[rsvpStatus] : null;
  const dateLabel = formatEventDate(event.event_date, event.end_date, 'short');
  const timeLabel = formatEventTime(event.event_date, event.is_all_day);

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

          {!!rsvpBadge && (
            <View style={[styles.rsvpBadge, { backgroundColor: rsvpBadge.color }]}>
              <Text style={styles.rsvpBadgeText}>{rsvpBadge.label}</Text>
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
  rsvpBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rsvpBadgeText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  image: { width: '100%', height: 140, borderRadius: 12, marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  statBar: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6, gap: 2 },
  statText: { color: colors.textSecondary, fontSize: 13 },
});
