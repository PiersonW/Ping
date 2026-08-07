// Shared phone-matching utilities.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

type SupabaseClient = any;

export type Contact = {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  linked_user_id: string | null;
};

export async function findOrCreateContact(
  supabase: SupabaseClient,
  ownerId: string,
  name: string,
  rawPhone?: string | null
): Promise<{ contact: Contact; wasExisting: boolean }> {
  const phone = normalizePhone(rawPhone);

  if (phone) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return { contact: existing as Contact, wasExisting: true };
    }
  }

  let linkedUserId: string | null = null;
  if (phone) {
    const { data: profileMatch } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    linkedUserId = profileMatch?.id || null;
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert([{ owner_id: ownerId, name, phone, linked_user_id: linkedUserId }])
    .select()
    .single();

  if (error) throw error;
  return { contact: created as Contact, wasExisting: false };
}

export async function getAlreadyInvitedPhones(
  supabase: SupabaseClient,
  eventId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('invitees')
    .select('contacts(phone), profiles(phone)')
    .eq('event_id', eventId);

  const phones = new Set<string>();
  (data || []).forEach((row: any) => {
    const p = normalizePhone(row.contacts?.phone) || normalizePhone(row.profiles?.phone);
    if (p) phones.add(p);
  });
  return phones;
}
