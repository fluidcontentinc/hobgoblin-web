import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { AdventureActions } from '../src/usecases/adventure';
import type { AdventureMapNode, ProofSubmission } from '../src/repositories/AdventureRepository';
import ProofUpload from './ProofUpload';
import { resolveAssetUrl } from '../src/api/config';

interface StepDetailModalProps {
  visible: boolean;
  node: AdventureMapNode | null;
  adventureId: number;
  onClose: () => void;
  onProofSubmitted: () => void;
  /**
   * Info-only mode for the parent's view of a kid's map: shows the step
   * details and status but hides proof upload (parents don't submit steps).
   */
  readOnly?: boolean;
}

/**
 * Step detail popup.
 *
 * Same rationale as SnackStartModal: we render an in-tree absolute overlay
 * instead of RN's `Modal` so the dim backdrop is bounded by HuntMapView's
 * phone-frame on web (RN-Web's Modal escapes to the document body).
 */
export default function StepDetailModal({
  visible,
  node,
  adventureId,
  onClose,
  onProofSubmitted,
  readOnly = false,
}: StepDetailModalProps) {
  if (!node || !visible) return null;

  const transmission = node.transmission ?? null;
  const cluePayload = transmission?.payload ?? null;
  const clueTitle: string = cluePayload?.title || transmission?.title || 'Transmission';
  const clueImage = resolveAssetUrl(cluePayload?.url || cluePayload?.thumbnail_url);

  const handleProofSuccess = async (submission: ProofSubmission) => {
    // Refresh map state after successful submission
    try {
      await AdventureActions.refreshMap(adventureId);
      onProofSubmitted();
      
      // If status is pending, keep modal open to show pending state
      // If approved/completed, close modal
      if (submission.status !== 'pending') {
        onClose();
      }
    } catch (error) {
      console.error('Error refreshing map:', error);
    }
  };

  const handleProofError = (error: Error) => {
    console.error('Proof upload error:', error);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{node.title}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {node.description && (
            <Text style={styles.description}>{node.description}</Text>
          )}

          {transmission && (
            <View style={styles.clueCard}>
              <Text style={styles.clueLabel}>Transmission / Clue</Text>
              {clueImage ? (
                <Image source={{ uri: clueImage }} style={styles.clueImage} resizeMode="contain" />
              ) : null}
              <Text style={styles.clueTitle} numberOfLines={2}>{clueTitle}</Text>
            </View>
          )}

          {!!node.points && node.points > 0 && (
            <Text style={styles.pointsBadge}>{node.points} pts</Text>
          )}

          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text style={[
              styles.status,
              node.status === 'completed' ? styles.statusCompleted :
              node.status === 'pending'   ? styles.statusPending :
              node.status === 'rejected'  ? styles.statusRejected :
              styles.statusAvailable,
            ]}>
              {node.status === 'completed' ? 'Completed' :
               node.status === 'pending'   ? 'Pending Review' :
               node.status === 'rejected'  ? 'Rejected — Try Again' :
               'In Progress'}
            </Text>
          </View>

          {/* Show upload for available or rejected steps (kid can re-submit after rejection) */}
          {!readOnly && (node.status === 'available' || node.status === 'rejected') && (
            <ProofUpload
              stepId={node.id}
              onSuccess={handleProofSuccess}
              onError={handleProofError}
            />
          )}

          {node.status === 'pending' && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>Waiting for parent approval...</Text>
            </View>
          )}

          {node.status === 'completed' && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedText}>Step Completed</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 12,
    // Top offset + bottom clearance keep the modal inside the map frame,
    // above the instructions bar + bottom nav.
    paddingTop: 24,
    paddingBottom: 90,
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#C9943D',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  description: {
    fontSize: 16,
    color: '#a1a1aa',
    marginBottom: 16,
    lineHeight: 22,
  },
  clueCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(201,148,61,0.4)',
    padding: 12,
    marginBottom: 16,
  },
  clueLabel: {
    fontSize: 11,
    color: '#C9943D',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  clueImage: {
    width: '100%',
    height: 340,
    borderRadius: 4,
    backgroundColor: '#000',
    marginBottom: 10,
  },
  clueTitle: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
  },
  pointsBadge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    color: '#C9943D',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 14,
    color: '#71717a',
    marginRight: 8,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusCompleted: {
    color: '#10b981',
  },
  statusPending: {
    color: '#f59e0b',
  },
  statusRejected: {
    color: '#ef4444',
  },
  statusAvailable: {
    color: '#C9943D',
  },
  pendingBadge: {
    backgroundColor: '#3f3f46',
    padding: 16,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 16,
  },
  pendingText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  completedBadge: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 16,
  },
  completedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

