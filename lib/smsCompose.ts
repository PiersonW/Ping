import { Linking, Platform } from 'react-native';

// iOS and Android disagree on the separator between an sms: URL's number
// and its query string - iOS wants `&`, Android wants `?`. Get this wrong
// and the body param is silently dropped rather than erroring.
export function buildSmsComposeUrl(phone: string, body: string): string {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
}

// Opens the device's own Messages app pre-filled with the recipient and
// text - the user still has to tap Send themselves (neither OS lets an app
// send SMS on the user's behalf), but nothing here touches Twilio or any
// per-message cost/registration.
export async function openSmsComposer(phone: string, body: string): Promise<boolean> {
  const url = buildSmsComposeUrl(phone, body);
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.error('Error opening SMS composer:', err);
    return false;
  }
}
