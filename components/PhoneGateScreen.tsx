import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../supabase';
import { useAuth } from '../lib/AuthContext';
import { normalizePhone } from '../lib/phone';
import { colors } from '../lib/theme';

type Props = { onDone: () => void };

export default function PhoneGateScreen({ onDone }: Props) {
  const { session, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  // Google/Apple sign-in doesn't reliably leave a name on the profile (or a
  // name at all, in Apple's case) - this screen is the one place every
  // account is guaranteed to pass through, so it also doubles as the
  // backstop for that. Pre-fill from whatever's already known so most
  // people just confirm it rather than typing from scratch.
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        const known =
          data?.full_name ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          '';
        if (known) setFullName(known);
      });
  }, [session?.user?.id]);

  const handleContinue = async () => {
    const name = fullName.trim();
    if (!name) {
      Alert.alert('Name needed', 'Enter your name to continue.');
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 10) {
      Alert.alert('Phone number needed', 'Enter a valid phone number to continue.');
      return;
    }
    if (!session?.user?.id) return;
    setSaving(true);

    // A different account already using this phone almost always means the
    // same person signed in with a different method (Google vs Apple vs
    // email) than they used originally — proceeding would leave them with
    // two disconnected accounts instead of the one with their real data.
    const { data: collision } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', normalized)
      .neq('id', session.user.id)
      .maybeSingle();

    if (collision) {
      setSaving(false);
      Alert.alert(
        'Account already exists',
        'This phone number is already linked to another account. Log out and sign in the same way you did originally (Google, Apple, or email) instead of creating a new one.',
        [{ text: 'Log out', onPress: signOut }]
      );
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ phone: normalized, full_name: name })
      .eq('id', session.user.id);

    setSaving(false);

    if (error) {
      console.error('Error saving phone:', error);
      Alert.alert('Error', 'Could not save your phone number. Try again.');
      return;
    }

    onDone();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Just a couple things</Text>
        <Text style={styles.explainer}>
          Ping matches invites to your account by phone number, and shows your name to people you're
          pinging. Without these, people who invite you may never actually reach you — even if you
          already have an account.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          value={fullName}
          onChangeText={setFullName}
          autoFocus
        />

        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} style={styles.signOutArea}>
          <Text style={styles.signOutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  explainer: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
  signOutArea: { alignItems: 'center', marginTop: 20 },
  signOutText: { color: colors.textMuted, fontSize: 14 },
});
