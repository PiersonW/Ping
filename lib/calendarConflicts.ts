import * as Calendar from 'expo-calendar';

export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type CalendarConflict = {
  title: string;
  startDate: Date;
};

const CONFLICT_WINDOW_BEFORE_MINUTES = 30;
const CONFLICT_WINDOW_AFTER_MINUTES = 90;

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
