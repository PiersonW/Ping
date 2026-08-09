import { supabase } from '../supabase';

const JOIN_LINK_BASE = 'https://piersonw.github.io/Ping/invite.html';

type InsertedInviteeRow = {
  id: string;
  contact_id: string | null;
  invited_via: string;
};

type ContactLike = { id: string; phone: string | null };

// Called right after invitee rows are inserted. Contacts with no linked
// account (invited_via: 'sms') otherwise never hear about the event at
// all — this is the only thing that actually reaches them.
export async function sendSmsInvites(
  insertedRows: InsertedInviteeRow[],
  contacts: (ContactLike | undefined)[],
  eventTitle: string,
  eventDate: Date,
  location: string
) {
  const smsRows = insertedRows.filter((r) => r.invited_via === 'sms' && r.contact_id);
  if (smsRows.length === 0) return;

  const dateLabel = eventDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  await Promise.all(
    smsRows.map((row) => {
      const contact = contacts.find((c) => c?.id === row.contact_id);
      if (!contact?.phone) return Promise.resolve();

      const link = `${JOIN_LINK_BASE}?i=${row.id}`;
      const body = `You're invited to "${eventTitle}"! ${dateLabel} at ${timeLabel}${
        location ? ` — ${location}` : ''
      }. Reply YES or NO to RSVP. ${link}`;

      return supabase.functions.invoke('send-sms', { body: { to: contact.phone, body } }).catch((err) => {
        console.error('Error sending SMS invite:', err);
      });
    })
  );
}
