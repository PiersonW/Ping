import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  PanResponder,
  Alert,
  Image,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'react-native-calendars';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../supabase';
import { useAuth } from '../lib/AuthContext';
import { findOrCreateContact, healContactLink, getAlreadyInvitedPhones, normalizePhone } from '../lib/phone';
import { sendSmsInvites } from '../lib/sms';
import { uploadEventImage } from '../lib/imageUpload';
import { pickEventImage } from '../lib/imagePicker';
import { colors, cardFrameGradient, calendarTheme } from '../lib/theme';
import { notify } from '../lib/notify';
import ImportContactsModal from './ImportContactsModal';

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  linked_user_id: string | null;
};

type GroupMember = { contactId: string; name: string };
type Group = { id: string; name: string; members: GroupMember[] };

export type EditableEvent = {
  id: string;
  title: string;
  location: string;
  event_date: string;
  image_url: string | null;
  is_public: boolean;
  status: 'sent' | 'draft';
};

type Props = {
  visible: boolean;
  event: EditableEvent | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

// Edits an existing event. If it's still a draft, this also doubles as
// the "finish creating it" flow. The invite picker is always available so
// the host can add more people later too - handleSave only sends invites
// to newly selected people, deduped against who's already invited.
export default function EditEventModal({ visible, event, onClose, onSaved, onDeleted }: Props) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [submitting, setSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const isDraft = event?.status === 'draft';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [favoriteContactIds, setFavoriteContactIds] = useState<string[]>([]);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [excludedGroupMemberIds, setExcludedGroupMemberIds] = useState<string[]>([]);
  const [existingInviteeContactIds, setExistingInviteeContactIds] = useState<Set<string>>(new Set());
  const [existingInviteePhones, setExistingInviteePhones] = useState<Set<string>>(new Set());
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [importVisible, setImportVisible] = useState(false);

  const dragY = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.8) {
          Animated.timing(dragY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible && event) {
      setTitle(event.title);
      setLocation(event.location || '');
      setEventDate(new Date(event.event_date));
      setIsPublic(event.is_public);
      setImageUri(null);
      setExistingImageUrl(event.image_url);
      setSelectedContactIds([]);
      setSelectedGroupIds([]);
      setExcludedGroupMemberIds([]);
      setShowAllContacts(false);

      if (session?.user?.id) {
        loadContactsAndGroups();
      }
    }
  }, [visible, event?.id]);

  const loadContactsAndGroups = async () => {
    const { data: contactsData, error: contactsError } = await supabase
      .from('contacts')
      .select('id, name, phone, email, linked_user_id')
      .eq('owner_id', session!.user.id)
      .order('name');

    if (contactsError) console.error('Error loading contacts:', contactsError);
    setContacts(contactsData || []);

    // "Favorites" = people you've actually invited to something before,
    // most-pinged first. No GROUP BY without an RPC this repo doesn't have,
    // so just tally it client-side - a family's contact list is small.
    const contactIds = (contactsData || []).map((c) => c.id);
    if (contactIds.length > 0) {
      const { data: inviteRows, error: inviteRowsError } = await supabase
        .from('invitees')
        .select('contact_id')
        .in('contact_id', contactIds);
      if (inviteRowsError) console.error('Error loading ping counts:', inviteRowsError);
      const counts = new Map<string, number>();
      (inviteRows || []).forEach((r: any) => {
        if (!r.contact_id) return;
        counts.set(r.contact_id, (counts.get(r.contact_id) || 0) + 1);
      });
      const ranked = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      setFavoriteContactIds(ranked.slice(0, 6));
    } else {
      setFavoriteContactIds([]);
    }

    const { data: groupsData, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, group_members(contact_id, contacts(name))')
      .eq('owner_id', session!.user.id)
      .order('name');

    if (groupsError) console.error('Error loading groups:', groupsError);
    setGroups(
      (groupsData || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        members: (g.group_members || []).map((m: any) => ({
          contactId: m.contact_id,
          name: m.contacts?.name || 'Unknown',
        })),
      }))
    );

    if (event) {
      const { data: existingInvitees } = await supabase
        .from('invitees')
        .select('contact_id')
        .eq('event_id', event.id);
      setExistingInviteeContactIds(
        new Set((existingInvitees || []).map((i) => i.contact_id).filter(Boolean))
      );
      setExistingInviteePhones(await getAlreadyInvitedPhones(supabase, event.id));
    }
  };

  // Approximation used only for the Save button's label - handleSave
  // re-checks against fresh data at save time before actually inviting.
  const getNewInviteeIds = (): string[] => {
    const contactIds = resolveInviteeContactIds();
    const seenPhones = new Set(existingInviteePhones);
    const result: string[] = [];
    for (const cid of contactIds) {
      if (existingInviteeContactIds.has(cid)) continue;
      const phone = normalizePhone(contacts.find((c) => c.id === cid)?.phone);
      if (phone && seenPhones.has(phone)) continue;
      result.push(cid);
      if (phone) seenPhones.add(phone);
    }
    return result;
  };

  const pickImage = async () => {
    const uri = await pickEventImage();
    if (uri) setImageUri(uri);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const toggleGroupMember = (contactId: string) => {
    setExcludedGroupMemberIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !session?.user?.id) return;

    try {
      const { contact, wasExisting } = await findOrCreateContact(
        supabase,
        session.user.id,
        newContactName.trim(),
        newContactPhone
      );

      setContacts((prev) => {
        if (wasExisting && prev.some((c) => c.id === contact.id)) return prev;
        return [...prev, contact].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedContactIds((prev) => (prev.includes(contact.id) ? prev : [...prev, contact.id]));

      if (wasExisting) {
        Alert.alert('Already in your contacts', `Matched to existing contact "${contact.name}" by phone number.`);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not add contact.');
      return;
    }

    setNewContactName('');
    setNewContactPhone('');
    setAddingContact(false);
    Keyboard.dismiss();
  };

  const handleImported = (imported: Contact[]) => {
    setImportVisible(false);
    setContacts((prev) => {
      const merged = [...prev];
      imported.forEach((c) => {
        if (!merged.some((m) => m.id === c.id)) merged.push(c);
      });
      return merged.sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelectedContactIds((prev) => Array.from(new Set([...prev, ...imported.map((c) => c.id)])));
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const onChangeDate = (e: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate) setEventDate(selectedDate);
  };

  const toDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const onDayPress = (day: { year: number; month: number; day: number }) => {
    const next = new Date(eventDate);
    next.setFullYear(day.year, day.month - 1, day.day);
    setEventDate(next);
    setShowPicker(false);
  };

  const resolveInviteeContactIds = (): string[] => {
    const fromGroups = selectedGroupIds.flatMap((gid) =>
      (groups.find((g) => g.id === gid)?.members || [])
        .map((m) => m.contactId)
        .filter((cid) => !excludedGroupMemberIds.includes(cid))
    );
    const allIds = Array.from(new Set([...selectedContactIds, ...fromGroups]));
    const seenPhones = new Set<string>();
    const deduped: string[] = [];
    for (const cid of allIds) {
      const phone = contacts.find((c) => c.id === cid)?.phone;
      if (phone) {
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);
      }
      deduped.push(cid);
    }
    return deduped;
  };

  // Guests who already have this event (invited, and especially ones who've
  // already told the host they're coming) never heard about it if the host
  // changed the date/location/title afterward — this asks the host whether
  // to let them know before saving, rather than always doing one or the
  // other silently.
  const confirmAndSave = (sendNow: boolean) => {
    if (!event) return;
    const changedDetails =
      !isDraft &&
      (title !== event.title ||
        location !== (event.location || '') ||
        eventDate.toISOString() !== event.event_date);

    if (!changedDetails) {
      handleSave(sendNow, false);
      return;
    }

    Alert.alert(
      'Notify guests?',
      "You've changed this event's details. Let the people you've invited know?",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save silently', onPress: () => handleSave(sendNow, false) },
        { text: 'Save & notify', onPress: () => handleSave(sendNow, true) },
      ]
    );
  };

  const handleSave = async (sendNow: boolean, notifyExisting: boolean) => {
    if (!event || !session?.user?.id) return;
    if (!title) {
      Alert.alert('Missing info', 'Please add at least a title.');
      return;
    }

    setSubmitting(true);

    let imageUrl = existingImageUrl;
    if (imageUri) {
      setUploadingImage(true);
      try {
        imageUrl = await uploadEventImage(imageUri, session.user.id);
      } catch (err) {
        console.error('Error uploading image:', err);
        setUploadingImage(false);
        setSubmitting(false);
        Alert.alert('Image upload failed', 'Could not upload the photo. Try again, or continue without changing it.');
        return;
      }
      setUploadingImage(false);
    }

    const updates: Record<string, any> = {
      title,
      location,
      event_date: eventDate.toISOString(),
      is_public: isPublic,
      image_url: imageUrl,
    };
    if (sendNow) updates.status = 'sent';

    const { error } = await supabase.from('events').update(updates).eq('id', event.id);

    if (error) {
      setSubmitting(false);
      console.error('Error updating event:', error);
      Alert.alert('Error', 'Something went wrong saving your changes.');
      return;
    }

    if (notifyExisting) {
      const { data: allInvitees } = await supabase
        .from('invitees')
        .select('user_id')
        .eq('event_id', event.id);
      const recipientIds = (allInvitees || [])
        .map((i) => i.user_id)
        .filter((id): id is string => !!id && id !== session.user.id);
      if (recipientIds.length > 0) {
        notify(recipientIds, `${title} was updated`, "The host changed this event's details — take a look.", {
          eventId: event.id,
          type: 'event_updated',
        });
      }
    }

    // Newly selected people get invited whether this is the draft's first
    // send or just adding more people to an event that already went out.
    const contactIds = resolveInviteeContactIds();
    if (contactIds.length > 0) {
      const { data: existingInvitees } = await supabase
        .from('invitees')
        .select('contact_id')
        .eq('event_id', event.id);
      const alreadyInvitedContactIds = new Set(
        (existingInvitees || []).map((i) => i.contact_id).filter(Boolean)
      );
      const alreadyInvitedPhones = await getAlreadyInvitedPhones(supabase, event.id);

      const toInvite: string[] = [];
      for (const cid of contactIds) {
        if (alreadyInvitedContactIds.has(cid)) continue;
        const contact = contacts.find((c) => c.id === cid);
        const phone = normalizePhone(contact?.phone);
        if (phone && alreadyInvitedPhones.has(phone)) continue;
        toInvite.push(cid);
        if (phone) alreadyInvitedPhones.add(phone);
      }

      if (toInvite.length > 0) {
        // Re-check each contact's account link right before inviting — see
        // the matching comment in CreateEventModal.
        const healedContacts = await Promise.all(
          toInvite.map(async (cid) => {
            const contact = contacts.find((c) => c.id === cid);
            return contact ? healContactLink(supabase, contact) : contact;
          })
        );
        const rows = toInvite.map((cid, i) => {
          const contact = healedContacts[i];
          return {
            event_id: event.id,
            contact_id: cid,
            user_id: contact?.linked_user_id || null,
            rsvp_status: 'pending',
            invited_via: contact?.linked_user_id ? 'app' : contact?.phone ? 'sms' : 'email',
          };
        });
        const { data: insertedInvitees, error: inviteeError } = await supabase
          .from('invitees')
          .insert(rows)
          .select();
        if (inviteeError) {
          console.error('Error creating invitees:', inviteeError);
        } else {
          const notifiableUserIds = rows.map((r) => r.user_id).filter(Boolean);
          notify(notifiableUserIds, "You're invited! 🎉", `${title} — tap to view and RSVP`, {
            eventId: event.id,
            type: 'invite',
          });
          sendSmsInvites(insertedInvitees || [], healedContacts, title, eventDate, location);
        }
      }
    }

    setSubmitting(false);
    onSaved();
  };

  const handleDeleteEvent = async (shouldNotify: boolean) => {
    if (!event) return;
    setSubmitting(true);

    // Everything below used to run as one unguarded chain of awaits — if
    // any single step threw (a network blip, an RLS rejection), the catch
    // block below didn't exist yet, so setSubmitting(false) never ran and
    // the modal was stuck showing its "deleting" state forever, which reads
    // as the whole app freezing on delete.
    try {
      if (shouldNotify) {
        const { data: allInvitees } = await supabase
          .from('invitees')
          .select('user_id')
          .eq('event_id', event.id);
        const recipientIds = (allInvitees || [])
          .map((i) => i.user_id)
          .filter((id): id is string => !!id && id !== session?.user?.id);
        if (recipientIds.length > 0) {
          notify(recipientIds, 'Event canceled', `"${title}" has been canceled.`, {
            eventId: event.id,
            type: 'event_canceled',
          });
        }
      }

      // Cascade delete configuration on the DB side is unknown, so clean up
      // dependents manually rather than risk a foreign-key failure.
      const { data: eventItems } = await supabase.from('items').select('id').eq('event_id', event.id);
      const itemIds = (eventItems || []).map((i) => i.id);
      if (itemIds.length > 0) {
        await supabase.from('item_claims').delete().in('item_id', itemIds);
      }
      await supabase.from('items').delete().eq('event_id', event.id);
      await supabase.from('messages').delete().eq('event_id', event.id);
      await supabase.from('invitees').delete().eq('event_id', event.id);

      const { error } = await supabase.from('events').delete().eq('id', event.id);

      if (error) {
        console.error('Error deleting event:', error);
        Alert.alert('Error', 'Could not delete this event.');
        return;
      }

      onDeleted();
    } catch (err) {
      console.error('Error deleting event:', err);
      Alert.alert('Error', 'Could not delete this event.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this event?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete silently', style: 'destructive', onPress: () => handleDeleteEvent(false) },
      { text: 'Notify & delete', style: 'destructive', onPress: () => handleDeleteEvent(true) },
    ]);
  };

  if (!event) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ translateY: dragY }] }]}>
          <View
            style={styles.dragHandleArea}
            hitSlop={{ top: 10, bottom: 16, left: 30, right: 30 }}
            {...panResponder.panHandlers}
          >
            <View style={styles.handle} />
          </View>
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.header}>{isDraft ? 'Finish Draft' : 'Edit Event'}</Text>

            <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
              <LinearGradient colors={cardFrameGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.imageFrame}>
                {imageUri || existingImageUrl ? (
                  <>
                    <Image source={{ uri: imageUri || existingImageUrl! }} style={styles.image} resizeMode="cover" />
                    <View style={styles.editPhotoBadge}>
                      <Text style={styles.editPhotoBadgeIcon}>✏️</Text>
                    </View>
                  </>
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={styles.imagePlaceholderIcon}>📷</Text>
                    <Text style={styles.imagePlaceholderText}>Add Photo</Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.label}>Event Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Game Night"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Date & Time</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.pillButton} onPress={() => { setPickerMode('date'); setShowPicker(true); }}>
                <Text style={styles.pillButtonText}>{formatDate(eventDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pillButton} onPress={() => { setPickerMode('time'); setShowPicker(true); }}>
                <Text style={styles.pillButtonText}>{formatTime(eventDate)}</Text>
              </TouchableOpacity>
            </View>

            {showPicker && pickerMode === 'date' && (
              <View style={styles.calendarWrap}>
                <Calendar
                  current={toDateString(eventDate)}
                  onDayPress={onDayPress}
                  markedDates={{
                    [toDateString(eventDate)]: { selected: true },
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
                value={eventDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onChangeDate}
                themeVariant="light"
                textColor={colors.textPrimary}
              />
            )}
            {Platform.OS === 'ios' && showPicker && pickerMode === 'time' && (
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Mom and Dad's house"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
            />

            <TouchableOpacity style={styles.publicRow} onPress={() => setIsPublic(!isPublic)}>
              <View style={[styles.checkbox, isPublic && styles.checkboxChecked]}>
                {isPublic && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.publicRowTitle}>Make this event public</Text>
                <Text style={styles.publicRowSubtitle}>
                  {isPublic ? 'Invitees can share this Ping with others' : 'Only you can select who gets invited'}
                </Text>
              </View>
            </TouchableOpacity>

            <>
                <Text style={styles.label}>{isDraft ? 'Invite' : 'Invite more people'}</Text>

                <TouchableOpacity style={styles.importRow} onPress={() => setImportVisible(true)}>
                  <Text style={styles.importText}>📇 Import from Contacts</Text>
                </TouchableOpacity>

                {groups.length > 0 && (
                  <>
                    <Text style={styles.sublabel}>Groups</Text>
                    <View style={styles.chipRow}>
                      {groups.map((g) => (
                        <TouchableOpacity
                          key={g.id}
                          style={[styles.chip, selectedGroupIds.includes(g.id) && styles.chipSelected]}
                          onPress={() => toggleGroup(g.id)}
                        >
                          <Text style={[styles.chipText, selectedGroupIds.includes(g.id) && styles.chipTextSelected]}>
                            {g.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {selectedGroupIds.map((gid) => {
                      const group = groups.find((g) => g.id === gid);
                      if (!group || group.members.length === 0) return null;
                      return (
                        <View key={gid} style={styles.groupMembersBlock}>
                          <Text style={styles.groupMembersLabel}>{group.name} — tap to exclude</Text>
                          <View style={styles.chipRow}>
                            {group.members.map((member) => {
                              const included = !excludedGroupMemberIds.includes(member.contactId);
                              return (
                                <TouchableOpacity
                                  key={member.contactId}
                                  style={[styles.memberChip, included ? styles.memberChipIncluded : styles.memberChipExcluded]}
                                  onPress={() => toggleGroupMember(member.contactId)}
                                >
                                  <Text
                                    style={[
                                      styles.memberChipText,
                                      included && styles.memberChipTextIncluded,
                                    ]}
                                  >
                                    {member.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}

                <Text style={styles.sublabel}>
                  {showAllContacts || favoriteContactIds.length === 0 ? 'People' : 'Favorites'}
                </Text>
                <View style={styles.chipRow}>
                  {(showAllContacts || favoriteContactIds.length === 0
                    ? contacts
                    : (favoriteContactIds
                        .map((id) => contacts.find((c) => c.id === id))
                        .filter(Boolean) as Contact[])
                  ).map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, selectedContactIds.includes(c.id) && styles.chipSelected]}
                      onPress={() => toggleContact(c.id)}
                    >
                      <Text style={[styles.chipText, selectedContactIds.includes(c.id) && styles.chipTextSelected]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.addChip} onPress={() => setAddingContact(true)}>
                    <Text style={styles.addChipText}>+ New</Text>
                  </TouchableOpacity>
                </View>
                {!showAllContacts && favoriteContactIds.length > 0 && contacts.length > favoriteContactIds.length && (
                  <TouchableOpacity onPress={() => setShowAllContacts(true)}>
                    <Text style={styles.seeAllText}>See all ({contacts.length})</Text>
                  </TouchableOpacity>
                )}

                {addingContact && (
                  <View style={styles.addContactRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Name"
                      placeholderTextColor={colors.textMuted}
                      value={newContactName}
                      onChangeText={setNewContactName}
                      autoFocus
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Phone (optional)"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      value={newContactPhone}
                      onChangeText={setNewContactPhone}
                    />
                    <TouchableOpacity style={styles.addContactButton} onPress={handleAddContact}>
                      <Text style={styles.addContactButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
          </ScrollView>

          {!showPicker && !keyboardVisible && (
            <View style={styles.footer}>
              {isDraft ? (
                <>
                  <TouchableOpacity style={[styles.footerButton, styles.saveButton]} onPress={() => confirmAndSave(false)} disabled={submitting}>
                    <Text style={styles.saveButtonText}>Save Draft</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.footerButton, styles.sendButton]} onPress={() => confirmAndSave(true)} disabled={submitting}>
                    <Text style={styles.sendButtonText}>
                      {uploadingImage ? 'Uploading...' : submitting ? 'Sending...' : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[styles.footerButton, styles.sendButton, { flex: 1 }]} onPress={() => confirmAndSave(false)} disabled={submitting}>
                  <Text style={styles.sendButtonText}>
                    {uploadingImage
                      ? 'Uploading...'
                      : submitting
                      ? 'Saving...'
                      : getNewInviteeIds().length > 0
                      ? 'Save & Send Invites'
                      : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Same reasoning as CreateEventModal.tsx: the footer above is
              hidden while the keyboard covers it, so this is the one
              reliable way back to it on this densely-packed form. */}
          {keyboardVisible && (
            <TouchableOpacity
              style={styles.keyboardDoneBar}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.keyboardDoneText}>Done</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.closeArea} onPress={onClose} disabled={showPicker || keyboardVisible}>
            {!showPicker && !keyboardVisible && <Text style={styles.closeText}>Cancel</Text>}
          </TouchableOpacity>

          {!showPicker && !keyboardVisible && (
            <TouchableOpacity
              style={styles.deleteArea}
              onPress={confirmDelete}
              disabled={submitting}
            >
              <Text style={styles.deleteText}>Delete Event</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
      </KeyboardAvoidingView>

      <ImportContactsModal visible={importVisible} onClose={() => setImportVisible(false)} onImported={handleImported} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,43,43,0.4)' },
  card: { height: '92%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  dragHandleArea: { paddingVertical: 12, marginBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  header: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  imageFrame: { borderRadius: 18, padding: 3, marginBottom: 16 },
  image: { width: '100%', height: 160, borderRadius: 15 },
  imagePlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderIcon: { fontSize: 32, marginBottom: 6 },
  imagePlaceholderText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  editPhotoBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(43,43,43,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhotoBadgeIcon: { fontSize: 15 },
  label: { fontWeight: '600', marginTop: 14, marginBottom: 6, color: colors.textPrimary },
  sublabel: { color: colors.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 6 },
  seeAllText: { color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: 8 },
  importRow: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 10 },
  importText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  publicRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, paddingVertical: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
  publicRowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  publicRowSubtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 10 },
  pillButton: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
  pillButtonText: { color: colors.textPrimary, fontSize: 15 },
  doneText: { color: colors.primary, textAlign: 'right', marginTop: 4, fontSize: 15, fontWeight: '600' },
  calendarWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 14 },
  chipTextSelected: { color: colors.textOnPrimary, fontWeight: '600' },
  addChip: { borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addChipText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  groupMembersBlock: { marginTop: 6, marginBottom: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.border },
  groupMembersLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  memberChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  memberChipIncluded: { backgroundColor: colors.surface },
  memberChipExcluded: { backgroundColor: colors.divider, borderColor: colors.divider },
  memberChipText: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'line-through' },
  memberChipTextIncluded: { color: colors.textSecondary, fontWeight: '600', textDecorationLine: 'none' },
  addContactRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  addContactButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  addContactButtonText: { color: colors.textOnPrimary, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 12 },
  footerButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  keyboardDoneBar: {
    // KeyboardAvoidingView (wrapping the whole modal, see below) already
    // shifts this card up by the keyboard's height - bottom:0 here lands
    // right above the keyboard for free. An earlier version also offset
    // this by keyboardHeight on top of that, double-compensating and
    // landing the bar in the middle of the screen instead.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  keyboardDoneText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  saveButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  saveButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  sendButton: { backgroundColor: colors.primary },
  sendButtonText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
  closeArea: { alignItems: 'center', marginTop: 10 },
  closeText: { color: colors.textMuted, fontSize: 14 },
  deleteArea: { alignItems: 'center', marginTop: 8 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
