import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, EVENT_IMAGE_ASPECT_RATIO } from '../lib/theme';

type Props = {
  visible: boolean;
  // Local file:// or remote https:// - both work fine with Image.getSize
  // and as an expo-image-manipulator source, so this re-crops an existing
  // already-uploaded photo exactly the same way as a freshly-picked one.
  uri: string | null;
  onCancel: () => void;
  onCropped: (uri: string) => void;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
// Matches the 20px side padding these forms already use, so the frame lines
// up with everything else on the screen behind it.
const FRAME_WIDTH = SCREEN_WIDTH - 40;
const FRAME_HEIGHT = FRAME_WIDTH / EVENT_IMAGE_ASPECT_RATIO;

export default function ImageCropModal({ visible, uri, onCancel, onCropped }: Props) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // The image is scaled to fully cover the frame (like the app's own
  // `cover` display everywhere else), so it's always at least as big as the
  // frame in both directions - only one axis (whichever the image is
  // "extra" long on relative to the frame) ends up actually draggable.
  const scale = naturalSize ? Math.max(FRAME_WIDTH / naturalSize.width, FRAME_HEIGHT / naturalSize.height) : 1;
  const displayedWidth = naturalSize ? naturalSize.width * scale : FRAME_WIDTH;
  const displayedHeight = naturalSize ? naturalSize.height * scale : FRAME_HEIGHT;
  const maxOffsetX = Math.max(0, displayedWidth - FRAME_WIDTH);
  const maxOffsetY = Math.max(0, displayedHeight - FRAME_HEIGHT);

  useEffect(() => {
    if (!visible || !uri) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    RNImage.getSize(
      uri,
      (width, height) => {
        if (cancelled) return;
        const nextScale = Math.max(FRAME_WIDTH / width, FRAME_HEIGHT / height);
        // Start centered - crops equally off both edges rather than
        // defaulting to a corner.
        translateX.value = -((width * nextScale - FRAME_WIDTH) / 2);
        translateY.value = -((height * nextScale - FRAME_HEIGHT) / 2);
        setNaturalSize({ width, height });
      },
      (err) => console.error('Error reading image size for crop:', err)
    );
    return () => {
      cancelled = true;
    };
  }, [visible, uri]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.min(0, Math.max(-maxOffsetX, startX.value + e.translationX));
      translateY.value = Math.min(0, Math.max(-maxOffsetY, startY.value + e.translationY));
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const handleDone = async () => {
    if (!uri || !naturalSize) return;
    setSaving(true);
    try {
      // Re-cropping an already-uploaded photo hands this a remote https://
      // URL - the manipulator needs actual local pixel data to work with,
      // so fetch it down first rather than assuming it can pull from a URL
      // itself. Image.getSize above doesn't have this issue (RN's Image
      // fetches remote metadata natively), only the manipulate step does.
      const localUri = uri.startsWith('http')
        ? (await FileSystem.downloadAsync(uri, `${FileSystem.cacheDirectory}crop-source-${Date.now()}.jpg`)).uri
        : uri;

      // Convert the on-screen frame/offset back into the original photo's
      // own pixel space - everything above is working in "displayed at
      // `scale`" coordinates, but the crop action needs real pixels.
      const originX = Math.max(0, Math.min(naturalSize.width - FRAME_WIDTH / scale, -translateX.value / scale));
      const originY = Math.max(0, Math.min(naturalSize.height - FRAME_HEIGHT / scale, -translateY.value / scale));
      const cropWidth = Math.min(naturalSize.width, FRAME_WIDTH / scale);
      const cropHeight = Math.min(naturalSize.height, FRAME_HEIGHT / scale);

      const imageRef = await ImageManipulator.manipulate(localUri)
        .crop({ originX, originY, width: cropWidth, height: cropHeight })
        .renderAsync();
      const result = await imageRef.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      onCropped(result.uri);
    } catch (err) {
      console.error('Error cropping image:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* RN's Modal renders in its own native window on Android, which the
          app-root GestureHandlerRootView (app/_layout.tsx) doesn't cover -
          without this, the pan gesture below silently wouldn't respond. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <Text style={styles.title}>Reframe Photo</Text>
          <Text style={styles.subtitle}>Drag to reposition</Text>

          <View style={styles.frame}>
            {uri && naturalSize ? (
              <GestureDetector gesture={pan}>
                <Animated.View style={[styles.imageWrap, { width: displayedWidth, height: displayedHeight }, imageStyle]}>
                  <RNImage source={{ uri }} style={{ width: displayedWidth, height: displayedHeight }} />
                </Animated.View>
              </GestureDetector>
            ) : (
              <ActivityIndicator color={colors.white} style={{ flex: 1 }} />
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.doneButton, (saving || !naturalSize) && styles.doneButtonDisabled]}
              onPress={handleDone}
              disabled={saving || !naturalSize}
            >
              <Text style={styles.doneText}>{saving ? 'Saving…' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,20,20,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: { color: colors.white, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 20 },
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  imageWrap: { position: 'absolute', top: 0, left: 0 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 28, width: FRAME_WIDTH },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cancelText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  doneButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary },
  doneButtonDisabled: { opacity: 0.6 },
  doneText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
});
