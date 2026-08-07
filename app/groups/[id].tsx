import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { supabase } from '../../supabase';
import { useAuth } from '../../lib/AuthContext';
import { findOrCreateContact } from '../../lib/phone';
import { colors } from '../../lib/theme';
import ImportContactsModal from '../../components/ImportContactsModal';

type Contact = { id: string; name: string; phone: string | null; linked_user_id: string | null };

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [groupName, setGroupName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [importVisible, setImportVisible] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;

    const [{ data: groupData, error: groupError }, { data: contactsData, error: contactsError }] =
      await Promise.all([
        supabase.from('groups').select('id, name, is_shared, group_members(contact_id)').eq('id', id).single(),
        supabase
          .from('contacts')
          .select('id, name, phone, linked_user_id')
          .eq('owner_id', session.user.id)
          .order('name'),
      ]);

    if (groupError) console.error('Error fetching group:', groupError);
    if (contactsError) console.error('Error fetching contacts:', contactsError);

    setGroupName(groupData?.name || '');
    setIsShared(!!groupData?.is_shared);
    setMemberIds((groupData?.group_members || []).map((m: any) => m.contact_id));
    setAllContacts(contactsData || []);
  }, [id, session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [fetchData])
  );

  const isMember = (contactId: string) => memberIds.includes(contactId);

  const toggleMember = async (contact: Contact) => {
    if (isMember(contact.id)) {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('contact_id', contact.id);
      if (error) {
        console.error('Error removing member:', error);
        return;
      }
      setMemberIds((prev) => prev.filter((m) => m !== contact.id));
    } else {
      const { error } = await supabase
        .from('group_members')
        .insert([{ group_id: id, contact_id: contact.id, user_id: contact.linked_user_id || null }]);
      if (error) {
        console.error('Error adding member:', error);
        return;
      }
      setMemberIds((prev) => [...prev, contact.id]);
    }
  };

  const handleToggleShared = async (value: boolean) => {
    setIsShared(value);
    const { error } = await supabase.from('groups').update({ is_shared: value }).eq('id', id);
    if (error) {
      console.error('Error updating shared status:', error);
      setIsShared(!value);
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !session?.user?.id) return;

    let contact: Contact;
    try {
      const result = await findOrCreateContact(
        supabase,
        session.user.id,
        newContactName.trim(),
        newContactPhone
      );
      contact = result.contact;

      if (result.wasExisting) {
        Alert.alert('Already in your contacts', `Matched to existing contact "${contact.name}" by phone number.`);
        if (!allContacts.some((c) => c.id === contact.id)) {
          setAllContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } else {
        setAllContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) {
      Alert.alert('Error', 'Could not add contact.');
      console.error(err);
      return;
    }

    setNewContactName('');
    setNewContactPhone('');
    setAddingContact(false);
    await toggleMember(contact);
  };

  const handleImported = async (imported: Contact[]) => {
    setImportVisible(false);
    setAllContacts((prev) => {
      const merged = [...prev];
      imported.forEach((c) => {
        if (!merged.some((m) => m.id === c.id)) merged.push(c);
      });
      return merged.sort((a, b) => a.name.localeCompare(b.name));
    });
    for (const c of imported) {
      if (!isMember(c.id)) {
        await toggleMember(c);
      }
    }
  };

  const handleDeleteGroup = () => {
    Alert.alert('Delete group?', `This removes "${groupName}" permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('groups').delete().eq('id', id);
          if (error) {
            console.error('Error deleting group:', error);
            return;
          }
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteGroup}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.title}>{groupName}</Text>

      <View style={styles.sharedRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sharedTitle}>Shared group</Text>
          <Text style={styles.sharedSubtitle}>
            {isShared
              ? 'Marked as shared — visible to group members once cross-account group sharing is built'
              : 'Private — only visible to you'}
          </Text>
        </View>
        <Switch
          value={isShared}
          onValueChange={handleToggleShared}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>

      <Text style={styles.sectionLabel}>{memberIds.length} in this group</Text>

      <FlatList
        data={allContacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const member = isMember(item.id);
          return (
            <TouchableOpacity style={styles.contactRow} onPress={() => toggleMember(item)}>
              <Text style={styles.contactName}>{item.name}</Text>
              <View style={[styles.checkbox, member && styles.checkboxChecked]}>
                {member && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !addingContact ? (
            <Text style={styles.emptyText}>No contacts yet — add one below.</Text>
          ) : null
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.importRow} onPress={() => setImportVisible(true)}>
            <Text style={styles.importText}>📇 Import from Contacts</Text>
          </TouchableOpacity>
        }
        ListFooterComponent={
          addingContact ? (
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
          ) : (
            <TouchableOpacity style={styles.addNewRow} onPress={() => setAddingContact(true)}>
              <Text style={styles.addNewText}>+ New contact</Text>
            </TouchableOpacity>
          )
        }
      />

      <ImportContactsModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onImported={handleImported}
      />
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 60, paddingHorizontal: 20 },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  doneText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  deleteText: { color: colors.danger, fontSize: 15 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '700', marginTop: 16 },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    gap: 12,
  },
  sharedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  sharedSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  importRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  importText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  contactName: { color: colors.textPrimary, fontSize: 16 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  addNewRow: { paddingVertical: 16, alignItems: 'center' },
  addNewText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  addContactRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  addContactButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addContactButtonText: { color: colors.textOnPrimary, fontWeight: '600' },
});
