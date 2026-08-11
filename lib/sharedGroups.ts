import { normalizePhone } from './phone';

export type GroupMember = { contactId: string; name: string };
export type SelectableGroup = { id: string; name: string; members: GroupMember[] };

type SupabaseClient = any;

// Generic over T like healContactLink, so each screen's own (slightly
// different) local Contact shape can be passed straight in without needing
// every field lib/phone.ts's Contact type declares.
type MinimalContact = { id: string; name: string; phone: string | null; linked_user_id: string | null };

// Groups you belong to as a member (not the owner) show up here once their
// owner has turned on "Shared group". Each member is materialized into your
// own contacts, matched by linked account or phone so this is idempotent -
// the rest of the invite flow (favorites, dedup-by-phone, healContactLink)
// is entirely contact-based and has no second code path for people who
// aren't "yours", so giving each shared member a real contact row here is
// simpler and safer than teaching that whole pipeline about borrowed ids.
export async function loadMemberGroups<T extends MinimalContact>(
  supabase: SupabaseClient,
  userId: string,
  myContacts: T[]
): Promise<{ groups: SelectableGroup[]; newContacts: T[] }> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, group_members(user_id, contacts(name, phone))')
    .neq('owner_id', userId)
    .order('name');

  if (error) {
    console.error('Error loading shared groups:', error);
    return { groups: [], newContacts: [] };
  }

  // Grows as members are materialized so two members of the same group (or
  // two groups sharing a member) never each insert their own duplicate
  // contact within a single load.
  const known = [...myContacts];
  const created: T[] = [];
  const groups: SelectableGroup[] = [];

  for (const g of data || []) {
    const members: GroupMember[] = [];
    for (const gm of (g as any).group_members || []) {
      const name = gm.contacts?.name || 'Someone';
      const phone = normalizePhone(gm.contacts?.phone);
      const linkedUserId = gm.user_id || null;

      let contact = known.find(
        (c) =>
          (linkedUserId && c.linked_user_id === linkedUserId) ||
          (phone && normalizePhone(c.phone) === phone)
      );

      if (!contact) {
        const { data: inserted, error: insertError } = await supabase
          .from('contacts')
          .insert([{ owner_id: userId, name, phone, linked_user_id: linkedUserId }])
          .select()
          .single();
        if (insertError) {
          console.error('Error materializing shared group member as a contact:', insertError);
          continue;
        }
        contact = inserted as T;
        known.push(contact);
        created.push(contact);
      }

      members.push({ contactId: contact.id, name: contact.name });
    }
    groups.push({ id: (g as any).id, name: (g as any).name, members });
  }

  return { groups, newContacts: created };
}
