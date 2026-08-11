// Shared start/end-date formatting so a multi-day range or all-day flag
// reads the same on cards, popups, the detail page, and the calendar.

const dayKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function isMultiDayEvent(eventDate: string, endDate?: string | null): boolean {
  if (!endDate) return false;
  return dayKey(new Date(eventDate)) !== dayKey(new Date(endDate));
}

export function formatEventDate(
  eventDate: string,
  endDate?: string | null,
  style: 'compact' | 'short' | 'long' = 'short'
): string {
  const start = new Date(eventDate);

  if (!isMultiDayEvent(eventDate, endDate)) {
    const opts: Intl.DateTimeFormatOptions =
      style === 'long'
        ? { weekday: 'long', month: 'long', day: 'numeric' }
        : style === 'compact'
        ? { month: 'short', day: 'numeric' }
        : { weekday: 'short', month: 'short', day: 'numeric' };
    return start.toLocaleDateString(undefined, opts);
  }

  const end = new Date(endDate!);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(
    undefined,
    sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' }
  );
  return `${startLabel} – ${endLabel}`;
}

export function formatEventTime(eventDate: string, isAllDay?: boolean | null): string {
  if (isAllDay) return 'All day';
  return new Date(eventDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Every YYYY-MM-DD key from start to end (inclusive) - used to shade each
// day of a multi-day event on the calendar.
export function eachDayKeyInRange(startKey: string, endKey: string): string[] {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const keys: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}
