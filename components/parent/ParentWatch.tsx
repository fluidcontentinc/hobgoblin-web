import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import HuntMapView from '../HuntMapView';
import { ParentActions, currentStepOf, nextStepOf } from '../../src/usecases/parent';
import type { Kid, KidProgress } from '../../src/repositories/ParentRepository';

/**
 * Parent supervision views embedded in the Browse (Menu) page tabs:
 *
 *   mode="map"      — Hunt tab: the kid's Path of Power map, read-only, with
 *                     a "kid is here" marker. Multiple kids get a selector row.
 *   mode="missions" — Missions tab: one card per kid showing their active
 *                     mission, progress, current spot, and what's next.
 */

interface ParentWatchProps {
  mode: 'map' | 'missions';
}

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ParentWatch({ mode }: ParentWatchProps) {
  const [kids, setKids] = useState<Kid[]>([]);
  const [progressByKid, setProgressByKid] = useState<Record<number, KidProgress>>({});
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const kidList = await ParentActions.loadKids();
      setKids(kidList);

      const entries = await Promise.all(
        kidList.map(async (k) =>
          [k.id, await ParentActions.loadProgress(k.id).catch(() => null)] as const,
        ),
      );
      const byKid: Record<number, KidProgress> = {};
      for (const [id, prog] of entries) {
        if (prog) byKid[id] = prog;
      }
      setProgressByKid(byKid);
      setSelectedKidId((prev) =>
        prev != null && kidList.some((k) => k.id === prev) ? prev : (kidList[0]?.id ?? null),
      );
    } catch {
      // Leave whatever loaded; empty states below handle the rest.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={w.centered}>
        <ActivityIndicator color="#C9943D" />
      </View>
    );
  }

  if (kids.length === 0) {
    return (
      <View style={w.centered}>
        <Text style={w.emptyText}>No kids linked yet. Add a kid from the Kids tab.</Text>
      </View>
    );
  }

  // ── Hunt map mode ──────────────────────────────────────────────────────────
  if (mode === 'map') {
    const selected = kids.find((k) => k.id === selectedKidId) ?? kids[0];
    const prog = progressByKid[selected.id];
    const nodes = prog?.mapNodes ?? [];

    return (
      <View style={{ flex: 1 }}>
        {kids.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={w.kidChips}
            contentContainerStyle={w.kidChipsContent}
          >
            {kids.map((kid) => {
              const active = kid.id === selected.id;
              return (
                <TouchableOpacity
                  key={kid.id}
                  style={[w.kidChip, active && w.kidChipActive]}
                  onPress={() => setSelectedKidId(kid.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[w.kidChipText, active && w.kidChipTextActive]}>
                    {kid.name ?? kid.email}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {nodes.length === 0 ? (
          <View style={w.centered}>
            <Text style={w.emptyText}>
              {(selected.name ?? 'This kid') + " isn't on a mission right now."}
            </Text>
          </View>
        ) : (
          <HuntMapView parentNodes={nodes} hereLabel={initials(selected.name)} />
        )}
      </View>
    );
  }

  // ── Missions mode ──────────────────────────────────────────────────────────
  // Rendered inside BrowseView's outer ScrollView, so this is a plain View
  // (nested vertical ScrollViews don't size correctly). Data reloads on every
  // tab visit since the component remounts.
  return (
    <View style={w.missionsContent}>
      {kids.map((kid) => {
        const prog = progressByKid[kid.id];
        const adv = prog?.activeAdventure ?? null;
        const nodes = prog?.mapNodes ?? [];
        const current = currentStepOf(nodes);
        const next = nextStepOf(nodes);

        return (
          <View key={kid.id} style={w.card}>
            <View style={w.cardHeader}>
              <View style={w.avatar}>
                <Text style={w.avatarText}>{initials(kid.name)}</Text>
              </View>
              <Text style={w.kidName}>{kid.name ?? kid.email}</Text>
            </View>

            {adv ? (
              <>
                <Text style={w.advTitle}>{adv.title}</Text>
                <View style={w.progressRow}>
                  <View style={w.progressTrack}>
                    <View style={[w.progressFill, { width: `${Math.max(0, Math.min(100, adv.progress))}%` as any }]} />
                  </View>
                  <Text style={w.progressPct}>{adv.progress}%</Text>
                </View>
                <Text style={w.progressDetail}>
                  {adv.completedSteps} of {adv.totalSteps} steps complete
                </Text>

                {current ? (
                  <View style={w.whereBlock}>
                    <Text style={w.whereLine}>
                      <Text style={w.whereMarker}>📍 </Text>
                      {current.sequence}. {current.title}
                    </Text>
                    <Text
                      style={[
                        w.whereStatus,
                        current.status === 'pending' && w.whereStatusPending,
                        current.status === 'rejected' && w.whereStatusRejected,
                      ]}
                    >
                      {current.status === 'pending'
                        ? 'Submitted — waiting on your review'
                        : current.status === 'rejected'
                        ? 'Needs another try'
                        : 'Exploring this stop'}
                    </Text>
                    {next && (
                      <Text style={w.nextLine}>
                        Up next: {next.sequence}. {next.title}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={w.doneText}>All steps complete — mission finished! 🎉</Text>
                )}
              </>
            ) : (
              <Text style={w.emptyText}>No active mission right now.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const w = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },

  // Kid selector (map mode, multi-kid)
  kidChips: {
    flexGrow: 0,
    backgroundColor: '#000',
  },
  kidChipsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  kidChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111',
  },
  kidChipActive: {
    borderColor: '#C9943D',
    backgroundColor: 'rgba(201,148,61,0.15)',
  },
  kidChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  kidChipTextActive: {
    color: '#C9943D',
  },

  // Mission cards (missions mode)
  missionsContent: {
    padding: 4,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16, // true circle — exempt from the flat-corner canon
    backgroundColor: 'rgba(201,148,61,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#C9943D',
    fontSize: 12,
    fontWeight: '700',
  },
  kidName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  advTitle: {
    color: '#F6E3AE',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C9943D',
  },
  progressPct: {
    color: '#C9943D',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  progressDetail: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 4,
  },
  whereBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  whereMarker: {
    color: '#C9943D',
  },
  whereLine: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  whereStatus: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 3,
  },
  whereStatusPending: {
    color: '#f59e0b',
  },
  whereStatusRejected: {
    color: '#ef4444',
  },
  nextLine: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 6,
  },
  doneText: {
    color: '#10b981',
    fontSize: 14,
    marginTop: 10,
  },
});
