import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import { colors, calendarTheme } from '../lib/theme';
import {
  ExternalEvent,
  getCalendarPermissionStatus,
  requestCalendarAccess,
  createPersonalCalendarEvent,
  updatePersonalCalendarEvent,
  deletePersonalCalendarEvent,
} from '../lib/calendarConflicts';

type Props = {
  visible: boolean;
  initialDate?: string | null;
  editingEvent?: ExternalEvent | null;
  onClose: () => void;
  onSaved: () => void;
};

const toDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type PickerTarget = 'start' | 'end';

// A lightweight, device-only counterpart to a Ping: title + start/end time,
// no invitees, nothing sent. Saved straight to the phone's own calendar
// (see createPersonalCalendarEvent) so it shows up in the Upcoming list
// through the same phone-calendar import path as everything else there.
// Doubles as the edit form when editingEvent is passed - only events Ping
// itself created (its own dedicated calendar) are ever routed here for
// editing, see ExternalEvent.isPersonal.
export default function AddPersonalItemModal({ visible, initialDate, editingEvent, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 60 * 60000));
  const [isAllDay, setIsAllDay] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>('start');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!editingEvent;

  useEffect(() => {
    if (!visible) return;
    setShowPicker(false);

    if (editingEvent) {
      setTitle(editingEvent.title);
      setStartDate(new Date(editingEvent.startDate));
      setEndDate(new Date(editingEvent.endDate));
      setIsAllDay(editingEvent.allDay);
      return;
    }

    setTitle('');
    setIsAllDay(false);
    const start = initialDate ? (() => {
      const [y, m, d] = initialDate.split('-').map(Number);
      const next = new Date();
      next.setFullYear(y, m - 1, d);
      return next;
    })() : new Date();
    setStartDate(start);
    setEndDate(new Date(start.getTime() + 60 * 60000));
  }, [visible, editingEvent, initialDate]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const formatTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const openPicker = (target: PickerTarget, mode: 'date' | 'time') => {
    setPickerTarget(target);
    setPickerMode(mode);
    setShowPicker(true);
  };

  const onChangeTime = (_: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (!selectedDate) return;
    if (pickerTarget === 'start') {
      setStartDate(selectedDate);
      // Keep the end from silently trailing behind a start that just got
      // moved past it - same safeguard EditEventModal uses.
      if (endDate.getTime() <= selectedDate.getTime()) {
        setEndDate(new Date(selectedDate.getTime() + 60 * 60000));
      }
    } else {
      setEndDate(selectedDate);
    }
  };

  const onDayPress = (day: { year: number; month: number; day: number }) => {
    if (pickerTarget === 'start') {
      const next = new Date(startDate);
      next.setFullYear(day.year, day.month - 1, day.day);
      setStartDate(next);
      if (endDate.getTime() < next.getTime()) {
        const nextEnd = new Date(endDate);
        nextEnd.setFullYear(day.year, day.month - 1, day.day);
        setEndDate(nextEnd);
      }
    } else {
      const next = new Date(endDate);
      next.setFullYear(day.year, day.month - 1, day.day);
      setEndDate(next);
    }
    setShowPicker(false);
  };

  const ensurePermission = async (): Promise<boolean> => {
    const status = await getCalendarPermissionStatus();
    if (status === 'granted') return true;
    if (status === 'undetermined') return await requestCalendarAccess();
    Alert.alert('Calendar access needed', "Ping needs calendar access to add personal items. Enable it in Settings.");
    return false;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing info', 'Please add a title.');
      return;
    }

    setSubmitting(true);
    const allowed = await ensurePermission();
    if (!allowed) {
      setSubmitting(false);
      return;
    }

    try {
      const start = new Date(startDate);
      let end = new Date(endDate);
      if (isAllDay) {
        start.setHours(0, 0, 0, 0);
        end = new Date(start.getTime() + 24 * 60 * 60000);
      } else if (end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 60 * 60000);
      }

      if (editingEvent) {
        await updatePersonalCalendarEvent(editingEvent.id, title.trim(), start, end, isAllDay);
      } else {
        await createPersonalCalendarEvent(title.trim(), start, end, isAllDay);
      }
      onSaved();
    } catch (err) {
      console.error('Error saving personal calendar item:', err);
      Alert.alert('Error', 'Could not save that to your calendar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingEvent) return;
    Alert.alert('Delete this item?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await deletePersonalCalendarEvent(editingEvent.id);
            onSaved();
          } catch (err) {
            console.error('Error deleting personal calendar item:', err);
            Alert.alert('Error', 'Could not delete that item.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.header}>{isEditing ? 'Edit Personal Item' : 'Add Personal Item'}</Text>
          <Text style={styles.subheader}>
            Only you can see this — it's saved to your phone's calendar, not sent to anyone.
          </Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Dentist appointment"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            autoFocus={!isEditing}
          />

          <Text style={styles.label}>Starts</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.pillButton} onPress={() => openPicker('start', 'date')}>
              <Text style={styles.pillButtonText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
            {!isAllDay && (
              <TouchableOpacity style={styles.pillButton} onPress={() => openPicker('start', 'time')}>
                <Text style={styles.pillButtonText}>{formatTime(startDate)}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Ends</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.pillButton} onPress={() => openPicker('end', 'date')}>
              <Text style={styles.pillButtonText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
            {!isAllDay && (
              <TouchableOpacity style={styles.pillButton} onPress={() => openPicker('end', 'time')}>
                <Text style={styles.pillButtonText}>{formatTime(endDate)}</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.allDayRow} onPress={() => setIsAllDay((v) => !v)}>
            <View style={[styles.checkbox, isAllDay && styles.checkboxChecked]}>
              {isAllDay && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.allDayText}>All day</Text>
          </TouchableOpacity>

          {showPicker && pickerMode === 'date' && (
            <View style={styles.calendarWrap}>
              <Calendar
                current={toDateString(pickerTarget === 'end' ? endDate : startDate)}
                onDayPress={onDayPress}
                markedDates={{
                  [toDateString(pickerTarget === 'end' ? endDate : startDate)]: { selected: true },
                }}
                theme={calendarTheme}
              />
            </View>
          )}
          {showPicker && pickerMode === 'date' && (
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          )}

          {showPicker && pickerMode === 'time' && (
            <DateTimePicker
              value={pickerTarget === 'end' ? endDate : startDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime}
              minuteInterval={15}
              themeVariant="light"
              textColor={colors.textPrimary}
            />
          )}
          {Platform.OS === 'ios' && showPicker && pickerMode === 'time' && (
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          )}

          {!showPicker && (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={submitting}>
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add to My Calendar'}
                </Text>
              </TouchableOpacity>
              {isEditing && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={submitting}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={submitting}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,43,43,0.4)' },
  card: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  header: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subheader: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 16, lineHeight: 18 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 6, color: colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', gap: 10 },
  pillButton: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
  pillButtonText: { color: colors.textPrimary, fontSize: 15 },
  allDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' },
  allDayText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  calendarWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', marginTop: 16 },
  doneText: { color: colors.primary, textAlign: 'right', marginTop: 8, fontSize: 15, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700' },
  deleteButton: { paddingVertical: 14, alignItems: 'center' },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  cancelButton: { paddingVertical: 6, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
