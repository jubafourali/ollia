import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';

interface InviteCardProps {
  deepLink: string;
}

const InviteCard = forwardRef<View, InviteCardProps>(({ deepLink }, ref) => (
  <View ref={ref} collapsable={false} style={styles.card}>
    <View style={styles.wordmark}>
      <Text style={styles.wordmarkDark}>Oll</Text>
      <Text style={styles.wordmarkAmber}>ia</Text>
    </View>

    <Text style={styles.message}>Join my family circle</Text>

    <Text style={styles.tagline}>
      Quietly letting your family know you're safe
    </Text>

    <View style={styles.linkContainer}>
      <Text style={styles.link} numberOfLines={1}>
        {deepLink}
      </Text>
    </View>
  </View>
));

InviteCard.displayName = 'InviteCard';
export default InviteCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: theme.colors.background,
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  wordmarkDark: {
    fontSize: 40,
    fontWeight: '700',
    color: theme.colors.text,
  },
  wordmarkAmber: {
    fontSize: 40,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  message: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  linkContainer: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    alignItems: 'center',
  },
  link: {
    fontSize: 13,
    color: theme.colors.accent,
    fontWeight: '500',
  },
});
