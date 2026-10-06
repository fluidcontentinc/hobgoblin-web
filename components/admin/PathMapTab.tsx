import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../src/api/client';
import { Repos } from '../../src/usecases/repos';
import type { PathSnack } from '../../src/repositories/PathMapRepository';
import type { Restaurant } from '../../state';
import { showToast } from '../common/Toast';
import { colors, radii, spacing, type as ty } from './ui/tokens';

const ARTBOARD_IMAGE = require('../../assets/map.png');
const PATH_OF_POWER_IMAGE = require('../../assets/path-of-power.png');
const ARTBOARD_ASPECT = 4691 / 2640; // new wide Oak Park map (landscape) — matches the kid map
const BANNER_HEIGHT = 52;
const SNACK_SIZE = 52;
const NODE_SIZE = 34;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

// Preset mission colors the admin can choose from.
const MISSION_COLORS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71',
  '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63',
  '#00BCD4', '#8BC34A', '#FF5722', '#607D8B',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface MissionStep {
  id: number;
  sequence: number;
  title: string;
  description: string | null;
  x_pct: number | null;
  y_pct: number | null;
}

interface MissionLayer {
  id: number;
  title: string;
  color: string;
  status: string;
  expanded: boolean;
  loading: boolean;
  steps: MissionStep[];
}

interface PendingPlacement {
  adventureId: number;
  step: MissionStep;
  color: string;
}

// Steps can carry duplicate or non-sequential `sequence` values in the data.
// For display we number them positionally (1, 2, 3, …) to match the Missions
// tab table, so the editor never shows e.g. two "3"s.
function stepDisplayNumbers(steps: MissionStep[]): Map<number, number> {
  const ordered = [...steps].sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id));
  const map = new Map<number, number>();
  ordered.forEach((st, i) => map.set(st.id, i + 1));
  return map;
}

// ── Image picker ──────────────────────────────────────────────────────────────

type PickedImage = File | { uri: string; name: string; type: string };

async function pickImageForUpload(): Promise<PickedImage | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        resolve(file ?? null);
      };
      input.click();
    });
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { showToast('Photo permission required', 'error'); return null; }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.uri) return null;
  const type = asset.mimeType ?? 'image/jpeg';
  const extFromType = type.split('/')[1] || 'jpg';
  const name = asset.fileName ?? `snack_${Date.now()}.${extFromType}`;
  return { uri: asset.uri, name, type };
}

let snackCounter = 0;
function makeId(): string {
  snackCounter += 1;
  return `snack_${Date.now().toString(36)}_${snackCounter}`;
}

// ── DraggableSnack ────────────────────────────────────────────────────────────

function DraggableSnack({
  snack, contentW, contentH, selected, onSelect, onMove,
}: {
  snack: PathSnack; contentW: number; contentH: number;
  selected: boolean; onSelect: () => void; onMove: (x: number, y: number) => void;
}) {
  const startPct = useRef({ x: snack.xPct, y: snack.yPct });
  const geo = useRef({ x: snack.xPct, y: snack.yPct, w: contentW, h: contentH });
  geo.current = { x: snack.xPct, y: snack.yPct, w: contentW, h: contentH };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        onSelect();
        startPct.current = { x: geo.current.x, y: geo.current.y };
      },
      onPanResponderMove: (_e, g) => {
        const w = geo.current.w || 1;
        const h = geo.current.h || 1;
        const nx = Math.max(0, Math.min(1, startPct.current.x + g.dx / w));
        const ny = Math.max(0, Math.min(1, startPct.current.y + g.dy / h));
        onMove(nx, ny);
      },
    }),
  ).current;

  const left = snack.xPct * contentW - SNACK_SIZE / 2;
  const top = snack.yPct * contentH - SNACK_SIZE / 2;

  return (
    <View style={[s.snack, selected && s.snackSelected, { left, top }]} {...responder.panHandlers}>
      {snack.image
        ? <Image source={{ uri: snack.image }} style={s.snackImage} resizeMode="cover" />
        : <View style={[s.snackImage, s.snackPlaceholder]}><Text style={s.snackPlaceholderText}>IMG</Text></View>
      }
    </View>
  );
}

// ── DraggableMissionNode ──────────────────────────────────────────────────────

function DraggableMissionNode({
  step, color, displaySeq, contentW, contentH, onMove, onDragEnd,
}: {
  step: MissionStep & { x_pct: number; y_pct: number };
  color: string;
  displaySeq: number;
  contentW: number;
  contentH: number;
  onMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const startPct = useRef({ x: step.x_pct, y: step.y_pct });
  const curPct   = useRef({ x: step.x_pct, y: step.y_pct });
  const geo      = useRef({ x: step.x_pct, y: step.y_pct, w: contentW, h: contentH });
  geo.current    = { x: step.x_pct, y: step.y_pct, w: contentW, h: contentH };
  const moved    = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        moved.current = false;
        startPct.current = { x: geo.current.x, y: geo.current.y };
        curPct.current   = { x: geo.current.x, y: geo.current.y };
      },
      onPanResponderMove: (_e, g) => {
        moved.current = true;
        const w = geo.current.w || 1;
        const h = geo.current.h || 1;
        const nx = Math.max(0, Math.min(1, startPct.current.x + g.dx / w));
        const ny = Math.max(0, Math.min(1, startPct.current.y + g.dy / h));
        curPct.current = { x: nx, y: ny };
        onMove(nx, ny);
      },
      onPanResponderRelease: () => {
        if (moved.current) {
          onDragEnd(curPct.current.x, curPct.current.y);
        }
      },
    }),
  ).current;

  const left = step.x_pct * contentW - NODE_SIZE / 2;
  const top  = step.y_pct * contentH - NODE_SIZE / 2;

  return (
    <View
      style={[s.missionNode, { left, top, backgroundColor: color, borderColor: '#fff' }]}
      {...responder.panHandlers}
    >
      <Text style={s.missionNodeSeq}>{displaySeq}</Text>
    </View>
  );
}

// ── DraggableRestaurant (always-on POI) ──────────────────────────────────────

