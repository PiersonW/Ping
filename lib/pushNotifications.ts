import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

Notifications.setNotificationHandler({
  // Invite notifications are handled by the in-app InvitePopup instead —
  // showing the native banner too while foregrounded would be redundant.
  handleNotification: async (notification) => {
    const isInvite = notification.request.content.data?.type === 'invite';
    return {
      shouldShowAlert: !isInvite,
      shouldShowBanner: !isInvite,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device, not a simulator.');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied.');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.log('Push token unavailable: no EAS projectId in app.json.');
    return;
  }

  let token: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
  } catch (err) {
    console.log('Push token unavailable:', err);
    return;
  }

  const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  if (error) console.error('Error saving push token:', error);
}
