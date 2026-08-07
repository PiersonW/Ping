import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
} from 'react-native';
import EventDetailContent from './EventDetailContent';
import MessageThread from './MessageThread';
import { colors } from '../lib/theme';

type Props = {
  visible: boolean;
  eventId: string | null;
  onClose: () => void;
  startOnMessages?: boolean;
};

export default function EventDetailModal({ visible, eventId, onClose, startOnMessages = false }: Props) {
  const [isFlipped, setIsFlipped] = useState(startOnMessages);
  const flipAnim = useRef(new Animated.Value(startOnMessages ? 180 : 0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      // Jump (don't animate) to the requested face — the modal is already
      // sliding in, so an extra flip animation on top would look off.
      flipAnim.setValue(startOnMessages ? 180 : 0);
      setIsFlipped(startOnMessages);
    }
  }, [visible, startOnMessages]);

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
            handleClose();
          });
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  const toggleFlip = () => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 180,
      duration: 450,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleClose = () => {
    if (isFlipped) {
      flipAnim.setValue(0);
      setIsFlipped(false);
    }
    onClose();
  };

  const frontRotateY = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
  const backRotateY = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ translateY: dragY }] }]}>
          <View
            style={styles.dragHandleArea}
            hitSlop={{ top: 10, bottom: 16, left: 30, right: 30 }}
            {...panResponder.panHandlers}
          >
            <View style={styles.handle} />
          </View>

          <View style={styles.faceContainer}>
            <Animated.View
              style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: frontRotateY }] }]}
              pointerEvents={isFlipped ? 'none' : 'auto'}
            >
              {eventId && <EventDetailContent eventId={eventId} onClose={handleClose} variant="modal" />}
            </Animated.View>

            <Animated.View
              style={[
                styles.face,
                styles.faceBack,
                { transform: [{ perspective: 1000 }, { rotateY: backRotateY }] },
              ]}
              pointerEvents={isFlipped ? 'auto' : 'none'}
            >
              {eventId && <MessageThread eventId={eventId} onFlipBack={toggleFlip} />}
            </Animated.View>
          </View>

          {!isFlipped && (
            <TouchableOpacity style={styles.messageBubble} onPress={toggleFlip} activeOpacity={0.8}>
              <Text style={styles.messageBubbleIcon}>💬</Text>
            </TouchableOpacity>
          )}
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
  faceContainer: { flex: 1 },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' },
  faceBack: { paddingHorizontal: 2 },
  messageBubble: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  messageBubbleIcon: { fontSize: 22 },
});
