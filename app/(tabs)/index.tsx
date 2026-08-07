import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import EventCard, { PingEvent } from '../../components/EventCard';
import CreateEventModal from '../../components/CreateEventModal';
import EventDetailModal from '../../components/EventDetailModal';
import ProfileMenu from '../../components/ProfileMenu';
import { useAuth } from '../../lib/AuthContext';
import { colors, calendarTheme } from '../../lib/theme';

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [events, setEvents] = useState<PingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDraftsOnly, setShowDraftsOnly] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!session?.user?.id) return;

    // Visibility rule: you only see an event if you have an invitee row
    // for it. Hosting an event auto-creates that row (see
    // CreateEventModal), so this one check covers both "you're hosting"
    // and "you were invited."
    const { data: myInvites, error: inviteError } = await supabase
      .from('invitees')
      .select('event_id')
      .eq('user_id', session.user.id);

    if (inviteError) {
      console.error('Error fetching invited events:', inviteError);
      return;
    }

    const invitedEventIds = Array.from(new Set((myInvites || []).map((i) => i.event_id)));

    if (invitedEventIds.length === 0) {
      setEvents([]);
      return;
    }

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .in('id', invitedEventIds)
      .order('event_date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      return;
    }
    setEvents(data as PingEvent[]);
  }, [session?.user?.id]);

  useEffect(() => {
    fetchEvents().finally(() => setLoading(false));
  }, [fetchEvents]);

  const handleCreated = async (status: 'sent' | 'draft') => {
    setModalVisible(false);
    await fetchEvents();
    setEvents((current) => {
      const newest = [...current].sort(
        (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      )[0];
      if (newest) {
        setJustCreatedId(newest.id);
        setTimeout(() => setJustCreatedId(null), 1500);
      }
      return current;
    });
  };

  const openEvent = (event: PingEvent) => {
    setSelectedEventId(event.id);
    setDetailVisible(true);
  };

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    events.forEach((e) => {
      const key = toDateKey(new Date(e.event_date));
      marks[key] = {
        ...(marks[key] || {}),
        selected: true,
        selectedColor: colors.primaryPale,
        selectedTextColor: colors.textPrimary,
      };
    });
    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] || {}),
        selected: true,
        selectedColor: colors.primary,
        selectedTextColor: colors.textOnPrimary,
      };
    }
    return marks;
  }, [events, selectedDate]);

  const visibleEvents = useMemo(() => {
    let result = events;
    if (showDraftsOnly) {
      result = result.filter((e) => e.status === 'draft');
    }
    if (selectedDate) {
      result = result.filter((e) => toDateKey(new Date(e.event_date)) === selectedDate);
    }
    return result;
  }, [events, selectedDate, showDraftsOnly]);

  const onDayPress = (day: { dateString: string }) => {
    setSelectedDate((prev) => (prev === day.dateString ? null : day.dateString));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.appTitle}>Ping</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowDraftsOnly((prev) => !prev)}>
            <Text style={[styles.draftsText, showDraftsOnly && styles.draftsTextActive]}>
              {showDraftsOnly ? 'Drafts ✓' : 'Drafts'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/groups')}>
            <Text style={styles.groupsText}>Groups</Text>
          </TouchableOpacity>
          <ProfileMenu />
        </View>
      </View>

      <View style={styles.calendarSection}>
        <Calendar
          onDayPress={onDayPress}
          markedDates={markedDates}
          theme={calendarTheme}
          style={styles.calendar}
        />
      </View>

      <View style={styles.listSection}>
        <View style={styles.listHeaderRow}>
          <Text style={styles.pageTitle}>
            {showDraftsOnly ? 'Drafts' : selectedDate ? 'On this day' : 'Upcoming'}
          </Text>
          {selectedDate && (
            <TouchableOpacity onPress={() => setSelectedDate(null)}>
              <Text style={styles.clearFilterText}>Show all</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchEvents} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <EventCard event={item} highlight={item.id === justCreatedId} onPress={openEvent} />
          )}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.emptyText}>
                {showDraftsOnly
                  ? 'No drafts right now.'
                  : selectedDate
                  ? 'No events on this day.'
                  : 'No events yet — tap + to create one.'}
              </Text>
            ) : null
          }
          contentContainerStyle={{ paddingVertical: 12, paddingBottom: 120 }}
        />
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Text style={styles.fabPlus}>+</Text>
      </TouchableOpacity>

      <CreateEventModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={handleCreated}
      />

      <EventDetailModal
        visible={detailVisible}
        eventId={selectedEventId}
        onClose={async () => {
          setDetailVisible(false);
          await fetchEvents();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 4,
  },
  appTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  draftsText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  draftsTextActive: { color: colors.primary },
  groupsText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  calendarSection: { flex: 1 },
  calendar: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  listSection: { flex: 1 },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
  },
  pageTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  clearFilterText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  fabPlus: { color: colors.textOnPrimary, fontSize: 34, fontWeight: '400', marginTop: -2 },
});