interface MapRestaurant {
  id: number;
  name: string;
  status: string;
  x_pct: number | null;
  y_pct: number | null;
  scene_url: string | null;
}

function DraggableRestaurant({
  rest, contentW, contentH, onMove, onDragEnd,
}: {
  rest: MapRestaurant & { x_pct: number; y_pct: number };
  contentW: number; contentH: number;
  onMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const startPct = useRef({ x: rest.x_pct, y: rest.y_pct });
  const curPct   = useRef({ x: rest.x_pct, y: rest.y_pct });
  const geo      = useRef({ x: rest.x_pct, y: rest.y_pct, w: contentW, h: contentH });
  geo.current    = { x: rest.x_pct, y: rest.y_pct, w: contentW, h: contentH };
  const moved    = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        moved.current = false;
        startPct.current = { x: geo.current.x, y: geo.current.y };
        curPct.current   = { x: geo.current.x, y: geo.current.y };
      },
      onPanResponderMove: (_e, g) => {
        moved.current = true;
        const w = geo.current.w || 1;
        const h = geo.current.h || 1;
        const nx = Math.max(0, Math.min(1, startPct.current.x + g.dx / w));
        const ny = Math.max(0, Math.min(1, startPct.current.y + g.dy / h));
        curPct.current = { x: nx, y: ny };
        onMove(nx, ny);
      },
      onPanResponderRelease: () => {
        if (moved.current) onDragEnd(curPct.current.x, curPct.current.y);
      },
    }),
  ).current;

  const left = rest.x_pct * contentW - NODE_SIZE / 2;
  const top  = rest.y_pct * contentH - NODE_SIZE / 2;

  return (
    <View
      style={[s.missionNode, { left, top, backgroundColor: '#C9943D', borderColor: '#f0d9a8' }]}
      {...responder.panHandlers}
    >
      <Text style={s.missionNodeSeq}>🍴</Text>
    </View>
  );
}

// ── MenuItemPicker ────────────────────────────────────────────────────────────

