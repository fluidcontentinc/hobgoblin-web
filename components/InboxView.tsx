import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../src/api/client';
import type { Transmission } from '../state';
import TransmissionOverlay from './TransmissionOverlay';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;
  step_id: number | null;
  step_title: string | null;
  step_sequence: number | null;
  asset_id: number | null;
  type: 'video' | 'audio' | 'image';
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  read_at: string | null;
  received_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function itemToTransmission(item: InboxItem): Transmission {
  return {
    id: String(item.asset_id ?? item.id),
    type: item.type,
    title: item.title,
    timestamp: item.received_at,
    payload: {
      url: item.url,
      thumbnail_url: item.thumbnail_url,
      duration_seconds: item.duration_seconds,
      title: item.title,
      type: item.type,
    },
    acknowledged: !!item.read_at,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface InboxViewProps {
  onUnreadCountChange?: (count: number) => void;
}

export default function InboxView({ onUnreadCountChange }: InboxViewProps) {
  const [items, setItems]             = useState<InboxItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeItem, setActiveItem]   = useState<InboxItem | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/kid/inbox');
      const list: InboxItem[] = data?.items ?? [];
      setItems(list);
      onUnreadCountChange?.(data?.unread_count ?? 0);
    } catch (e) {
      // silently fail — no toast, inbox is non-critical
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => { load(); }, [load]);

  // Poll the inbox while mounted so new transmissions appear without a manual
  // pull-to-refresh. Pauses while the app is backgrounded.
  useEffect(() => {
    const POLL_MS = 18000;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const handleOpen = async (item: InboxItem) => {
    setActiveItem(item);
    if (!item.read_at) {
      // Optimistically mark read locally
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i)
      );
      const remainingUnread = items.filter((i) => !i.read_at && i.id !== item.id).length;
      onUnreadCountChange?.(remainingUnread);
      try {
        await api.post(`/kid/inbox/${item.id}/read`, {});
      } catch { /* best-effort */ }
    }
  };

  const handleDismiss = () => {
    setActiveItem(null);
  };

  const unreadCount = items.filter((i) => !i.read_at).length;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transmissions</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#C9943D" />}
      >
        {loading && items.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator color="#C9943D" />
          </View>
        )}

        {!loading && items.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No transmissions yet</Text>
            <Text style={styles.emptySubtitle}>
              Complete mission steps to unlock messages from the Hobgoblin.
            </Text>
          </View>
        )}

        {items.map((item) => {
          const isUnread = !item.read_at;
          const previewUrl = item.type === 'image' ? item.url : item.thumbnail_url;

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, isUnread && styles.cardUnread]}
              onPress={() => handleOpen(item)}
              activeOpacity={0.75}
            >
              {/* Thumbnail */}
              <View style={styles.thumb}>
                {previewUrl ? (
                  <Image source={{ uri: previewUrl }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbIcon}>
                      {item.type === 'video' ? 'V' : item.type === 'audio' ? 'A' : 'I'}
                    </Text>
                  </View>
                )}
                {isUnread && <View style={styles.unreadDot} />}
              </View>

              {/* Content */}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                {item.step_title && (
                  <Text style={styles.cardSub} numberOfLines={1}>
                    Step {item.step_sequence} — {item.step_title}
                  </Text>
                )}
                <Text style={styles.cardTime}>{timeAgo(item.received_at)}</Text>
              </View>

              {/* Type tag */}
              <View style={styles.typeTag}>
                <Text style={styles.typeTagText}>{item.type.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Transmission player */}
      <TransmissionOverlay
        transmission={activeItem ? itemToTransmission(activeItem) : null}
        visible={!!activeItem}
        onDismiss={handleDismiss}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const GOLD = '#C9943D';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  unreadBadge: {
    backgroundColor: GOLD,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unreadBadgeText: { color: '#000', fontSize: 11, fontWeight: '800' },

  list:    { padding: 16, gap: 10 },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty:   { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle:    { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  emptySubtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 12,
  },
  cardUnread: {
    borderColor: 'rgba(201,148,61,0.3)',
    backgroundColor: 'rgba(201,148,61,0.05)',
  },

  thumb: { position: 'relative' },
  thumbImage: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  thumbPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon:  { color: 'rgba(255,255,255,0.25)', fontSize: 14, fontWeight: '700' },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: '#111',
  },

  cardBody: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  cardSub:   { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 4 },
  cardTime:  { color: 'rgba(255,255,255,0.25)', fontSize: 11 },

  typeTag: {
    backgroundColor: 'rgba(201,148,61,0.12)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  typeTagText: { color: GOLD, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
