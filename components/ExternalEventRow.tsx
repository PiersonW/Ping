import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { ExternalEvent } from '../lib/calendarConflicts';

type Props = {
  event: ExternalEvent;
};

// Deliberately plain (no card, no border, no tap target) so a phone-calendar
// event reads as a quick reference line rather than something Ping actually
// knows about or can act on — it's just there so you don't have to leave the
// app to see it's on your day.
export default function ExternalEventRow({ event }: Props) {
  const dateLabel = event.startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = event.allDay
    ? 'All day'
    : event.startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.row}>
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.meta}>
          {dateLabel} · {timeLabel} —{' '}
        </Text>
        {event.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, paddingHorizontal: 24 },
  text: { fontSize: 14, color: colors.textSecondary },
  meta: { color: colors.textMuted },
});