function MenuItemPicker({
  visible, restaurants, onClose, onPick,
}: {
  visible: boolean; restaurants: Restaurant[];
  onClose: () => void; onPick: (r: Restaurant, item: Restaurant['menu'][number]) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Pick a snack from a restaurant</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {restaurants.length === 0 && <Text style={s.emptyText}>No restaurants available.</Text>}
            {restaurants.map((r) => (
              <View key={r.id} style={s.pickerRestaurant}>
                <Text style={s.pickerRestaurantName}>{r.name}</Text>
                <View style={s.pickerItemsRow}>
                  {(r.menu ?? []).map((item) => (
                    <TouchableOpacity key={item.id} style={s.pickerItem} onPress={() => onPick(r, item)} activeOpacity={0.8}>
                      {item.image
                        ? <Image source={{ uri: item.image }} style={s.pickerItemImage} resizeMode="cover" />
                        : <View style={[s.pickerItemImage, s.snackPlaceholder]}><Text style={s.snackPlaceholderText}>IMG</Text></View>
                      }
                      <Text style={s.pickerItemName} numberOfLines={2}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── AdventurePicker (links a snack to a mission) ──────────────────────────────

function AdventurePicker({
  visible, missions, selectedId, onClose, onPick,
}: {
  visible: boolean;
  missions: { id: number; title: string }[];
  selectedId?: number | null;
  onClose: () => void;
  onPick: (adv: { id: number; title: string } | null) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalCard, { maxWidth: 420 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Link snack to a mission</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[s.advOption, selectedId == null && s.advOptionActive]}
              onPress={() => onPick(null)} activeOpacity={0.8}
            >
              <Text style={s.advOptionText}>None — not tied to a mission</Text>
            </TouchableOpacity>
            {missions.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[s.advOption, selectedId === m.id && s.advOptionActive]}
                onPress={() => onPick(m)} activeOpacity={0.8}
              >
                <Text style={s.advOptionText}>{m.title}</Text>
              </TouchableOpacity>
            ))}
            {missions.length === 0 && <Text style={s.emptyText}>No missions yet.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── ColorPickerModal ──────────────────────────────────────────────────────────

function ColorPickerModal({
  visible, currentColor, onClose, onPick,
}: {
  visible: boolean; currentColor: string;
  onClose: () => void; onPick: (color: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalCard, { maxWidth: 340 }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Mission colour</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={s.colorGrid}>
            {MISSION_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[s.colorSwatch, { backgroundColor: c }, c === currentColor && s.colorSwatchActive]}
                onPress={() => onPick(c)}
                activeOpacity={0.8}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main PathMapTab ───────────────────────────────────────────────────────────

export default function PathMapTab() {
  // ── Snack state (existing) ─────────────────────────────────────────────────
  const [snacks,      setSnacks]      = useState<PathSnack[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [advPickerOpen, setAdvPickerOpen] = useState(false);
  const [uploading,   setUploading]   = useState(false);

  // ── Restaurant POIs (always-on map fixtures) ───────────────────────────────
  const [mapRestaurants, setMapRestaurants] = useState<MapRestaurant[]>([]);
  const [newRestName,    setNewRestName]    = useState('');
  const [restBusy,       setRestBusy]       = useState(false);

  // ── Mission layers ─────────────────────────────────────────────────────────
  const [missions,       setMissions]       = useState<MissionLayer[]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [savingStep,     setSavingStep]     = useState<number | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null);

  // Keep pending placement accessible from inside PanResponder closures.
  const pendingPlacementRef = useRef<PendingPlacement | null>(null);
  useEffect(() => { pendingPlacementRef.current = pendingPlacement; }, [pendingPlacement]);

  // Stable callback ref so the PanResponder (created once) can always call
  // the latest version of our tap handler.
  const onCanvasTapRef = useRef<((locX: number, locY: number) => void) | null>(null);

  // ── Canvas geometry ────────────────────────────────────────────────────────
  const [zoom,  setZoom]  = useState(1);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [pan,   setPan]   = useState({ x: 0, y: 0 });
  const panRef      = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const movedRef    = useRef(false);
  const tapStartRef = useRef({ x: 0, y: 0 });
  const geoRef      = useRef({ contentW: 0, contentH: 0, frameW: 0, frameH: 0, zoom: 1 });

  const mapPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: (e) => {
        panStartRef.current = panRef.current;
        movedRef.current    = false;
        tapStartRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      },
      onPanResponderMove: (_e, g) => {
        const { contentW, contentH, frameW, frameH } = geoRef.current;
        movedRef.current = true;
        const minX = Math.min(0, frameW - contentW);
        const minY = Math.min(0, frameH - contentH);
        const nx = Math.max(minX, Math.min(0, panStartRef.current.x + g.dx));
        const ny = Math.max(minY, Math.min(0, panStartRef.current.y + g.dy));
        panRef.current = { x: nx, y: ny };
        setPan({ x: nx, y: ny });
      },
      onPanResponderRelease: () => {
        if (!movedRef.current) {
          onCanvasTapRef.current?.(tapStartRef.current.x, tapStartRef.current.y);
        }
      },
    }),
  ).current;

  // ── Fit geometry ───────────────────────────────────────────────────────────
  const fit = useMemo(() => {
    const padX = spacing['3xl'] * 2;
    const padY = spacing.xl * 2;
    const availW = Math.max(0, frame.width - padX);
    const availH = Math.max(0, frame.height - BANNER_HEIGHT - padY - 24);
    if (availW <= 0 || availH <= 0) return { baseW: 0, baseH: 0, frameH: 0 };
    const baseW = Math.min(availW, availH * ARTBOARD_ASPECT, 1100); // wide map → larger placement canvas
    const baseH = baseW / ARTBOARD_ASPECT;
    return { baseW, baseH, frameH: baseH };
  }, [frame.width, frame.height]);

  const contentW = fit.baseW * zoom;
  const contentH = fit.baseH * zoom;
  const frameW   = fit.baseW;
  const frameH   = fit.frameH;

  geoRef.current = { contentW, contentH, frameW, frameH, zoom };
  useEffect(() => { panRef.current = pan; }, [pan]);

  useEffect(() => {
    const minX = Math.min(0, frameW - contentW);
    const minY = Math.min(0, frameH - contentH);
    setPan((p) => {
      const nx = Math.max(minX, Math.min(0, p.x));
      const ny = Math.max(minY, Math.min(0, p.y));
      return nx === p.x && ny === p.y ? p : { x: nx, y: ny };
    });
  }, [zoom, frameW, frameH, contentW, contentH]);

  // Canvas tap handler — always reads latest state via closure over current render.
  onCanvasTapRef.current = (locX: number, locY: number) => {
    const pp = pendingPlacementRef.current;
    if (pp) {
      const xPct = Math.max(0, Math.min(1, (locX - panRef.current.x) / (geoRef.current.contentW || 1)));
      const yPct = Math.max(0, Math.min(1, (locY - panRef.current.y) / (geoRef.current.contentH || 1)));
      doPlaceStep(pp, xPct, yPct);
    } else {
      setSelectedId(null);
    }
  };

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [map, allRestaurants, advList, restRows] = await Promise.all([
          Repos.pathMap.get(),
          Repos.restaurants.list().catch(() => [] as Restaurant[]),
          api.get('/admin/adventures').catch(() => []),
          api.getAdminRestaurants().catch(() => ({ restaurants: [] })),
        ]);
        setSnacks(map.snacks ?? []);
        setRestaurants(allRestaurants);
        setMapRestaurants(Array.isArray(restRows?.restaurants) ? restRows.restaurants : []);
        const rawList = Array.isArray(advList) ? advList : [];
        setMissions(rawList.map((a: any) => ({
          id: a.id,
          title: a.title,
          color: a.color ?? MISSION_COLORS[0],
          status: a.status ?? 'draft',
          expanded: false,
          loading: false,
          steps: [],
        })));
      } catch {
        showToast('Could not load the path map', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Snack operations ───────────────────────────────────────────────────────
  const selected = useMemo(() => snacks.find((sn) => sn.id === selectedId) ?? null, [snacks, selectedId]);

  const moveSnack = useCallback((id: string, xPct: number, yPct: number) => {
    setSnacks((prev) => prev.map((sn) => sn.id === id ? { ...sn, xPct, yPct } : sn));
    setDirty(true);
  }, []);

  const patchSelected = (patch: Partial<PathSnack>) => {
    if (!selected) return;
    setSnacks((prev) => prev.map((sn) => sn.id === selected.id ? { ...sn, ...patch } : sn));
    setDirty(true);
  };

  const addUploadSnack = async () => {
    const picked = await pickImageForUpload();
    if (!picked) return;
    setUploading(true);
    try {
      const { url } = await api.uploadPathMapImage(picked);
      const snack: PathSnack = { id: makeId(), image: url, source: 'upload', xPct: 0.5, yPct: 0.5 };
      setSnacks((prev) => [...prev, snack]);
      setSelectedId(snack.id);
      setDirty(true);
    } catch (e: any) {
      showToast(e?.message || 'Could not upload that image', 'error');
    } finally {
      setUploading(false);
    }
  };

  const addMenuSnack = (restaurant: Restaurant, item: Restaurant['menu'][number]) => {
    const snack: PathSnack = {
      id: makeId(), label: item.name, image: item.image,
      source: 'menu', restaurantId: restaurant.id, menuItemId: item.id,
      xPct: 0.5, yPct: 0.5,
    };
    setSnacks((prev) => [...prev, snack]);
    setSelectedId(snack.id);
    setDirty(true);
    setPickerOpen(false);
  };

  const removeSelected = () => {
    if (!selected) return;
    setSnacks((prev) => prev.filter((sn) => sn.id !== selected.id));
    setSelectedId(null);
    setDirty(true);
  };

  const savePathMap = async () => {
    setSaving(true);
    try {
      const saved = await Repos.pathMap.save({ snacks, updatedAt: '' });
      setSnacks(saved.snacks);
      setDirty(false);
      showToast('Path map saved', 'success');
    } catch {
      showToast('Could not save the path map', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Mission step operations ────────────────────────────────────────────────
  const toggleMission = async (missionId: number) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    const willExpand = !mission.expanded;
    setMissions((prev) => prev.map((m) =>
      m.id === missionId ? { ...m, expanded: willExpand } : m,
    ));
    if (willExpand && mission.steps.length === 0) {
      await loadMissionSteps(missionId);
    }
  };

  const loadMissionSteps = async (missionId: number) => {
    setMissions((prev) => prev.map((m) => m.id === missionId ? { ...m, loading: true } : m));
    try {
      const data = await api.get(`/admin/adventures/${missionId}`);
      const steps: MissionStep[] = (data.steps ?? []).map((s: any) => ({
        id: s.id,
        sequence: s.sequence,
        title: s.title,
        description: s.description ?? null,
        x_pct: s.x_pct ?? null,
        y_pct: s.y_pct ?? null,
      }));
      setMissions((prev) => prev.map((m) =>
        m.id === missionId ? { ...m, steps, loading: false } : m,
      ));
    } catch {
      showToast('Could not load mission steps', 'error');
      setMissions((prev) => prev.map((m) =>
        m.id === missionId ? { ...m, loading: false } : m,
      ));
    }
  };

  const moveMissionStep = useCallback((adventureId: number, stepId: number, xPct: number, yPct: number) => {
    setMissions((prev) => prev.map((m) => {
      if (m.id !== adventureId) return m;
      return { ...m, steps: m.steps.map((st) => st.id === stepId ? { ...st, x_pct: xPct, y_pct: yPct } : st) };
    }));
  }, []);

  const saveMissionStepPosition = useCallback(async (adventureId: number, stepId: number, xPct: number, yPct: number) => {
    setSavingStep(stepId);
    try {
      await api.patch(`/admin/adventures/${adventureId}/steps/${stepId}`, { x_pct: xPct, y_pct: yPct });
    } catch (e: any) {
      showToast(e?.message || 'Could not save step position', 'error');
      // Roll back to null so it shows as unplaced again.
      setMissions((prev) => prev.map((m) => {
        if (m.id !== adventureId) return m;
        return { ...m, steps: m.steps.map((st) => st.id === stepId ? { ...st, x_pct: null, y_pct: null } : st) };
      }));
    } finally {
      setSavingStep(null);
    }
  }, []);

  const doPlaceStep = async (pp: PendingPlacement, xPct: number, yPct: number) => {
    setPendingPlacement(null);
    // Optimistic update.
    setMissions((prev) => prev.map((m) => {
      if (m.id !== pp.adventureId) return m;
      return { ...m, steps: m.steps.map((st) => st.id === pp.step.id ? { ...st, x_pct: xPct, y_pct: yPct } : st) };
    }));
    await saveMissionStepPosition(pp.adventureId, pp.step.id, xPct, yPct);
  };

  const clearMissionStep = async (adventureId: number, stepId: number) => {
    setMissions((prev) => prev.map((m) => {
      if (m.id !== adventureId) return m;
      return { ...m, steps: m.steps.map((st) => st.id === stepId ? { ...st, x_pct: null, y_pct: null } : st) };
    }));
    try {
      await api.patch(`/admin/adventures/${adventureId}/steps/${stepId}`, { x_pct: null, y_pct: null });
    } catch (e: any) {
      showToast(e?.message || 'Could not clear step position', 'error');
    }
  };

  const updateMissionColor = async (missionId: number, color: string) => {
    setMissions((prev) => prev.map((m) => m.id === missionId ? { ...m, color } : m));
    setColorPickerFor(null);
    try {
      await api.patch(`/admin/adventures/${missionId}`, { color });
    } catch (e: any) {
      showToast(e?.message || 'Could not save colour', 'error');
    }
  };

  const applyZoom = (next: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));
  };

  // ── Restaurant POI operations ──────────────────────────────────────────────
  const reloadRestaurants = useCallback(async () => {
    try {
      const data = await api.getAdminRestaurants();
      setMapRestaurants(Array.isArray(data?.restaurants) ? data.restaurants : []);
    } catch { showToast('Could not load restaurants', 'error'); }
  }, []);

  const addRestaurant = useCallback(async () => {
    const name = newRestName.trim();
    if (!name) return;
    setRestBusy(true);
    try {
      await api.createRestaurant({ name });
      setNewRestName('');
      await reloadRestaurants();
      showToast(`Added ${name}`, 'success');
    } catch { showToast('Could not add restaurant', 'error'); }
    finally { setRestBusy(false); }
  }, [newRestName, reloadRestaurants]);

  const placeRestaurant = useCallback(async (r: MapRestaurant) => {
    // Drop at the centre; admin drags it into place from there.
    setMapRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, x_pct: 0.5, y_pct: 0.5 } : x));
    try { await api.updateRestaurant(r.id, { x_pct: 0.5, y_pct: 0.5 }); }
    catch { showToast('Could not place restaurant', 'error'); reloadRestaurants(); }
  }, [reloadRestaurants]);

  const unplaceRestaurant = useCallback(async (r: MapRestaurant) => {
    setMapRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, x_pct: null, y_pct: null } : x));
    try { await api.updateRestaurant(r.id, { x_pct: null, y_pct: null }); }
    catch { showToast('Could not remove restaurant', 'error'); reloadRestaurants(); }
  }, [reloadRestaurants]);

  const moveRestaurant = useCallback((id: number, x: number, y: number) => {
    setMapRestaurants((prev) => prev.map((r) => r.id === id ? { ...r, x_pct: x, y_pct: y } : r));
  }, []);

  const saveRestaurantPosition = useCallback(async (id: number, x: number, y: number) => {
    try { await api.updateRestaurant(id, { x_pct: x, y_pct: y }); }
    catch { showToast('Could not save position', 'error'); }
  }, []);

  const uploadRestaurantSceneFor = useCallback(async (r: MapRestaurant) => {
    const file = await pickImageForUpload();
    if (!file) return;
    setRestBusy(true);
    try {
      const data = await api.uploadRestaurantScene(r.id, file as any);
      const url = data?.url ?? data?.restaurant?.scene_url ?? null;
      setMapRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, scene_url: url } : x));
      showToast('Close-up uploaded', 'success');
    } catch { showToast('Upload failed', 'error'); }
    finally { setRestBusy(false); }
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const adventureLabel = selected?.adventureId != null ? selected.adventureTitle ?? 'Mission' : 'None';

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={colors.accent.gold} />
        <Text style={s.loadingText}>Loading path map…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>

      {/* ── Canvas column ───────────────────────────────────────────────── */}
      <View
        style={s.mapColumn}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (Math.abs(width - frame.width) > 0.5 || Math.abs(height - frame.height) > 0.5)
            setFrame({ width, height });
        }}
      >
        <Image source={PATH_OF_POWER_IMAGE} style={s.banner} resizeMode="contain" />

        {fit.baseW > 0 && (
          <View style={{ position: 'relative' }}>
            <View style={[s.mapFrame, { width: frameW, height: frameH }, pendingPlacement && s.mapFramePlacing]}
              {...mapPan.panHandlers}
            >
              <View style={{ width: contentW, height: contentH, transform: [{ translateX: pan.x }, { translateY: pan.y }] }}>
                <ImageBackground source={ARTBOARD_IMAGE} style={{ width: contentW, height: contentH }} resizeMode="cover">

                  {/* Path snacks */}
                  {snacks.map((sn) => (
                    <DraggableSnack
                      key={sn.id} snack={sn} contentW={contentW} contentH={contentH}
                      selected={sn.id === selectedId}
                      onSelect={() => { setPendingPlacement(null); setSelectedId(sn.id); }}
                      onMove={(x, y) => moveSnack(sn.id, x, y)}
                    />
                  ))}

                  {/* Mission step nodes (placed) */}
                  {missions.flatMap((m) => {
                    const nums = stepDisplayNumbers(m.steps);
                    return m.steps
                      .filter((st): st is MissionStep & { x_pct: number; y_pct: number } =>
                        st.x_pct != null && st.y_pct != null,
                      )
                      .map((st) => (
                        <DraggableMissionNode
                          key={`m${m.id}-s${st.id}`}
                          step={st}
                          color={m.color}
                          displaySeq={nums.get(st.id) ?? st.sequence}
                          contentW={contentW}
                          contentH={contentH}
                          onMove={(x, y) => moveMissionStep(m.id, st.id, x, y)}
                          onDragEnd={(x, y) => saveMissionStepPosition(m.id, st.id, x, y)}
                        />
                      ));
                  })}

                  {/* Restaurant POIs (always-on) — gold fork nodes */}
                  {mapRestaurants
                    .filter((r): r is MapRestaurant & { x_pct: number; y_pct: number } => r.x_pct != null && r.y_pct != null)
                    .map((r) => (
                      <DraggableRestaurant
                        key={`rest-${r.id}`}
                        rest={r}
                        contentW={contentW}
                        contentH={contentH}
                        onMove={(x, y) => moveRestaurant(r.id, x, y)}
                        onDragEnd={(x, y) => saveRestaurantPosition(r.id, x, y)}
                      />
                    ))}

                  {/* Placement crosshair overlay */}
                  {pendingPlacement && (
                    <View style={s.placementOverlay} pointerEvents="none">
                      <Text style={[s.placementCursor, { color: pendingPlacement.color }]}>✕</Text>
                    </View>
                  )}

                </ImageBackground>
              </View>
            </View>

            {/* Zoom controls */}
            <View style={s.zoomControls}>
              <TouchableOpacity style={s.zoomBtn} onPress={() => applyZoom(zoom * 1.25)} activeOpacity={0.8}>
                <Text style={s.zoomBtnText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.zoomBtn} onPress={() => applyZoom(zoom / 1.25)} activeOpacity={0.8}>
                <Text style={s.zoomBtnText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.zoomBtn} onPress={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} activeOpacity={0.8}>
                <Text style={s.zoomFitText}>Top</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <View style={s.menu}>
        <View style={s.menuHeader}>
          <Text style={s.title}>Path to Power Map</Text>
          <Text style={s.subtitle}>
            Place snacks and mission steps on the parchment. Each kid sees the snacks always;
            their mission's steps appear in that mission's colour when they're enrolled.
          </Text>
        </View>

        {/* Placement mode banner */}
        {pendingPlacement && (
          <View style={[s.placementBanner, { borderColor: pendingPlacement.color }]}>
            <View style={[s.placementDot, { backgroundColor: pendingPlacement.color }]} />
            <Text style={s.placementBannerText} numberOfLines={2}>
              Tap the map to place "{pendingPlacement.step.title}"
            </Text>
            <TouchableOpacity onPress={() => setPendingPlacement(null)} activeOpacity={0.7}>
              <Text style={s.placementCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add snack buttons */}
        {!pendingPlacement && (
          <View style={s.addRow}>
            <TouchableOpacity style={s.addBtn} onPress={addUploadSnack} activeOpacity={0.85} disabled={uploading}>
              <Text style={s.addBtnText}>{uploading ? 'Uploading…' : 'Upload image'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, s.addBtnSecondary]} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
              <Text style={s.addBtnText}>From menu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scrollable sections */}
        <ScrollView style={s.menuScroll} showsVerticalScrollIndicator={false}>

          {/* ── PATH SNACKS ─────────────────────────────────────────────── */}
          {selected ? (
            // Selected snack editor
            <View>
              <View style={s.editorHead}>
                <Text style={s.sectionLabel}>Selected snack</Text>
                <TouchableOpacity onPress={() => setSelectedId(null)} activeOpacity={0.7}>
                  <Text style={s.backLink}>Back to list</Text>
                </TouchableOpacity>
              </View>
              <View style={s.selectedPreview}>
                {selected.image
                  ? <Image source={{ uri: selected.image }} style={s.selectedImage} resizeMode="cover" />
                  : <View style={[s.selectedImage, s.snackPlaceholder]}><Text style={s.snackPlaceholderText}>IMG</Text></View>
                }
                <Text style={s.selectedMeta}>{selected.source === 'menu' ? 'From restaurant menu' : 'Uploaded image'}</Text>
              </View>
              <Text style={s.fieldLabel}>Label (optional)</Text>
              <TextInput
                style={s.input}
                value={selected.label ?? ''}
                onChangeText={(t) => patchSelected({ label: t })}
                placeholder="e.g. Sour Worms"
                placeholderTextColor={colors.text.placeholder}
              />
              <Text style={s.fieldLabel}>Mission</Text>
              <TouchableOpacity style={s.select} onPress={() => setAdvPickerOpen(true)} activeOpacity={0.8}>
                <Text style={s.selectText} numberOfLines={1}>{adventureLabel}</Text>
                <Text style={s.selectChevron}>▾</Text>
              </TouchableOpacity>
              <Text style={s.fieldLabel}>Reward (shown when a kid taps it)</Text>
              <TextInput
                style={[s.input, s.inputMultiline]}
                value={selected.reward ?? ''}
                onChangeText={(t) => patchSelected({ reward: t })}
                placeholder="What they'd get out of starting this mission"
                placeholderTextColor={colors.text.placeholder}
                multiline
              />
              <TouchableOpacity style={s.removeBtn} onPress={removeSelected} activeOpacity={0.85}>
                <Text style={s.removeBtnText}>Remove snack</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Snack list
            <View style={s.section}>
              <Text style={s.sectionLabel}>Path Snacks ({snacks.length})</Text>
              {snacks.length === 0
                ? <Text style={s.hint}>No snacks yet. Add one above, then drag it into place on the map.</Text>
                : snacks.map((sn) => (
                    <TouchableOpacity key={sn.id} style={s.listRow} onPress={() => setSelectedId(sn.id)} activeOpacity={0.8}>
                      {sn.image
                        ? <Image source={{ uri: sn.image }} style={s.listThumb} resizeMode="cover" />
                        : <View style={[s.listThumb, s.snackPlaceholder]}><Text style={s.snackPlaceholderText}>IMG</Text></View>
                      }
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.listTitle} numberOfLines={1}>{sn.label || (sn.source === 'menu' ? 'Menu snack' : 'Snack')}</Text>
                        <Text style={s.listMeta} numberOfLines={1}>{sn.adventureId != null ? sn.adventureTitle ?? 'Mission' : 'No mission'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
              }
            </View>
          )}

          {/* ── MISSION STEPS ───────────────────────────────────────────── */}
          {!selected && (
            <View style={[s.section, { marginTop: spacing.xl }]}>
              <Text style={s.sectionLabel}>Mission Steps</Text>
              {missions.length === 0 && <Text style={s.hint}>No missions yet. Create one in the Missions tab first.</Text>}
              {missions.map((m) => (
                <MissionRow
                  key={m.id}
                  mission={m}
                  savingStep={savingStep}
                  pendingPlacement={pendingPlacement}
                  onToggle={() => toggleMission(m.id)}
                  onColorPick={() => setColorPickerFor(m.id)}
                  onPlaceStep={(step) => {
                    setSelectedId(null);
                    setPendingPlacement({ adventureId: m.id, step, color: m.color });
                  }}
                  onCancelPlacement={() => setPendingPlacement(null)}
                  onClearStep={(step) => clearMissionStep(m.id, step.id)}
                />
              ))}
            </View>
          )}

          {/* ── RESTAURANTS (always-on POIs) ────────────────────────────── */}
          {!selected && (
            <View style={[s.section, { marginTop: spacing.xl }]}>
              <Text style={s.sectionLabel}>Restaurants ({mapRestaurants.length})</Text>
              <Text style={s.hint}>Always on the map unless closed. Add one, place it, drag to position, and give it a close-up.</Text>
              <View style={s.addRow}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={newRestName}
                  onChangeText={setNewRestName}
                  placeholder="New restaurant name"
                  placeholderTextColor={colors.text.placeholder}
                  onSubmitEditing={addRestaurant}
                />
                <TouchableOpacity
                  style={s.addBtn}
                  onPress={addRestaurant}
                  activeOpacity={0.85}
                  disabled={restBusy || !newRestName.trim()}
                >
                  <Text style={s.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {mapRestaurants.length === 0 && (
                <Text style={s.hint}>No restaurants yet. Add one above.</Text>
              )}
              {mapRestaurants.map((r) => {
                const placed = r.x_pct != null && r.y_pct != null;
                return (
                  <View key={r.id} style={s.listRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.listTitle} numberOfLines={1}>{r.name}</Text>
                      <Text style={s.listMeta} numberOfLines={1}>
                        {placed ? 'On map' : 'Not placed'} · {r.scene_url ? 'Close-up ✓' : 'No close-up'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => uploadRestaurantSceneFor(r)} activeOpacity={0.7} style={{ paddingHorizontal: spacing.sm }} disabled={restBusy}>
                      <Text style={s.backLink}>{r.scene_url ? 'Replace' : 'Close-up'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => placed ? unplaceRestaurant(r) : placeRestaurant(r)} activeOpacity={0.7} style={{ paddingHorizontal: spacing.sm }}>
                      <Text style={s.backLink}>{placed ? 'Remove' : 'Place'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[s.saveBtn, (!dirty || saving) && s.saveBtnDisabled]}
          onPress={savePathMap}
          disabled={!dirty || saving}
          activeOpacity={0.85}
        >
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : dirty ? 'Save map' : 'Saved'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <MenuItemPicker
        visible={pickerOpen} restaurants={restaurants}
        onClose={() => setPickerOpen(false)} onPick={addMenuSnack}
      />
      <AdventurePicker
        visible={advPickerOpen}
        missions={missions.map((m) => ({ id: m.id, title: m.title }))}
        selectedId={selected?.adventureId}
        onClose={() => setAdvPickerOpen(false)}
        onPick={(adv) => {
          patchSelected({ adventureId: adv?.id ?? null, adventureTitle: adv?.title });
          setAdvPickerOpen(false);
        }}
      />
      <ColorPickerModal
        visible={colorPickerFor != null}
        currentColor={missions.find((m) => m.id === colorPickerFor)?.color ?? MISSION_COLORS[0]}
        onClose={() => setColorPickerFor(null)}
        onPick={(color) => { if (colorPickerFor != null) updateMissionColor(colorPickerFor, color); }}
      />
    </View>
  );
}

// ── MissionRow ────────────────────────────────────────────────────────────────

function MissionRow({
  mission, savingStep, pendingPlacement,
  onToggle, onColorPick, onPlaceStep, onCancelPlacement, onClearStep,
}: {
  mission: MissionLayer;
  savingStep: number | null;
  pendingPlacement: PendingPlacement | null;
  onToggle: () => void;
  onColorPick: () => void;
  onPlaceStep: (step: MissionStep) => void;
  onCancelPlacement: () => void;
  onClearStep: (step: MissionStep) => void;
}) {
  const placed   = mission.steps.filter((st) => st.x_pct != null && st.y_pct != null);
  const unplaced = mission.steps.filter((st) => st.x_pct == null || st.y_pct == null);
  const stepNums = stepDisplayNumbers(mission.steps);
  const isThisMissionPending = pendingPlacement?.adventureId === mission.id;

  return (
    <View style={s.missionRowWrap}>
      {/* Mission header */}
      <TouchableOpacity style={s.missionHeader} onPress={onToggle} activeOpacity={0.8}>
        {/* Color swatch — tap to change */}
        <TouchableOpacity
          style={[s.colorDot, { backgroundColor: mission.color }]}
          onPress={(e) => { e.stopPropagation(); onColorPick(); }}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.missionTitle} numberOfLines={1}>{mission.title}</Text>
          {!mission.expanded && mission.steps.length > 0 && (
            <Text style={s.missionMeta}>{placed.length}/{mission.steps.length} placed</Text>
          )}
        </View>
        <Text style={s.missionChevron}>{mission.expanded ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {/* Expanded steps */}
      {mission.expanded && (
        <View style={s.missionStepsWrap}>
          {mission.loading && (
            <View style={s.missionLoadingRow}>
              <ActivityIndicator size="small" color={mission.color} />
              <Text style={s.missionLoadingText}>Loading steps…</Text>
            </View>
          )}

          {!mission.loading && mission.steps.length === 0 && (
            <Text style={s.hint}>No steps yet. Add steps in the Missions tab.</Text>
          )}

          {/* Placed steps */}
          {placed.length > 0 && (
            <View>
              <Text style={s.stepGroupLabel}>On map ({placed.length})</Text>
              {placed.map((st) => (
                <View key={st.id} style={s.stepRow}>
                  <View style={[s.stepSeqDot, { backgroundColor: mission.color }]}>
                    <Text style={s.stepSeqText}>{stepNums.get(st.id) ?? st.sequence}</Text>
                  </View>
                  <Text style={[s.stepTitle, { flex: 1 }]} numberOfLines={1}>{st.title}</Text>
                  {savingStep === st.id
                    ? <ActivityIndicator size="small" color={mission.color} />
                    : (
                      <TouchableOpacity onPress={() => onClearStep(st)} activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={s.stepRemove}>✕</Text>
                      </TouchableOpacity>
                    )
                  }
                </View>
              ))}
            </View>
          )}

          {/* Unplaced steps tray */}
          {unplaced.length > 0 && (
            <View>
              <Text style={s.stepGroupLabel}>Unplaced ({unplaced.length})</Text>
              {unplaced.map((st) => {
                const isPlacing = isThisMissionPending && pendingPlacement?.step.id === st.id;
                return (
                  <TouchableOpacity
                    key={st.id}
                    style={[s.unplacedPill, isPlacing && { borderColor: mission.color, backgroundColor: `${mission.color}22` }]}
                    onPress={() => isPlacing ? onCancelPlacement() : onPlaceStep(st)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.stepSeqDot, { backgroundColor: isPlacing ? mission.color : colors.surface.raised }]}>
                      <Text style={[s.stepSeqText, !isPlacing && { color: colors.text.muted }]}>{stepNums.get(st.id) ?? st.sequence}</Text>
                    </View>
                    <Text style={[s.stepTitle, { flex: 1 }]} numberOfLines={1}>{st.title}</Text>
                    <Text style={[s.placePillBtn, isPlacing && { color: mission.color }]}>
                      {isPlacing ? 'Cancel' : 'Place'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface.base },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingText: { color: colors.text.muted, fontSize: ty.size.md },

  // Map column
  mapColumn: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-start',
    paddingHorizontal: spacing['3xl'], paddingVertical: spacing.xl,
  },
  banner: { width: '70%', height: BANNER_HEIGHT, maxWidth: 360, marginBottom: spacing.md },
  mapFrame: {
    borderRadius: radii.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border.muted, backgroundColor: '#000',
  },
  mapFramePlacing: { borderColor: colors.accent.gold, borderWidth: 2 },

  snack: { position: 'absolute', width: SNACK_SIZE, alignItems: 'center' },
  snackSelected: {
    shadowColor: colors.accent.gold, shadowOpacity: 0.9,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  snackImage: {
    width: SNACK_SIZE, height: SNACK_SIZE,
    borderRadius: radii.sm, borderWidth: 2, borderColor: '#000',
    backgroundColor: colors.surface.inset,
  },
  snackPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  snackPlaceholderText: { color: colors.text.ghost, fontSize: ty.size.xs, fontWeight: ty.weight.bold },

  missionNode: {
    position: 'absolute', width: NODE_SIZE, height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', zIndex: 15,
  },
  missionNodeSeq: { color: '#fff', fontSize: 11, fontWeight: '700' },

  placementOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', zIndex: 50,
  },
  placementCursor: { fontSize: 32, fontWeight: '700', opacity: 0.4 },

  zoomControls: { position: 'absolute', right: spacing.md, top: spacing.md, gap: spacing.sm },
  zoomBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface.raised, borderWidth: 1, borderColor: colors.border.strong,
    justifyContent: 'center', alignItems: 'center',
  },
  zoomBtnText: { color: colors.accent.gold, fontSize: 20, fontWeight: ty.weight.regular, lineHeight: 22 },
  zoomFitText: { color: colors.accent.gold, fontSize: ty.size.xs, fontWeight: ty.weight.semi },

  // Right panel
  menu: {
    width: 320, borderLeftWidth: 1, borderLeftColor: colors.border.subtle,
    backgroundColor: colors.surface.sunken, padding: spacing.xl,
  },
  menuHeader: { marginBottom: spacing.lg, marginTop: spacing.sm },
  title: { color: colors.text.primary, fontSize: ty.size.xl, fontWeight: ty.weight.bold },
  subtitle: { color: colors.text.dim, fontSize: ty.size.sm, marginTop: spacing.xs },

  placementBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface.raised,
    borderWidth: 1, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  placementDot: { width: 10, height: 10, borderRadius: 5 },
  placementBannerText: { flex: 1, color: colors.text.primary, fontSize: ty.size.sm },
  placementCancel: { color: colors.accent.gold, fontSize: ty.size.sm, fontWeight: ty.weight.semi },

  addRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  addBtn: {
    flex: 1, backgroundColor: colors.surface.raised,
    borderWidth: 1, borderColor: colors.accent.goldBorderSoft,
    paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center',
  },
  addBtnSecondary: { borderColor: colors.border.muted },
  addBtnText: { color: colors.text.primary, fontSize: ty.size.md, fontWeight: ty.weight.semi },

  menuScroll: { flex: 1 },

  section: { marginBottom: spacing.sm },
  sectionLabel: {
    color: colors.text.subtle, fontSize: ty.size.xs, fontWeight: ty.weight.semi,
    textTransform: 'uppercase', letterSpacing: ty.tracking.eyebrow, marginBottom: spacing.sm,
  },
  editorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backLink: { color: colors.accent.gold, fontSize: ty.size.sm, fontWeight: ty.weight.semi },
  selectedPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  selectedImage: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.surface.inset },
  selectedMeta: { color: colors.text.muted, fontSize: ty.size.sm },
  fieldLabel: { color: colors.text.subtle, fontSize: ty.size.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface.inset, borderWidth: 1, borderColor: colors.border.input,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text.primary, fontSize: ty.size.base, marginBottom: spacing.md,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface.inset, borderWidth: 1, borderColor: colors.border.input,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  selectText: { color: colors.text.primary, fontSize: ty.size.base, flex: 1 },
  selectChevron: { color: colors.text.muted, fontSize: ty.size.md, marginLeft: spacing.sm },
  removeBtn: {
    borderWidth: 1, borderColor: colors.status.dangerFg, borderRadius: radii.md,
    paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm,
  },
  removeBtnText: { color: colors.status.dangerFg, fontSize: ty.size.md, fontWeight: ty.weight.semi },
  hint: { color: colors.text.dim, fontSize: ty.size.sm },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  listThumb: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.surface.inset },
  listTitle: { color: colors.text.primary, fontSize: ty.size.md, fontWeight: ty.weight.medium },
  listMeta: { color: colors.text.muted, fontSize: ty.size.xs, marginTop: 1 },

  saveBtn: {
    backgroundColor: colors.accent.gold, paddingVertical: spacing.md,
    borderRadius: radii.md, alignItems: 'center', marginTop: spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#1a1206', fontSize: ty.size.md, fontWeight: ty.weight.bold },

  // Mission rows
  missionRowWrap: {
    borderWidth: 1, borderColor: colors.border.subtle,
    borderRadius: radii.md, marginBottom: spacing.sm, overflow: 'hidden',
  },
  missionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surface.raised,
  },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  missionTitle: { color: colors.text.primary, fontSize: ty.size.md, fontWeight: ty.weight.medium },
  missionMeta: { color: colors.text.dim, fontSize: ty.size.xs, marginTop: 1 },
  missionChevron: { color: colors.text.muted, fontSize: ty.size.sm },

  missionStepsWrap: { padding: spacing.md, backgroundColor: colors.surface.base },
  missionLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  missionLoadingText: { color: colors.text.dim, fontSize: ty.size.sm },

  stepGroupLabel: {
    color: colors.text.ghost, fontSize: 10, fontWeight: ty.weight.semi,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs, marginTop: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stepSeqDot: {
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  stepSeqText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  stepTitle: { color: colors.text.secondary, fontSize: ty.size.sm },
  stepRemove: { color: colors.text.ghost, fontSize: ty.size.md, paddingHorizontal: spacing.xs },

  unplacedPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border.subtle, borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  placePillBtn: { color: colors.accent.gold, fontSize: ty.size.xs, fontWeight: ty.weight.semi },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: colors.overlay.backdrop,
    justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  modalCard: {
    width: '100%', maxWidth: 560,
    backgroundColor: colors.surface.overlay, borderRadius: radii.xl,
    borderWidth: 1, borderColor: colors.border.muted, padding: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { color: colors.text.primary, fontSize: ty.size.lg, fontWeight: ty.weight.bold },
  modalClose: { color: colors.accent.gold, fontSize: ty.size.md, fontWeight: ty.weight.semi },
  emptyText: { color: colors.text.dim, fontSize: ty.size.md },

  pickerRestaurant: { marginBottom: spacing.xl },
  pickerRestaurantName: { color: colors.text.secondary, fontSize: ty.size.md, fontWeight: ty.weight.semi, marginBottom: spacing.sm },
  pickerItemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pickerItem: { width: 80, alignItems: 'center' },
  pickerItemImage: { width: 80, height: 60, borderRadius: radii.sm, backgroundColor: colors.surface.inset },
  pickerItemName: { color: colors.text.muted, fontSize: ty.size.xs, textAlign: 'center', marginTop: spacing.xs },

  advOption: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border.subtle, marginBottom: spacing.sm,
  },
  advOptionActive: { borderColor: colors.accent.gold, backgroundColor: colors.accent.goldWash },
  advOptionText: { color: colors.text.primary, fontSize: ty.size.base },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.sm },
  colorSwatch: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: 'transparent',
  },
  colorSwatchActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
});
