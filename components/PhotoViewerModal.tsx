import React from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../lib/theme';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

// Deliberately simple - no pinch-zoom. `contain` mode alone already shows
// the whole photo (e.g. a flyer's full text) instead of the cropped banner
// sliver everywhere else shows, which is the actual thing being asked for.
export default function PhotoViewerModal({ visible, uri, onClose }: Props) {
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.white, fontSize: 18, fontWeight: '700' },
});
