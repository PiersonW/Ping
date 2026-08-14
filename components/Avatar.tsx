import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

type Props = {
  url: string | null | undefined;
  name: string;
  size?: number;
};

export default function Avatar({ url, name, size = 28 }: Props) {
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatar, dimensionStyle]}>
      {url ? (
        <Image source={{ uri: url }} style={dimensionStyle} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.45 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: colors.textOnPrimary, fontWeight: '700' },
});
