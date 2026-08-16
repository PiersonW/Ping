import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../lib/theme';
import { ExternalEvent } from '../lib/calendarConflicts';

type Props = {
  event: ExternalEvent;
  onEdit?: () => void;
};

// Deliberately plain (no card, no border) so a phone-calendar event reads as
// a quick reference line rather than something Ping actually knows about or
// can act on. The one exception is a personal item Ping itself wrote to the
// calendar (see createPersonalCalendarEvent) — those get a pencil and a tap
// target so they can be edited or deleted later.
export default function ExternalEventRow({ event, onEdit }: Props) {
  const dateLabel = event.startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = event.allDay
    ? 'All day'
    : event.startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const editable = event.isPersonal && !!onEdit;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onEdit}
      disabled={!editable}
      activeOpacity={editable ? 0.6 : 1}
    >
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.meta}>
          {dateLabel} · {timeLabel} —{' '}
        </Text>
        {event.title}
      </Text>
      {editable && <Text style={styles.editIcon}>✎</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  text: { flex: 1, fontSize: 14, color: colors.textSecondary },
  meta: { color: colors.textMuted },
  editIcon: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
});
