import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { statusConfig } from '../lib/theme';

interface StatusBadgeProps {
  status: 'safe' | 'quiet' | 'checkin';
  size?: 'small' | 'large';
}

export function StatusBadge({ status, size = 'small' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const isLarge = size === 'large';

  return (
    <View style={[styles.badge, { backgroundColor: config.color }, isLarge && styles.badgeLarge]}>
      <Text style={[styles.label, isLarge && styles.labelLarge]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeLarge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  labelLarge: {
    fontSize: 16,
  },
});
