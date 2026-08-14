import React, { useEffect, useRef } from 'react';
import { Modal, View, TouchableOpacity, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import GroupMessageThread from './GroupMessageThread';
import { colors } from '../lib/theme';

type Props = {
  visible: boolean;
  groupId: string | null;
  groupName: string | null;
  onClose: () => void;
};

// Single-face version of EventDetailModal's card — groups have no "detail
// card" equivalent to flip from (their only other screen is the full
// app/groups/[id].tsx member-management route), so this goes straight to
// the chat and reuses only the swipe-to-dismiss gesture, not the flip.
export default function GroupChatModal({ visible, groupId, groupName, onClose }: Props) {
  const router = useRouter();
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.8) {
          Animated.timing(dragY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  const handleManage = () => {
    onClose();
    if (groupId) router.push(`/groups/${groupId}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ translateY: dragY }] }]}>
          <View
            style={styles.dragHandleArea}
            hitSlop={{ top: 10, bottom: 16, left: 30, right: 30 }}
            {...panResponder.panHandlers}
          >
            <View style={styles.handle} />
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {groupName || 'Group'}
            </Text>
            <TouchableOpacity onPress={handleManage}>
              <Text style={styles.manageText}>Manage</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            {groupId && <GroupMessageThread groupId={groupId} onSwipeBack={onClose} />}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,43,43,0.4)' },
  card: {
    height: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  dragHandleArea: { paddingVertical: 12, marginBottom: 4 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  manageText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
