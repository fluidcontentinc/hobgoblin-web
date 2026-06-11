import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator, Pressable } from 'react-native';
import type { Mission, MissionStep } from '../state';
import { Repos } from '../src/usecases/repos';
import { kidStatusBadge, formatPoints } from '../utils/missionStatus';

interface MissionDetailViewProps {
  mission: Mission;
  missionIndex: number;
  onBack: () => void;
  onComplete?: () => void;
  onGoToHunt?: () => void;
}

const missionImages = [
  require('../assets/mission-1.jpg'),
  require('../assets/mission-2.jpg'),
  require('../assets/mission-3.jpg'),
  require('../assets/mission-4.jpg'),
];

const REQUIREMENT_LABELS: Record<MissionStep['requirement_type'], string> = {
  photo: 'Photo proof',
  qr: 'Scan QR code',
  gps: 'Check in (GPS)',
  codeword: 'Code word',
};

export default function MissionDetailView({ mission, missionIndex, onBack, onGoToHunt }: MissionDetailViewProps) {
  const [currentMission, setCurrentMission] = useState<Mission>(mission);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [busy, setBusy] = useState(false);
  // Single-active confirm prompt: holds the title of the currently-active
  // mission that would be paused if the kid starts this one.
  const [confirmActiveTitle, setConfirmActiveTitle] = useState<string | null>(null);

  // The list item only carries title/location/status — fetch the full record
  // so we can render the real description, steps and fresh kid_status.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = await Repos.missions.getById(mission.id);
        if (!cancelled && full) {
          setCurrentMission((prev) => ({ ...prev, ...full }));
        }
      } catch (error: any) {
        console.error('Error loading mission detail:', error);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mission.id]);

  const kidStatus = currentMission.kidStatus;
  const badge = kidStatusBadge(kidStatus);

  const reportError = (error: any, fallback: string) => {
    console.error(fallback, error);
    Alert.alert('Error', error?.message || error?.response?.data?.message || fallback);
  };

  // Actually start: backend enforces the single-active rule (auto-pausing any
  // other active enrollment), so this is safe regardless of the confirm.
  const doStart = async () => {
    try {
      setBusy(true);
      const updated = await Repos.missions.start(currentMission.id);
      setCurrentMission(updated);
      onGoToHunt?.();
    } catch (error: any) {
      reportError(error, 'Could not start this mission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartPress = async () => {
    if (busy) return;
    // Detect an existing active mission so we can confirm before pausing it.
    try {
      const active = await Repos.adventure.getActiveAdventure();
      if (active && active.id !== currentMission.id) {
        setConfirmActiveTitle(active.title || 'your current mission');
        return;
      }
    } catch {
      // If we can't determine the active mission, fall through and let the
      // backend's single-active enforcement handle it.
    }
    await doStart();
  };

  const handleConfirmSwitch = async () => {
    setConfirmActiveTitle(null);
    await doStart();
  };

  const handlePause = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const updated = await Repos.missions.pause(currentMission.id);
      setCurrentMission(updated);
    } catch (error: any) {
      reportError(error, 'Could not pause this mission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const updated = await Repos.missions.resume(currentMission.id);
      setCurrentMission(updated);
      onGoToHunt?.();
    } catch (error: any) {
      reportError(error, 'Could not resume this mission. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const steps = currentMission.steps ?? [];
  const pointsTotal = currentMission.pointsTotal ?? currentMission.points ?? 0;
  const pointsEarned = currentMission.pointsEarned ?? 0;
  const stepsTotal = currentMission.stepsTotal ?? steps.length;
  const stepsCompleted = currentMission.stepsCompleted ?? 0;
  const progressPct = Math.max(0, Math.min(100, currentMission.progressPct ?? 0));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {missionImages[missionIndex] && (
        <Image 
          source={missionImages[missionIndex]} 
          style={styles.missionImage}
          resizeMode="cover"
        />
      )}

      <View style={styles.content}>
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
          {pointsTotal > 0 && (
            <Text style={styles.pointsText}>{formatPoints(pointsEarned, pointsTotal)}</Text>
          )}
        </View>

        <Text style={styles.title}>{currentMission.title}</Text>
        <Text style={styles.location}>{currentMission.location}</Text>

        {/* Progress: bar + steps completed/total */}
        {stepsTotal > 0 && (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              {stepsCompleted} / {stepsTotal} steps · {progressPct}%
            </Text>
          </View>
        )}

        {currentMission.description ? (
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionTitle}>Mission Description</Text>
            <Text style={styles.description}>{currentMission.description}</Text>
          </View>
        ) : loadingDetail ? null : (
          <View style={styles.descriptionCard}>
            <Text style={styles.description}>
              Complete this mission to earn points and progress in the Hob Gobbler Hunt!
            </Text>
          </View>
        )}

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Steps</Text>
          {loadingDetail ? (
            <ActivityIndicator color="#C9943D" style={{ marginVertical: 12 }} />
          ) : steps.length === 0 ? (
            <Text style={styles.stepsEmpty}>No steps have been added to this mission yet.</Text>
          ) : (
            steps.map((step) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.sequence || '•'}</Text>
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {!!step.description && <Text style={styles.stepDescription}>{step.description}</Text>}
                  <View style={styles.stepMeta}>
                    <Text style={styles.stepMetaTag}>{REQUIREMENT_LABELS[step.requirement_type]}</Text>
                    {step.points > 0 && <Text style={styles.stepMetaPoints}>{step.points} pts</Text>}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {kidStatus === 'not_started' && (
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={handleStartPress}
            activeOpacity={0.8}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Adventure</Text>
            )}
          </TouchableOpacity>
        )}

        {kidStatus === 'active' && (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={onGoToHunt}
              activeOpacity={0.8}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={handlePause}
              activeOpacity={0.8}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#C9943D" />
              ) : (
                <Text style={styles.secondaryButtonText}>Pause</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {kidStatus === 'paused' && (
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={handleResume}
            activeOpacity={0.8}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryButtonText}>Resume</Text>
            )}
          </TouchableOpacity>
        )}

        {kidStatus === 'completed' && (
          <>
            <View style={[styles.primaryButton, styles.buttonDisabled]}>
              <Text style={styles.primaryButtonText}>Completed ✓</Text>
            </View>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onGoToHunt}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>View recap</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Single-active confirm prompt */}
      {confirmActiveTitle && (
        <View style={styles.confirmOverlay} pointerEvents="auto">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmActiveTitle(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Switch missions?</Text>
            <Text style={styles.confirmBody}>
              Pause "{confirmActiveTitle}" and start "{currentMission.title}"?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmCancel]}
                onPress={() => setConfirmActiveTitle(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmAccept]}
                onPress={handleConfirmSwitch}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmAcceptText}>Pause & Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  contentContainer: {
    paddingBottom: 100,
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 14,
    color: '#C9943D',
    fontWeight: '400',
  },
  missionImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#27272a',
  },
  content: {
    padding: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    backgroundColor: '#233C15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '400',
  },
  pointsText: {
    fontSize: 16,
    color: '#C9943D',
    fontWeight: '400',
  },
  title: {
    fontSize: 24,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  location: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 24,
  },
  descriptionCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  descriptionTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    fontWeight: '400',
  },
  stepsCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 24,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  stepsEmpty: {
    fontSize: 14,
    color: '#71717a',
    fontWeight: '400',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#233C15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#a1a1aa',
    lineHeight: 18,
    marginBottom: 6,
  },
  stepMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepMetaTag: {
    fontSize: 11,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 12,
  },
  stepMetaPoints: {
    fontSize: 11,
    color: '#71717a',
    fontWeight: '500',
  },
  progressBlock: {
    marginBottom: 24,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27272a',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#C9943D',
  },
  progressLabel: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 6,
    fontWeight: '400',
  },
  primaryButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 12,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: 'transparent',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#C9943D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    fontSize: 12,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
    // @ts-ignore — RN-Web specific, harmless on native
    elevation: 100,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#18181b',
    borderRadius: 4,
    padding: 20,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  confirmBody: {
    fontSize: 15,
    color: '#a1a1aa',
    lineHeight: 22,
    marginBottom: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  confirmCancelText: {
    fontSize: 14,
    color: '#a1a1aa',
    fontWeight: '600',
  },
  confirmAccept: {
    backgroundColor: '#C9943D',
  },
  confirmAcceptText: {
    fontSize: 14,
    color: '#1a1206',
    fontWeight: '700',
  },
});

