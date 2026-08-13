import React from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors } from '../lib/theme';
import { BubbleAnchor } from './MessageBubble';

// iMessage's six default tapbacks.
const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
const PICKER_HEIGHT = 60;
const PICKER_GAP = 10;
const SCREEN_MARGIN = 12;

type Props = {
  visible: boolean;
  anchor: BubbleAnchor | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export default function ReactionPicker({ visible, anchor, onSelect, onClose }: Props) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  let pickerStyle: ViewStyle | null = null;
  if (anchor) {
    const pickerWidth = Math.min(screenWidth - SCREEN_MARGIN * 2, REACTIONS.length * 48 + 16);
    const left = Math.max(
      SCREEN_MARGIN,
      Math.min(anchor.x + anchor.width / 2 - pickerWidth / 2, screenWidth - pickerWidth - SCREEN_MARGIN)
    );

    // Prefers appearing above the bubble (matches where a thumb naturally
    // isn't covering it); falls back to below when there's no room, e.g.
    // near the top of the thread.
    const fitsAbove = anchor.y - PICKER_HEIGHT - PICKER_GAP > SCREEN_MARGIN;
    const top = fitsAbove
      ? anchor.y - PICKER_HEIGHT - PICKER_GAP
      : Math.min(anchor.y + anchor.height + PICKER_GAP, screenHeight - PICKER_HEIGHT - SCREEN_MARGIN);

    pickerStyle = { position: 'absolute', left, top, width: pickerWidth };
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        {pickerStyle && (
          <View style={[styles.picker, pickerStyle]}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => {
                  onSelect(emoji);
                  onClose();
                }}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,43,43,0.35)' },
  picker: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 30,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  emojiButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
});
