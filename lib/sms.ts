import { supabase } from '../supabase';

const JOIN_LINK_BASE = 'https://pingmobileapp.github.io/Ping/invite.html';

type InsertedInviteeRow = {
  id: string;
  contact_id: string | null;
  invited_via: string;
};

type ContactLike = { id: string; phone: string | null };

export function buildInviteLink(inviteeId: string) {
  return `${JOIN_LINK_BASE}?i=${inviteeId}`;
}

// Shared by the Twilio auto-send below and the manual "text them yourself"
// queue (NonAppInviteQueue.tsx) — both need identical wording, they just
// differ on whether a reply is machine-readable. Twilio replies land on
// sms-webhook and get parsed as an RSVP; a text sent from the host's own
// Messages app just replies to the host personally, so that prompt would be
// misleading there and is left off.
export function buildInviteMessage(
  eventTitle: string,
  eventDate: Date,
  location: string,
  inviteeId: string,
  { includeRsvpPrompt = true }: { includeRsvpPrompt?: boolean } = {}
) {
  const dateLabel = eventDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const link = buildInviteLink(inviteeId);
  const rsvpPrompt = includeRsvpPrompt ? ' Reply YES or NO to RSVP.' : '';

  return `You're invited to "${eventTitle}"! ${dateLabel} at ${timeLabel}${
    location ? ` — ${location}` : ''
  }.${rsvpPrompt} ${link}`;
}

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

  await Promise.all(
    smsRows.map((row) => {
      const contact = contacts.find((c) => c?.id === row.contact_id);
      if (!contact?.phone) return Promise.resolve();

      const body = buildInviteMessage(eventTitle, eventDate, location, row.id);

      return supabase.functions.invoke('send-sms', { body: { to: contact.phone, body } }).catch((err) => {
        console.error('Error sending SMS invite:', err);
      });
    })
  );
}
