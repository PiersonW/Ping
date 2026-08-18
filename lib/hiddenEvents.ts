import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ping.hiddenExternalEventIds';

// Hiding a phone-calendar event from Upcoming (e.g. a shared family
// calendar's entries that don't pertain to this user) is purely a local
// display preference - nothing about the event itself changes, and it
// doesn't need to sync to Supabase or across devices, so plain on-device
// storage is enough.
export async function getHiddenEventIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    console.error('Error reading hidden events:', err);
    return new Set();
  }
}

async function saveHiddenEventIds(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.error('Error saving hidden events:', err);
  }
}

export async function hideEvent(eventId: string): Promise<Set<string>> {
  const ids = await getHiddenEventIds();
  ids.add(eventId);
  await saveHiddenEventIds(ids);
  return ids;
}

export async function unhideEvent(eventId: string): Promise<Set<string>> {
  const ids = await getHiddenEventIds();
  ids.delete(eventId);
  await saveHiddenEventIds(ids);
  return ids;
}
