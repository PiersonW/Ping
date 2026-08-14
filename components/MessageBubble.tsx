import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '../lib/theme';
import { ReactionCount } from '../lib/useMessageReactions';

export type BubbleAnchor = { x: number; y: number; width: number; height: number };

type Props = {
  isMine: boolean;
  senderLabel?: string;
  body: string;
  timestamp: string;
  reactions: ReactionCount[];
  isActive: boolean;
  onToggleReaction: (emoji: string) => void;
  onLongPressBubble: (anchor: BubbleAnchor) => void;
};

export default function MessageBubble({
  isMine,
  senderLabel,
  body,
  timestamp,
  reactions,
  isActive,
  onToggleReaction,
  onLongPressBubble,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const bubbleRef = useRef<View>(null);

  // Driven by `isActive` (whether this bubble's reaction picker is open)
  // rather than press-in/press-out directly, so it only pops once a long
  // press actually registers - a quick tap shouldn't visibly react at all.
  useEffect(() => {
    Animated.spring(scale, {
      toValue: isActive ? 1.06 : 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  }, [isActive, scale]);

  const handleLongPress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Position of the bubble itself (not the raw touch point) is what the
    // picker anchors to - it reads more like iMessage's tapback (appears
    // right by the message) than a menu trailing your finger.
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onLongPressBubble({ x, y, width, height });
    });
  };

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={isMine ? styles.bubbleColumnMine : styles.bubbleColumn}>
        <Animated.View
          ref={bubbleRef}
          collapsable={false}
          style={[{ transform: [{ scale }] }, isActive && styles.raised]}
        >
          <TouchableOpacity
            style={[styles.bubble, isMine && styles.bubbleMine, isActive && styles.bubbleActive]}
            activeOpacity={0.85}
            onLongPress={handleLongPress}
            delayLongPress={280}
          >
            {!isMine && senderLabel && <Text style={styles.senderName}>{senderLabel}</Text>}
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{body}</Text>
            <Text style={[styles.timestamp, isMine && styles.timestampMine]}>{timestamp}</Text>
          </TouchableOpacity>
        </Animated.View>
        {reactions.length > 0 && (
          <View style={[styles.reactionRow, isMine && styles.reactionRowMine]}>
            {reactions.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={[styles.reactionPill, r.mine && styles.reactionPillMine]}
                onPress={() => onToggleReaction(r.emoji)}
              >
                <Text style={styles.reactionPillText}>
                  {r.emoji}
                  {r.count > 1 ? ` ${r.count}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', width: '100%', marginBottom: 10 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  // Explicit on this inner wrapper too, redundant with bubbleRow's
  // justifyContent - the bubble and its reaction row both need to anchor
  // to the same edge independently of each other's width, not just be
  // pushed as a shrink-wrapped unit that could end up misaligned.
  bubbleColumn: { alignItems: 'flex-start' },
  bubbleColumnMine: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleActive: { borderColor: colors.primaryDark },
  raised: {
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  senderName: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  bubbleText: { color: colors.textPrimary, fontSize: 15 },
  bubbleTextMine: { color: colors.textOnPrimary },
  timestamp: { color: colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  timestampMine: { color: 'rgba(255,255,255,0.75)' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillMine: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  reactionPillText: { fontSize: 13, color: colors.textPrimary },
});
