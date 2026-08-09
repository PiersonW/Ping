import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Sends a single SMS via Twilio. Called right after an invitee row is
// inserted for someone with no linked account (invited_via: 'sms') — see
// lib/sms.ts on the client side.
serve(async (req) => {
  try {
    const { to, body } = await req.json();

    if (!to || !body) {
      return new Response(JSON.stringify({ error: 'to and body are required' }), { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const form = new URLSearchParams();
    form.set('To', to.startsWith('+') ? to : `+1${to}`);
    form.set('From', fromNumber);
    form.set('Body', body);

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );

    const result = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Twilio send failed:', result);
      return new Response(JSON.stringify({ error: result }), { status: 502 });
    }

    return new Response(JSON.stringify({ sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
