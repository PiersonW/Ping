import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

async function pickImage(aspect: [number, number]): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Add Photo',
      undefined,
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission needed', 'Allow camera access to take a photo.');
              resolve(null);
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect,
              quality: 0.8,
            });
            resolve(!result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null);
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission needed', 'Allow photo access to choose an image.');
              resolve(null);
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect,
              quality: 0.8,
            });
            resolve(!result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null);
          },
        },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

export async function pickEventImage(): Promise<string | null> {
  return pickImage([4, 3]);
}

export async function pickProfileImage(): Promise<string | null> {
  return pickImage([1, 1]);
}
