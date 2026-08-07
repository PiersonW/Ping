import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  FlatList,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { supabase } from '../supabase';
import { useAuth } from '../lib/AuthContext';
import { findOrCreateContact } from '../lib/phone';
import { colors } from '../lib/theme';

type DeviceContact = { key: string; name: string; phone: string | null };
type AppContact = { id: string; name: string; phone: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  onImported: (contacts: AppContact[]) => void;
};

export default function ImportContactsModal({ visible, onClose, onImported }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedKeys([]);
      setSearch('');
      loadDeviceContacts();
    }
  }, [visible]);

  const loadDeviceContacts = async () => {
    setLoading(true);
    setPermissionDenied(false);

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      setLoading(false);
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });

    const mapped: DeviceContact[] = data
      .filter((c) => c.name)
      .map((c) => ({
        key: c.id || `${c.name}-${Math.random()}`,
        name: c.name!,
        phone: c.phoneNumbers?.[0]?.number || null,
      }));

    setDeviceContacts(mapped);
    setLoading(false);
  };

  const toggle = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const filtered = deviceContacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleImport = async () => {
    if (!session?.user?.id || selectedKeys.length === 0) return;
    setImporting(true);

    const toImport = deviceContacts.filter((c) => selectedKeys.includes(c.key));
    const results: AppContact[] = [];

    for (const dc of toImport) {
      try {
        const { contact } = await findOrCreateContact(supabase, session.user.id, dc.name, dc.phone);
        results.push(contact);
      } catch (err) {
        console.error('Error importing contact:', dc.name, err);
      }
    }

    setImporting(false);
    onImported(results);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.header}>Import from Contacts</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : permissionDenied ? (
            <View style={{ paddingVertical: 40 }}>
              <Text style={styles.helperText}>
                Contacts access was denied. You can enable it in your phone's Settings for this app,
                or add people manually instead.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              <FlatList
                data={filtered}
                keyExtractor={(c) => c.key}
                contentContainerStyle={{ paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = selectedKeys.includes(item.key);
                  return (
                    <TouchableOpacity style={styles.contactRow} onPress={() => toggle(item.key)}>
                      <View>
                        <Text style={styles.contactName}>{item.name}</Text>
                        {!!item.phone && <Text style={styles.contactPhone}>{item.phone}</Text>}
                      </View>
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.helperText}>No contacts found.</Text>}
              />
            </>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.footerButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.importButton]}
              onPress={handleImport}
              disabled={importing || selectedKeys.length === 0}
            >
              <Text style={styles.importButtonText}>
                {importing ? 'Importing...' : `Import${selectedKeys.length ? ` (${selectedKeys.length})` : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,43,43,0.4)' },
  card: { height: '80%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  header: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  helperText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  contactName: { color: colors.textPrimary, fontSize: 16 },
  contactPhone: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
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
  footer: { flexDirection: 'row', gap: 12, marginTop: 12 },
  footerButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cancelButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  importButton: { backgroundColor: colors.primary },
  importButtonText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
});
