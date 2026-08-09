import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JOIN_LINK_BASE = 'https://piersonw.github.io/Ping/invite.html';

// Mirrors normalizePhone in lib/phone.ts — duplicated here since this runs
// in Deno, not the RN bundle.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

async function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null, authToken: string) {
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

function twiml(message?: string) {
  const body = message ? `<Response><Message>${message.replace(/&/g, '&amp;')}</Message></Response>` : '<Response></Response>';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

serve(async (req) => {
  try {
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const bodyText = await req.text();
    const params = Object.fromEntries(new URLSearchParams(bodyText));

    // This endpoint is necessarily unauthenticated (Twilio has no Supabase
    // session) — without this check, anyone who found the URL could POST
    // fake replies and silently flip RSVP status on any pending SMS invite.
    const signature = req.headers.get('X-Twilio-Signature');
    const isValid = await validTwilioSignature(req.url, params, signature, authToken);
    if (!isValid) {
      return new Response('Invalid signature', { status: 403 });
    }

    const from = params['From'];
    const messageBody = (params['Body'] || '').trim().toUpperCase();
    if (!from) return twiml();

    const normalizedFrom = normalizePhone(from);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: matchingContacts } = await supabase.from('contacts').select('id').eq('phone', normalizedFrom);
    const contactIds = (matchingContacts || []).map((c) => c.id);
    if (contactIds.length === 0) return twiml();

    const { data: invitee } = await supabase
      .from('invitees')
      .select('id, event_id, contacts(name), events(id, title, host_id)')
      .in('contact_id', contactIds)
      .eq('invited_via', 'sms')
      .eq('rsvp_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!invitee || !invitee.events) return twiml();

    const status = messageBody === 'YES' || messageBody === 'Y'
      ? 'accepted'
      : messageBody === 'NO' || messageBody === 'N'
      ? 'declined'
      : 'interested';

    await supabase
      .from('invitees')
      .update({ rsvp_status: status, responded_at: new Date().toISOString() })
      .eq('id', invitee.id);

    const event = invitee.events as any;
    const contactName = (invitee.contacts as any)?.name || 'Someone';

    if (event.host_id) {
      const title = 'RSVP update';
      const body = `${contactName} ${status === 'accepted' ? 'accepted' : status === 'declined' ? 'declined' : 'is interested in'} ${event.title} (via text)`;

      await supabase.from('notifications').insert([
        { recipient_id: event.host_id, type: 'rsvp_update', event_id: event.id, title, body },
      ]);
      await supabase.functions.invoke('send-push', {
        body: { user_ids: [event.host_id], title, body, data: { eventId: event.id, type: 'rsvp_update' } },
      });
    }

    const statusLabel = status === 'accepted' ? 'going' : status === 'declined' ? 'not going' : 'interested';
    const joinLink = `${JOIN_LINK_BASE}?i=${invitee.id}`;
    return twiml(
      `Thanks! You're marked as ${statusLabel} for "${event.title}". See full details and get the Ping app: ${joinLink}`
    );
  } catch (err) {
    console.error(err);
    return twiml();
  }
});
