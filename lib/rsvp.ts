import { supabase } from '../supabase';
import { notify } from './notify';

export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'interested';

type SubmitRsvpOptions = {
  eventId: string;
  hostId: string | null;
  eventTitle: string;
  userId: string;
  myInviteeId: string | null;
  responderName: string;
  status: 'accepted' | 'declined' | 'interested';
};

// Shared by EventDetailContent's RSVP row and InvitePopup so both surfaces
// mutate `invitees` the same way and never drift out of sync.
export async function submitRsvp(opts: SubmitRsvpOptions): Promise<string | null> {
  const { eventId, hostId, eventTitle, userId, myInviteeId, responderName, status } = opts;

  let inviteeId = myInviteeId;

  if (myInviteeId) {
    const { error } = await supabase
      .from('invitees')
      .update({ rsvp_status: status, responded_at: new Date().toISOString() })
      .eq('id', myInviteeId);
    if (error) console.error('Error updating RSVP:', error);
  } else {
    const { data, error } = await supabase
      .from('invitees')
      .insert([
        {
          event_id: eventId,
          user_id: userId,
          rsvp_status: status,
          invited_via: 'app',
          responded_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();
    if (error) console.error('Error creating RSVP:', error);
    inviteeId = data?.id || null;
  }

  if (status === 'declined' && inviteeId) {
    const { error: releaseError } = await supabase.from('item_claims').delete().eq('invitee_id', inviteeId);
    if (releaseError) console.error('Error releasing claims:', releaseError);
  }

  if (hostId && hostId !== userId) {
    const statusLabel = status === 'accepted' ? 'accepted' : status === 'declined' ? 'declined' : 'is interested in';
    await notify([hostId], 'RSVP update', `${responderName} ${statusLabel} ${eventTitle}`, {
      eventId,
      type: 'rsvp_update',
    });
  }

  return inviteeId;
}
