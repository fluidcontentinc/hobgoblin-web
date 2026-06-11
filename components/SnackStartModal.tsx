import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Pressable } from 'react-native';
import type { PathSnack } from '../src/repositories/PathMapRepository';

interface SnackStartModalProps {
  visible: boolean;
  snack: PathSnack | null;
  /** True when the snack's adventure is the kid's current active adventure. */
  isActiveAdventure: boolean;
  onStart: (snack: PathSnack) => void;
  onClose: () => void;
}

/**
 * Snack start-adventure popup.
 *
 * We deliberately do NOT use React Native's `Modal` here — on web RN's
 * Modal renders into the document body, escaping HuntMapView's phone-frame
 * and causing the backdrop to cover the whole browser viewport. Rendering
 * as an absolutely-positioned overlay keeps both the dim layer and the card
 * bounded by the parent container on every platform.
 */
export default function SnackStartModal({
  visible,
  snack,
  isActiveAdventure,
  onStart,
  onClose,
}: SnackStartModalProps) {
  if (!snack || !visible) return null;

  const hasAdventure = snack.adventureId != null;
  const title = snack.adventureTitle || snack.label || 'Snack';

  return (
    <View style={styles.overlay} pointerEvents="auto">
      {/* Backdrop — tap to dismiss, scoped to HuntMapView's frame. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {snack.image ? (
              <Image source={{ uri: snack.image }} style={styles.image} resizeMode="cover" />
            ) : null}

            {snack.label ? <Text style={styles.snackName}>{snack.label}</Text> : null}

            {hasAdventure ? (
              <>
                {isActiveAdventure && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>This is your current mission</Text>
                  </View>
                )}
                <Text style={styles.sectionLabel}>What you'll get</Text>
                <Text style={styles.reward}>
                  {snack.reward?.trim() || 'Start this mission to find out what awaits on the Path of Power!'}
                </Text>
                <TouchableOpacity style={styles.startButton} onPress={() => onStart(snack)} activeOpacity={0.85}>
                  <Text style={styles.startButtonText}>
                    {isActiveAdventure ? 'Continue mission' : 'Start mission'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.reward}>A tasty stop on the Path of Power.</Text>
            )}
          </ScrollView>
      </View>
    </View>
  );
}

// Rendered as an in-tree absolute overlay (not RN's Modal portal) so the
// dim backdrop is bounded by HuntMapView's frame on every platform.
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 100,
    // @ts-ignore — RN-Web specific, harmless on native
    elevation: 100,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#18181b',
    borderRadius: 4,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#C9943D',
    flex: 1,
    paddingRight: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: { fontSize: 24, color: '#fff', lineHeight: 28 },
  // 16:9 preview — proportional to the card width, so on a 420px-wide
  // card the image is ≈220px tall. `aspectRatio` keeps it from blowing
  // up on big screens where the card was previously full-viewport.
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 4,
    backgroundColor: '#27272a',
    marginBottom: 14,
  },
  snackName: { fontSize: 17, fontWeight: '600', color: '#fff', marginBottom: 10 },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,148,61,0.15)',
    borderColor: '#C9943D',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  activeBadgeText: { color: '#C9943D', fontSize: 12, fontWeight: '600' },
  sectionLabel: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  reward: { fontSize: 15, color: '#a1a1aa', lineHeight: 22, marginBottom: 18 },
  startButton: {
    backgroundColor: '#C9943D',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  startButtonText: { color: '#1a1206', fontSize: 16, fontWeight: '700' },
});
