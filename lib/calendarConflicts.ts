import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type CalendarConflict = {
  title: string;
  startDate: Date;
};

const CONFLICT_WINDOW_BEFORE_MINUTES = 30;
const CONFLICT_WINDOW_AFTER_MINUTES = 90;
// Bounds how far ahead the Upcoming list pulls in phone-calendar events -
// unlike Ping events (a handful of family plans), a phone calendar can hold
// hundreds of recurring entries indefinitely, so this keeps the list from
// filling up with things a year out.
const UPCOMING_WINDOW_DAYS = 60;

export type ExternalEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  // True for events Ping itself wrote (see createPersonalCalendarEvent) -
  // those live in their own dedicated device calendar, so they're the only
  // ExternalEvents safe to offer editing/deleting on. Everything else here
  // came from a calendar the user manages themselves.
  isPersonal: boolean;
};

const PING_CALENDAR_TITLE = 'Ping';

export async function getCalendarPermissionStatus(): Promise<CalendarPermissionStatus> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status as CalendarPermissionStatus;
}

export async function requestCalendarAccess(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// Only call once permission is confirmed granted — this never prompts.
export async function findConflicts(eventDate: Date): Promise<CalendarConflict[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length === 0) return [];

  const windowStart = new Date(eventDate.getTime() - CONFLICT_WINDOW_BEFORE_MINUTES * 60000);
  const windowEnd = new Date(eventDate.getTime() + CONFLICT_WINDOW_AFTER_MINUTES * 60000);

  const events = await Calendar.getEventsAsync(calendarIds, windowStart, windowEnd);

  return events
    .filter((e) => e.title)
    .map((e) => ({ title: e.title, startDate: new Date(e.startDate) }));
}

// Only call once permission is confirmed granted — this never prompts.
// Feeds the Home screen's Upcoming list so phone-calendar events show up
// alongside Ping events without needing to leave the app.
export async function getUpcomingExternalEvents(): Promise<ExternalEvent[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length === 0) return [];
  const pingCalendarIds = new Set(
    calendars.filter((c) => c.title === PING_CALENDAR_TITLE).map((c) => c.id)
  );

  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60000);

  const events = await Calendar.getEventsAsync(calendarIds, windowStart, windowEnd);

  return events
    .filter((e) => e.title)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startDate: new Date(e.startDate),
      endDate: new Date(e.endDate),
      allDay: !!e.allDay,
      isPersonal: pingCalendarIds.has(e.calendarId),
    }));
}

// Personal items get their own dedicated device calendar (created once,
// lazily) rather than landing in whatever the user's default calendar is -
// that's what makes an event "Ping's to edit" unambiguous later (see
// isPersonal above), and it keeps these out of the user's own iCloud/Gmail
// calendar clutter too.
async function getOrCreatePingCalendarId(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === PING_CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing.id;

  // The OS's notion of "default calendar" is very often a synced work/
  // school/Google account, and iOS refuses to create a new calendar under
  // most of those sources - a local, on-device source almost always
  // accepts it, so try that first and only fall back to the default.
  const sources: Calendar.Source[] = [];
  const localSource = calendars.find((c) => c.source?.type === Calendar.SourceType.LOCAL)?.source;
  if (localSource) sources.push(localSource);
  if (Platform.OS === 'ios') {
    try {
      const defaultSource = (await Calendar.getDefaultCalendarAsync()).source;
      if (!sources.some((s) => s.id === defaultSource.id)) sources.push(defaultSource);
    } catch {}
  } else if (sources.length === 0) {
    sources.push({ isLocalAccount: true, name: PING_CALENDAR_TITLE, type: Calendar.SourceType.LOCAL });
  }

  for (const source of sources) {
    try {
      return await Calendar.createCalendarAsync({
        title: PING_CALENDAR_TITLE,
        color: '#5DADE2',
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: source.id,
        source,
        name: 'pingPersonalItems',
        ownerAccount: source.name ?? 'personal',
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
    } catch (err) {
      console.error('Could not create Ping calendar under source', source, err);
    }
  }

  // Every source refused a new calendar - fall back to writing straight
  // into any calendar that already accepts new events, so the save itself
  // still succeeds even though this particular item won't be tagged as
  // Ping's own (isPersonal) until a Ping calendar can be created.
  const fallback = calendars.find((c) => c.allowsModifications);
  if (fallback) return fallback.id;
  throw new Error('No writable calendar available on this device.');
}

// Only call once permission is confirmed granted — this never prompts.
// Writes a personal item straight to the phone's own calendar rather than
// Supabase: nothing here needs to be shared with or visible to anyone
// else, and the phone calendar is already the source of truth this app
// reads "just for me" events back from (see getUpcomingExternalEvents), so
// round-tripping through it is what makes a personal item show up in the
// Upcoming list for free, with no new table or list-merging logic needed.
export async function createPersonalCalendarEvent(
  title: string,
  startDate: Date,
  endDate: Date,
  allDay: boolean
): Promise<void> {
  const calendarId = await getOrCreatePingCalendarId();
  await Calendar.createEventAsync(calendarId, { title, startDate, endDate, allDay });
}

export async function updatePersonalCalendarEvent(
  eventId: string,
  title: string,
  startDate: Date,
  endDate: Date,
  allDay: boolean
): Promise<void> {
  await Calendar.updateEventAsync(eventId, { title, startDate, endDate, allDay });
}

export async function deletePersonalCalendarEvent(eventId: string): Promise<void> {
  await Calendar.deleteEventAsync(eventId);
}
