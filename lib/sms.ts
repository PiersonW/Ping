const JOIN_LINK_BASE = 'https://pingmobileapp.github.io/Ping/invite.html';

export function buildInviteLink(inviteeId: string) {
  return `${JOIN_LINK_BASE}?i=${inviteeId}`;
}

// Used by NonAppInviteQueue.tsx to fill in the text handed off to the
// host's own Messages app for invitees with no linked account.
export function buildInviteMessage(eventTitle: string, eventDate: Date, location: string, inviteeId: string) {
  const dateLabel = eventDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = eventDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const link = buildInviteLink(inviteeId);

  return `You're invited to "${eventTitle}"! ${dateLabel} at ${timeLabel}${
    location ? ` — ${location}` : ''
  }. ${link}`;
}
