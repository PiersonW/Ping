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
import { findOrCreateContact, healContactLink } from '../lib/phone';
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

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (status: 'sent' | 'draft') => void;
  // Date the user had selected on the home calendar (YYYY-MM-DD), if any —
  // pre-fills the date field so tapping + after picking a day doesn't
  // default back to today.
  initialDate?: string | null;
};

export default function CreateEventModal({ visible, onClose, onCreated, initialDate }: Props) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [submitting, setSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [favoriteContactIds, setFavoriteContactIds] = useState<string[]>([]);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [excludedGroupMemberIds, setExcludedGroupMemberIds] = useState<string[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [importVisible, setImportVisible] = useState(false);

  const [items, setItems] = useState<{ name: string; qty: string; allowCustom: boolean }[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemAllowCustom, setNewItemAllowCustom] = useState(false);

  const dragY = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      resetForm();
    }
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
    if (visible && session?.user?.id) {
      loadContactsAndGroups();
    }
  }, [visible, session?.user?.id]);

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
      // Fill out to 6 with whoever else exists (contactIds is already
      // alpha-sorted) so the Favorites/See-all split is visible right away
      // even before any ping history has built up, instead of silently
      // falling back to "show everyone" with no visible feature at all.
      setFavoriteContactIds(Array.from(new Set([...ranked, ...contactIds])).slice(0, 6));
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

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    setItems((prev) => [
      ...prev,
      { name: newItemName.trim(), qty: newItemQty.trim() || '1', allowCustom: newItemAllowCustom },
    ]);
    setNewItemName('');
    setNewItemQty('1');
    setNewItemAllowCustom(false);
    Keyboard.dismiss();
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const buildInitialEventDate = () => {
    if (!initialDate) return new Date();
    const [y, m, d] = initialDate.split('-').map(Number);
    const next = new Date();
    next.setFullYear(y, m - 1, d);
    return next;
  };

  const resetForm = () => {
    setTitle('');
    setLocation('');
    setEventDate(buildInitialEventDate());
    setSelectedContactIds([]);
    setSelectedGroupIds([]);
    setExcludedGroupMemberIds([]);
    setIsPublic(false);
    setImageUri(null);
    setItems([]);
    setShowAllContacts(false);
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const onChangeDate = (event: any, selectedDate?: Date) => {
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

  const submit = async (status: 'sent' | 'draft') => {
    if (!title) {
      Alert.alert('Missing info', 'Please add at least a title.');
      return;
    }
    if (!session?.user?.id) return;

    setSubmitting(true);

    let imageUrl: string | null = null;
    if (imageUri) {
      setUploadingImage(true);
      try {
        imageUrl = await uploadEventImage(imageUri, session.user.id);
      } catch (err) {
        console.error('Error uploading image:', err);
        setUploadingImage(false);
        setSubmitting(false);
        Alert.alert('Image upload failed', 'Could not upload the photo. Try again, or continue without one.');
        return;
      }
      setUploadingImage(false);
    }

    const { data: eventRow, error } = await supabase
      .from('events')
      .insert([
        {
          title,
          location,
          event_date: eventDate.toISOString(),
          status,
          host_id: session.user.id,
          is_public: isPublic,
          image_url: imageUrl,
        },
      ])
      .select()
      .single();

    if (error || !eventRow) {
      setSubmitting(false);
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Something went wrong creating the event.');
      return;
    }

    // Host always gets their own accepted invitee row, regardless of
    // draft/sent — homepage visibility depends entirely on having one.
    const { error: hostInviteError } = await supabase.from('invitees').insert([
      {
        event_id: eventRow.id,
        user_id: session.user.id,
        rsvp_status: 'accepted',
        invited_via: 'app',
        responded_at: new Date().toISOString(),
      },
    ]);
    if (hostInviteError) console.error('Error creating host invitee row:', hostInviteError);

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('items').insert(
        items.map((it) => ({
          event_id: eventRow.id,
          name: it.name,
          quantity_needed: parseInt(it.qty, 10) || 1,
          allow_custom: it.allowCustom,
        }))
      );
      if (itemsError) console.error('Error creating items:', itemsError);
    }

    if (status === 'sent') {
      const contactIds = resolveInviteeContactIds();
      if (contactIds.length > 0) {
        // Re-check each contact's account link right before inviting —
        // the locally-loaded list can be stale if they signed up after
        // being added, and a stuck null link means the invite (and its
        // notification) never reaches anyone.
        const healedContacts = await Promise.all(
          contactIds.map(async (cid) => {
            const contact = contacts.find((c) => c.id === cid);
            return contact ? healContactLink(supabase, contact) : contact;
          })
        );
        const rows = contactIds.map((cid, i) => {
          const contact = healedContacts[i];
          return {
            event_id: eventRow.id,
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
            eventId: eventRow.id,
            type: 'invite',
          });
          sendSmsInvites(insertedInvitees || [], healedContacts, title, eventDate, location);
        }
      }
    }

    setSubmitting(false);
    resetForm();
    onCreated(status);
  };

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
            <Text style={styles.header}>Create a Ping</Text>

            <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
              <LinearGradient colors={cardFrameGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.imageFrame}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
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

            <Text style={styles.label}>Invite</Text>

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

            {contacts.length === 0 && groups.length === 0 && !addingContact && (
              <Text style={styles.helperText}>No contacts yet — tap "+ New" or import from your phone.</Text>
            )}

            <Text style={styles.label}>What to bring</Text>
            <Text style={styles.helperText}>Guests can claim these once they get the invite.</Text>

            {items.map((it, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemRowText}>
                  {it.name}
                  {it.allowCustom ? ' — guests describe' : parseInt(it.qty, 10) > 1 ? ` (x${it.qty})` : ''}
                </Text>
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <Text style={styles.itemRemoveText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.customToggleRow}
              onPress={() => setNewItemAllowCustom((v) => !v)}
            >
              <View style={[styles.checkbox, newItemAllowCustom && styles.checkboxChecked]}>
                {newItemAllowCustom && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.customToggleText}>
                {'Let each person write in what they’re bringing (e.g. "Side dish")'}
              </Text>
            </TouchableOpacity>

            <View style={styles.addContactRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Item (e.g. Chips)"
                placeholderTextColor={colors.textMuted}
                value={newItemName}
                onChangeText={setNewItemName}
              />
              <TextInput
                style={[styles.input, { flex: 1, textAlign: 'center' }]}
                placeholder="Qty"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={newItemQty}
                onChangeText={setNewItemQty}
              />
              <TouchableOpacity style={styles.addContactButton} onPress={handleAddItem}>
                <Text style={styles.addContactButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {!showPicker && !keyboardVisible && (
            <View style={styles.footer}>
              <TouchableOpacity style={[styles.footerButton, styles.saveButton]} onPress={() => submit('draft')} disabled={submitting}>
                <Text style={styles.saveButtonText}>Save for later</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.footerButton, styles.sendButton]} onPress={() => submit('sent')} disabled={submitting}>
                <Text style={styles.sendButtonText}>
                  {uploadingImage ? 'Uploading photo...' : submitting ? 'Sending...' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* The Save/Send footer above is hidden while the keyboard covers
              it (there's no room for both) - this floats right above the
              keyboard as the one way back to it, since nothing else on this
              densely-packed form reliably dismisses the keyboard on tap. */}
          {keyboardVisible && (
            <TouchableOpacity
              style={styles.keyboardDoneBar}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.keyboardDoneText}>Done</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.closeArea}
            onPress={onClose}
            disabled={showPicker || keyboardVisible}
          >
            {!showPicker && !keyboardVisible && <Text style={styles.closeText}>Cancel</Text>}
          </TouchableOpacity>
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
  helperText: { color: colors.textMuted, fontSize: 13, marginTop: 8, fontStyle: 'italic' },
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
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemRowText: { color: colors.textPrimary, fontSize: 15 },
  itemRemoveText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  customToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  customToggleText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
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
});
