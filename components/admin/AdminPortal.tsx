import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// react-dom is required lazily inside AssetPreviewModal's useEffect (web only).
import api from '../../src/api/client';
import { resolveAssetUrl } from '../../src/api/config';
import { Repos } from '../../src/usecases/repos';
import { showToast } from '../common/Toast';
import AdminTopBar, { BreadcrumbItem } from './ui/AdminTopBar';
import PathMapTab from './PathMapTab';
import { buildInfo, colors, layout, radii, spacing, type as ty } from './ui/tokens';
import DriversTab from './DriversTab';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A "transmission" — a narrative-asset record (video / audio / image) that
 * gets delivered to kids as part of an adventure. The admin uploads these
 * in the Transmissions tab and attaches them to individual steps.
 *
 * ## Design decisions locked in by Slice 2 of the admin-streamline plan
 *
 * These three fields are NOT just storage; they carry semantic load that
 * the rest of the system (especially the future `<SendComposer>` and the
 * step-attach picker) is required to honour:
 *
 * ### `send_at` — availability gate, not a delivery trigger
 *
 * - `null` means the transmission is available immediately upon upload —
 *   the existing step-arrival model alone gates delivery.
 * - A non-null ISO timestamp means the transmission is NOT eligible for
 *   delivery until that moment passes.
 *
 * Even after `send_at` passes, the step-arrival model still drives the
 * actual moment a kid sees the transmission (i.e. when they reach the
 * attached step). We deliberately do NOT introduce time-based broadcast
 * here — `send_at` only filters whether the transmission is in-the-pool
 * when a step is reached.
 *
 * ### `adventures` — scoping constraint, not a tag
 *
 * A kid will only ever receive a transmission if ALL of:
 *   (a) their active adventure is in this transmission's `adventures` set, and
 *   (b) `send_at` is `null` or already in the past, and
 *   (c) the transmission has been attached to a step they have reached.
 *
 * This is what enables story-divergence: the same step on different
 * adventure branches can deliver different transmissions to different kids.
 * Multi-adventure is the v1 default. A single-adventure transmission is
 * just `adventures.length === 1` — no special-casing for that case.
 *
 * ### `description` — editorial copy
 *
 * Optional admin-facing context (intent, tone notes, etc.). Not surfaced
 * to kids by default; it's a memory aid for the producer.
 *
 * ## Deprecated fields
 *
 * `thumbnail_url` and `duration_seconds` are flagged for removal — the
 * admin doesn't author them (all content is in-house, no external URLs)
 * and they're either trivially derivable from the file or pointless. They
 * remain on this interface until Slice 3 of the streamline plan strips
 * them from the API surface; the upload panel no longer collects them.
 */
interface NarrativeAsset {
  id: number;
  type: 'video' | 'audio' | 'image' | 'pdf';
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  /** Optional admin-facing editorial copy. See class JSDoc above. */
  description: string | null;
  /** Availability gate — ISO timestamp or null. See class JSDoc above. */
  send_at: string | null;
  /** Scoping set — which adventures can deliver this. See class JSDoc above. */
  adventures: { id: number; title: string }[];
  created_at: string;
  steps_count: number;
}

interface Step {
  id: number;
  adventure_id: number;
  sequence: number;
  type: 'restaurant' | 'landmark' | 'clue';
  title: string;
  description: string | null;
  lat: string | null;
  lng: string | null;
  radius_meters: number | null;
  /** Parchment placement (0..1). null when the admin hasn't placed it yet. */
  x_pct: number | null;
  y_pct: number | null;
  requirement_type: 'photo' | 'qr' | 'gps' | 'codeword';
  points: number;
  is_optional: boolean;
  narrative_asset_id: number | null;
  transmission: NarrativeAsset | null;
}

interface Adventure {
  id: number;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'active' | 'archived';
  city: string | null;
  area: string | null;
  color?: string | null;
  is_live: boolean;
  steps_count?: number;
  steps?: Step[];
}

type AdminTab = 'adventures' | 'transmissions' | 'pathmap' | 'drivers' | 'account';

// ── API helpers ───────────────────────────────────────────────────────────────

const adminApi = {
  getAdventures:   ()                           => api.get('/admin/adventures'),
  getAdventure:    (id: number)                 => api.get(`/admin/adventures/${id}`),
  createAdventure: (body: any)                  => api.post('/admin/adventures', body),
  updateAdventure: (id: number, body: any)      => api.patch(`/admin/adventures/${id}`, body),
  activateAdventure: (id: number)               => api.post(`/admin/adventures/${id}/activate`, {}),
  archiveAdventure:  (id: number)               => api.post(`/admin/adventures/${id}/archive`, {}),
  deleteAdventure:   (id: number)               => api.delete(`/admin/adventures/${id}`),

  createStep:  (aId: number, body: any)              => api.post(`/admin/adventures/${aId}/steps`, body),
  updateStep:  (aId: number, sId: number, body: any) => api.patch(`/admin/adventures/${aId}/steps/${sId}`, body),
  deleteStep:  (aId: number, sId: number)            => api.delete(`/admin/adventures/${aId}/steps/${sId}`),
  reorderSteps:(aId: number, order: number[])        => api.post(`/admin/adventures/${aId}/steps/reorder`, { order }),

  getAssets:    ()                    => api.get('/admin/narrative-assets'),
  // Upload uses the XHR-based variant so the TransmissionsTab can show a
  // live progress bar; fields are serialised by buildFormData() in the API
  // client (notably `adventures: number[]` → Laravel `adventures[]` repeats).
  uploadAsset:  (fields: Record<string, any>, onProgress?: (pct: number) => void) =>
    api.postMultipartWithProgress('/admin/narrative-assets', fields, onProgress),
  updateAsset:  (id: number, body: any) => api.patch(`/admin/narrative-assets/${id}`, body),
  deleteAsset:  (id: number)          => api.delete(`/admin/narrative-assets/${id}`),
  // Immediately push a transmission into every kid's inbox, bypassing the
  // step-arrival model. Backend endpoint: POST /admin/narrative-assets/{id}/broadcast.
  broadcastAsset: (id: number)        => api.post(`/admin/narrative-assets/${id}/broadcast`, {}),
};

// ── Sidebar nav ───────────────────────────────────────────────────────────────

function AdminSidebar({
  active,
  onNavigate,
}: {
  active: AdminTab;
  onNavigate: (t: AdminTab) => void;
}) {
  // Glyphs intentionally use simple letter tiles so they render identically
  // on web + iOS + Android without pulling in an icon-font dependency. They
  // sit in a small gold-tinted tile that picks up the active accent treatment.
  const tabs: { key: AdminTab; label: string; glyph: string }[] = [
    { key: 'adventures',    label: 'Missions',      glyph: 'M' },
    { key: 'pathmap',       label: 'Path Map',      glyph: 'P' },
    { key: 'transmissions', label: 'Transmissions', glyph: 'T' },
    { key: 'drivers',       label: 'Drivers',       glyph: 'D' },
  ];

  return (
    <View style={s.sidebar}>
      <View style={s.sidebarLogo}>
        <Text style={s.sidebarLogoText}>Hobgoblin</Text>
        <Text style={s.sidebarLogoSub}>Admin</Text>
      </View>

      <View style={s.sidebarNav}>
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.sidebarItem, isActive && s.sidebarItemActive]}
              onPress={() => onNavigate(t.key)}
              activeOpacity={0.7}
            >
              <View style={[s.sidebarGlyph, isActive && s.sidebarGlyphActive]}>
                <Text style={[s.sidebarGlyphText, isActive && s.sidebarGlyphTextActive]}>
                  {t.glyph}
                </Text>
              </View>
              <Text style={[s.sidebarLabel, isActive && s.sidebarLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.sidebarFooter}>
        <Text style={s.sidebarFooterText}>v{buildInfo.version}</Text>
        <Text style={s.sidebarFooterText}>·</Text>
        <Text style={s.sidebarFooterText}>{buildInfo.channel}</Text>
      </View>
    </View>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Adventure['status'] }) {
  const bg: Record<string, string> = {
    draft:    colors.status.draftBg,
    active:   colors.status.successBg,
    archived: colors.status.archivedBg,
  };
  const fg: Record<string, string> = {
    draft:    colors.status.draftFg,
    active:   colors.status.successFg,
    archived: colors.status.archivedFg,
  };
  return (
    <View style={[s.badge, { backgroundColor: bg[status] ?? colors.status.archivedBg }]}>
      <Text style={[s.badgeText, { color: fg[status] ?? colors.text.muted }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={s.fieldLabel}>{label}</Text>;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <FieldLabel label={label} />
      <TextInput
        style={[s.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.text.placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <View style={s.fieldRow}>{children}</View>;
}

function Select({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={s.fieldWrap}>
      <FieldLabel label={label} />
      <View style={s.selectRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[s.selectChip, value === opt.value && s.selectChipActive]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[s.selectChipText, value === opt.value && s.selectChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Centered desktop dialog, not a bottom sheet */
function Dialog({
  visible,
  title,
  onClose,
  children,
  wide,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.dialogOverlay}>
        <View style={[s.dialogBox, wide && s.dialogBoxWide]}>
          <View style={s.dialogHeader}>
            <Text style={s.dialogTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.dialogCloseBtn} activeOpacity={0.7}>
              <Text style={s.dialogCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={s.dialogScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.dialogContent}>{children}</View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Adventure form ────────────────────────────────────────────────────────────

function AdventureFormModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: Partial<Adventure> | null;
  onClose: () => void;
  onSaved: (a: Adventure) => void;
}) {
  const [title, setTitle]       = useState(initial?.title ?? '');
  const [desc, setDesc]         = useState(initial?.description ?? '');
  const [city, setCity]         = useState(initial?.city ?? '');
  const [area, setArea]         = useState(initial?.area ?? '');
  const [startsAt, setStartsAt] = useState(initial?.starts_at?.slice(0, 10) ?? '');
  const [endsAt, setEndsAt]     = useState(initial?.ends_at?.slice(0, 10) ?? '');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setDesc(initial?.description ?? '');
      setCity(initial?.city ?? '');
      setArea(initial?.area ?? '');
      setStartsAt(initial?.starts_at?.slice(0, 10) ?? '');
      setEndsAt(initial?.ends_at?.slice(0, 10) ?? '');
    }
  }, [visible, initial]);

  const handleSave = async () => {
    if (!title.trim() || !startsAt || !endsAt) {
      showToast('Title, start date and end date are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = { title, description: desc, city, area, starts_at: startsAt, ends_at: endsAt };
      const result = initial?.id
        ? await adminApi.updateAdventure(initial.id, body)
        : await adminApi.createAdventure(body);
      onSaved(result);
      onClose();
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to save mission.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog visible={visible} title={initial?.id ? 'Edit Mission' : 'New Mission'} onClose={onClose}>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Summer Hunt 2026" />
      <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Optional story context..." multiline />
      <FieldRow>
        <Field label="City" value={city} onChangeText={setCity} placeholder="Chicago" />
        <Field label="Area / Neighbourhood" value={area} onChangeText={setArea} placeholder="Lincoln Park" />
      </FieldRow>
      <FieldRow>
        <Field label="Start Date (YYYY-MM-DD)" value={startsAt} onChangeText={setStartsAt} placeholder="2026-07-01" />
        <Field label="End Date (YYYY-MM-DD)" value={endsAt} onChangeText={setEndsAt} placeholder="2026-07-31" />
      </FieldRow>

      <TouchableOpacity
        style={[s.primaryBtn, saving && s.btnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving ? <ActivityIndicator color="#000" /> : <Text style={s.primaryBtnText}>Save Mission</Text>}
      </TouchableOpacity>
    </Dialog>
  );
}

// ── Step form ─────────────────────────────────────────────────────────────────

function StepFormModal({
  visible,
  adventureId,
  initial,
  assets,
  existingSteps,
  onClose,
  onSaved,
}: {
  visible: boolean;
  adventureId: number;
  initial: Partial<Step> | null;
  assets: NarrativeAsset[];
  existingSteps: Step[];
  onClose: () => void;
  onSaved: (s: Step) => void;
}) {
  const [title, setTitle]   = useState('');
  const [desc, setDesc]     = useState('');
  const [type, setType]     = useState<Step['type']>('landmark');
  const [reqType, setReqType] = useState<Step['requirement_type']>('photo');
  const [points, setPoints] = useState('10');
  const [lat, setLat]       = useState('');
  const [lng, setLng]       = useState('');
  const [radius, setRadius] = useState('');
  const [assetId, setAssetId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [assetPickerVisible, setAssetPickerVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setDesc(initial?.description ?? '');
      setType(initial?.type ?? 'landmark');
      setReqType(initial?.requirement_type ?? 'photo');
      setPoints(String(initial?.points ?? 10));
      setLat(initial?.lat ?? '');
      setLng(initial?.lng ?? '');
      setRadius(initial?.radius_meters ? String(initial.radius_meters) : '');
      setAssetId(initial?.narrative_asset_id ?? null);
    }
  }, [visible, initial]);

  const selectedAsset = assets.find((a) => a.id === assetId) ?? null;

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Step title is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        title,
        description: desc || null,
        type,
        requirement_type: reqType,
        points: parseInt(points) || 0,
        sequence: initial?.sequence ?? existingSteps.length,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        radius_meters: radius ? parseInt(radius) : null,
        narrative_asset_id: assetId,
      };
      const result = initial?.id
        ? await adminApi.updateStep(adventureId, initial.id, body)
        : await adminApi.createStep(adventureId, body);
      onSaved(result);
      onClose();
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to save step.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog visible={visible} title={initial?.id ? 'Edit Step' : 'New Step'} onClose={onClose} wide>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Visit Oak Park Cafe" />
        <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Clue or instructions for the kid..." multiline />

        <FieldRow>
          <Select
            label="Step Type"
            value={type}
            onSelect={(v) => setType(v as Step['type'])}
            options={[
              { label: 'Landmark', value: 'landmark' },
              { label: 'Restaurant', value: 'restaurant' },
              { label: 'Clue', value: 'clue' },
            ]}
          />
          <Select
            label="Proof Required"
            value={reqType}
            onSelect={(v) => setReqType(v as Step['requirement_type'])}
            options={[
              { label: 'Photo', value: 'photo' },
              { label: 'GPS', value: 'gps' },
              { label: 'QR Code', value: 'qr' },
              { label: 'Codeword', value: 'codeword' },
            ]}
          />
        </FieldRow>

        {/* Lat / Lng / Radius are only meaningful when proof_type === 'gps'.
            For photo / qr / codeword steps these inputs are noise — the
            backend ignores them and admins shouldn't have to think about
            them. Points stays in its own row in the common case. */}
        <FieldRow>
          <Field label="Points" value={points} onChangeText={setPoints} keyboardType="numeric" />
          {reqType === 'gps' && (
            <Field label="Radius (metres)" value={radius} onChangeText={setRadius} keyboardType="numeric" placeholder="50" />
          )}
        </FieldRow>

        {reqType === 'gps' && (
          <FieldRow>
            <Field label="Latitude" value={lat} onChangeText={setLat} placeholder="41.8781" keyboardType="numeric" />
            <Field label="Longitude" value={lng} onChangeText={setLng} placeholder="-87.6298" keyboardType="numeric" />
          </FieldRow>
        )}

        <View style={s.fieldWrap}>
          <FieldLabel label="Transmission (optional)" />
          <TouchableOpacity
            style={s.assetPicker}
            onPress={() => setAssetPickerVisible(true)}
            activeOpacity={0.8}
          >
            {selectedAsset ? (
              <View style={{ flex: 1 }}>
                <Text style={s.assetPickerSelected}>{selectedAsset.title}</Text>
                <Text style={s.assetPickerType}>{selectedAsset.type.toUpperCase()}</Text>
              </View>
            ) : (
              <Text style={s.assetPickerPlaceholder}>Click to attach a Hobgoblin transmission</Text>
            )}
            {selectedAsset && (
              <TouchableOpacity
                onPress={() => setAssetId(null)}
                style={s.assetPickerClear}
                activeOpacity={0.7}
              >
                <Text style={s.assetPickerClearText}>Remove</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.primaryBtn, saving && s.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color="#000" /> : <Text style={s.primaryBtnText}>Save Step</Text>}
        </TouchableOpacity>
      </Dialog>

      {/* Asset picker dialog */}
      <Dialog
        visible={assetPickerVisible}
        title="Pick a Transmission"
        onClose={() => setAssetPickerVisible(false)}
      >
        {assets.length === 0 && (
          <Text style={s.emptyText}>No transmissions uploaded yet. Go to the Transmissions tab first.</Text>
        )}
        {assets.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[s.assetRow, assetId === a.id && s.assetRowSelected]}
            onPress={() => { setAssetId(a.id); setAssetPickerVisible(false); }}
            activeOpacity={0.8}
          >
            <View style={s.assetTypeTag}>
              <Text style={s.assetTypeTagText}>{a.type.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.assetRowTitle}>{a.title}</Text>
              {a.duration_seconds != null && (
                <Text style={s.assetRowSub}>
                  {Math.floor(a.duration_seconds / 60)}m {a.duration_seconds % 60}s
                </Text>
              )}
            </View>
            {assetId === a.id && <Text style={s.assetRowSelectedLabel}>Selected</Text>}
          </TouchableOpacity>
        ))}
      </Dialog>
    </>
  );
}

// ── Adventure detail (steps list) ─────────────────────────────────────────────

function AdventureDetail({
  adventure: initial,
  assets,
  onBack,
  onUpdated,
}: {
  adventure: Adventure;
  assets: NarrativeAsset[];
  onBack: () => void;
  onUpdated: (a: Adventure) => void;
}) {
  const [adventure, setAdventure] = useState(initial);
  const [steps, setSteps]         = useState<Step[]>([]);
  const [loading, setLoading]     = useState(true);
  const [stepModal, setStepModal] = useState<{ visible: boolean; step: Step | null }>({
    visible: false, step: null,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getAdventure(adventure.id);
      setAdventure(data);
      setSteps(data.steps ?? []);
      onUpdated(data);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load mission.', 'error');
    } finally {
      setLoading(false);
    }
  }, [adventure.id]);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async () => {
    if (Platform.OS === 'web' && !window.confirm('Activate this mission? Kids will be able to see and participate.')) return;
    setSaving(true);
    try {
      const updated = await adminApi.activateAdventure(adventure.id);
      setAdventure(updated);
      onUpdated(updated);
      showToast('Mission is now live!', 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to activate.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (Platform.OS === 'web' && !window.confirm('Archive this mission?')) return;
    setSaving(true);
    try {
      const updated = await adminApi.archiveAdventure(adventure.id);
      setAdventure(updated);
      onUpdated(updated);
      showToast('Archived.', 'info');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to archive.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (step: Step) => {
    if (Platform.OS === 'web' && !window.confirm(`Delete step "${step.title}"?`)) return;
    try {
      await adminApi.deleteStep(adventure.id, step.id);
      setSteps((prev) => prev.filter((s) => s.id !== step.id));
      showToast('Step deleted.', 'info');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to delete step.', 'error');
    }
  };

  const handleStepSaved = (saved: Step) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={s.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>{adventure.title}</Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setStepModal({ visible: true, step: null })}
          activeOpacity={0.8}
        >
          <Text style={s.addBtnText}>+ Add Step</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={colors.accent.gold} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.pageContent}>
          <View style={s.infoBar}>
            {adventure.is_live
              ? <Text style={s.liveTag}>LIVE NOW</Text>
              : <StatusBadge status={adventure.status} />}
            <Text style={s.infoBarText}>
              {adventure.starts_at?.slice(0, 10)} — {adventure.ends_at?.slice(0, 10)}
            </Text>
            {adventure.city && (
              <Text style={s.infoBarText}>
                {adventure.city}{adventure.area ? `, ${adventure.area}` : ''}
              </Text>
            )}
            <View style={{ flex: 1 }} />
            {adventure.status === 'draft' && (
              <TouchableOpacity
                style={[s.activateBtn, saving && s.btnDisabled]}
                onPress={handleActivate} disabled={saving} activeOpacity={0.8}
              >
                <Text style={s.activateBtnText}>Activate</Text>
              </TouchableOpacity>
            )}
            {adventure.status === 'active' && (
              <TouchableOpacity
                style={[s.archiveBtn, saving && s.btnDisabled]}
                onPress={handleArchive} disabled={saving} activeOpacity={0.8}
              >
                <Text style={s.archiveBtnText}>Archive</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Steps table — step placement now lives in Path Map tab */}
          {steps.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>No steps yet. Use "+ Add Step" to create the first one.</Text>
            </View>
          ) : (
            <View style={s.table}>
              <View style={[s.tableRow, s.tableHead]}>
                <Text style={[s.tableCell, s.tableCellSeq, s.tableHeadText]}>#</Text>
                <Text style={[s.tableCell, s.tableCellTitle, s.tableHeadText]}>Step</Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Type</Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Proof</Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Points</Text>
                <Text style={[s.tableCell, s.tableCellTransmission, s.tableHeadText]}>Transmission</Text>
                <Text style={[s.tableCell, s.tableCellActions, s.tableHeadText]}></Text>
              </View>

              {steps.map((step, idx) => (
                <View key={step.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                  <Text style={[s.tableCell, s.tableCellSeq, s.tableSeqNum]}>{idx + 1}</Text>
                  <View style={[s.tableCell, s.tableCellTitle]}>
                    <Text style={s.tableTitleText}>{step.title}</Text>
                    {step.description && (
                      <Text style={s.tableSubText} numberOfLines={1}>{step.description}</Text>
                    )}
                  </View>
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>{step.type}</Text>
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>{step.requirement_type}</Text>
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>{step.points}</Text>
                  <View style={[s.tableCell, s.tableCellTransmission]}>
                    {step.transmission
                      ? <View style={s.transmissionTag}><Text style={s.transmissionTagText}>{step.transmission.title}</Text></View>
                      : <Text style={s.tableSubText}>—</Text>
                    }
                  </View>
                  <View style={[s.tableCell, s.tableCellActions, { flexDirection: 'row', gap: 12 }]}>
                    <TouchableOpacity onPress={() => setStepModal({ visible: true, step })} activeOpacity={0.7}>
                      <Text style={s.linkEdit}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteStep(step)} activeOpacity={0.7}>
                      <Text style={s.linkDelete}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <StepFormModal
        visible={stepModal.visible}
        adventureId={adventure.id}
        initial={stepModal.step}
        assets={assets}
        existingSteps={steps}
        onClose={() => setStepModal({ visible: false, step: null })}
        onSaved={handleStepSaved}
      />
    </View>
  );
}

// ── Mission colour picker ─────────────────────────────────────────────────────

const MISSION_COLORS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71',
  '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63',
  '#00BCD4', '#8BC34A', '#FF5722', '#607D8B',
];

function MissionColorPicker({
  visible, currentColor, onClose, onPick,
}: {
  visible: boolean; currentColor: string;
  onClose: () => void; onPick: (color: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.colorPickerBackdrop}>
        <View style={s.colorPickerCard}>
          <View style={s.colorPickerHeader}>
            <Text style={s.colorPickerTitle}>Mission colour</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.colorPickerClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={s.colorPickerGrid}>
            {MISSION_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[s.colorPickerSwatch, { backgroundColor: c }, c === currentColor && s.colorPickerSwatchActive]}
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

// ── Adventures tab ────────────────────────────────────────────────────────────

function AdventuresTab({
  assets,
  selected,
  onSelect,
}: {
  assets: NarrativeAsset[];
  selected: Adventure | null;
  onSelect: (a: Adventure | null) => void;
}) {
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [loading, setLoading]       = useState(true);
  const [formModal, setFormModal]   = useState<{ visible: boolean; adventure: Adventure | null }>({
    visible: false, adventure: null,
  });
  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null);

  const handleColorPick = async (adventureId: number, color: string) => {
    setColorPickerFor(null);
    setAdventures((prev) => prev.map((a) => a.id === adventureId ? { ...a, color } : a));
    try {
      await adminApi.updateAdventure(adventureId, { color });
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to save colour.', 'error');
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAdventures();
      setAdventures(Array.isArray(data) ? data : []);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load missions.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-fetch the adventures list whenever the admin returns from a detail
  // view (selected → null). The removed in-page back button used to fire
  // load() directly via its onBack handler; now that navigation lives in
  // the TopBar crumb, we react to the selection transition instead so
  // counters like steps_count stay current.
  const prevSelectedId = React.useRef<number | null>(selected?.id ?? null);
  useEffect(() => {
    if (prevSelectedId.current != null && selected == null) {
      load();
    }
    prevSelectedId.current = selected?.id ?? null;
  }, [selected, load]);

  const handleSaved = (a: Adventure) => {
    setAdventures((prev) => {
      const idx = prev.findIndex((x) => x.id === a.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = a; return next; }
      return [a, ...prev];
    });
  };

  if (selected) {
    return (
      <AdventureDetail
        adventure={selected}
        assets={assets}
        onBack={() => onSelect(null)}
        onUpdated={handleSaved}
      />
    );
  }

  return (
    <>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Missions</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setFormModal({ visible: true, adventure: null })}
          activeOpacity={0.8}
        >
          <Text style={s.addBtnText}>+ New Mission</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.pageContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent.gold} />}
      >
        {!loading && adventures.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No missions yet. Create the first one.</Text>
          </View>
        )}

        {adventures.length > 0 && (
          <View style={s.table}>
            <View style={[s.tableRow, s.tableHead]}>
              <Text style={[s.tableCell, s.tableCellStatus, s.tableHeadText]}>Status</Text>
              <Text style={[s.tableCell, s.tableCellTitle, s.tableHeadText]}>Title</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Dates</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Location</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Steps</Text>
              <Text style={[s.tableCell, s.tableCellColor, s.tableHeadText]}>Colour</Text>
            </View>

            {adventures.map((a, idx) => (
              <TouchableOpacity
                key={a.id}
                style={[s.tableRow, s.tableRowClickable, idx % 2 === 1 && s.tableRowAlt]}
                onPress={() => onSelect(a)}
                activeOpacity={0.7}
              >
                <View style={[s.tableCell, s.tableCellStatus]}>
                  {a.is_live
                    ? <Text style={s.liveTagSmall}>LIVE</Text>
                    : <StatusBadge status={a.status} />}
                </View>
                <Text style={[s.tableCell, s.tableCellTitle, s.tableTitleText]}>{a.title}</Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                  {a.starts_at?.slice(0, 10)}{'\n'}{a.ends_at?.slice(0, 10)}
                </Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                  {[a.city, a.area].filter(Boolean).join(', ') || '—'}
                </Text>
                <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                  {a.steps_count ?? '—'}
                </Text>
                {/* Colour swatch — stopPropagation so it doesn't open the mission detail */}
                <View style={[s.tableCell, s.tableCellColor]}>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setColorPickerFor(a.id); }}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[s.colorSwatchCell, { backgroundColor: a.color ?? '#607D8B' }]} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Inline colour picker */}
        <MissionColorPicker
          visible={colorPickerFor != null}
          currentColor={adventures.find((a) => a.id === colorPickerFor)?.color ?? '#607D8B'}
          onClose={() => setColorPickerFor(null)}
          onPick={(color) => { if (colorPickerFor != null) handleColorPick(colorPickerFor, color); }}
        />
      </ScrollView>

      <AdventureFormModal
        visible={formModal.visible}
        initial={formModal.adventure}
        onClose={() => setFormModal({ visible: false, adventure: null })}
        onSaved={handleSaved}
      />
    </>
  );
}

// ── Asset preview lightbox ────────────────────────────────────────────────────
//
// WHY a separate React root:
//   createPortal still shares the same React root as the RN app. React Native
//   Web registers its synthetic event system on that root, so even portaled
//   DOM nodes have their pointer events intercepted before native browser
//   controls (<video>, <audio>) can see them.
//
//   The only complete escape is ReactDOM.createRoot on a fresh DOM container
//   appended directly to document.body. That container is its own React tree,
//   fully outside RN's event delegation.

// Inner component — pure React DOM, no RN primitives.
function AssetPreviewContent({
  asset,
  onClose,
}: {
  asset: NarrativeAsset;
  onClose: () => void;
}) {
  const [loadError, setLoadError] = React.useState(false);

  // The backend may return either an absolute URL or a relative path
  // (e.g. `/storage/...`). resolveAssetUrl() rebases relative paths onto
  // the backend origin so the browser doesn't 404 against the Expo dev
  // server's origin.
  const resolvedUrl = resolveAssetUrl(asset.url);

  const btn: React.CSSProperties = {
    background: 'none', border: 'none', color: colors.accent.gold,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: colors.overlay.backdropHeavy,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.surface.overlay, borderRadius: 4,
          width: '100%', maxWidth: 820,
          overflow: 'hidden', border: `1px solid ${colors.accent.goldBorder}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: `1px solid ${colors.border.whisper}`,
        }}>
          <span style={{
            color: '#fff', fontSize: 15, fontWeight: 600,
            flex: 1, marginRight: 16,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {asset.title}
          </span>
          <button style={btn} onClick={onClose}>Close</button>
        </div>

        {/* Media */}
        {!loadError && asset.type === 'image' && (
          <img
            src={resolvedUrl}
            alt={asset.title}
            onError={() => setLoadError(true)}
            style={{ width: '100%', maxHeight: 520, objectFit: 'contain', backgroundColor: '#000', display: 'block' }}
          />
        )}
        {!loadError && asset.type === 'video' && (
          <video
            src={resolvedUrl}
            controls
            onError={() => setLoadError(true)}
            style={{ width: '100%', maxHeight: 480, backgroundColor: '#000', display: 'block' }}
          />
        )}
        {!loadError && asset.type === 'audio' && (
          <div style={{ padding: 24 }}>
            <audio
              src={resolvedUrl}
              controls
              onError={() => setLoadError(true)}
              style={{ width: '100%' }}
            />
          </div>
        )}
        {!loadError && asset.type === 'pdf' && (
          <iframe
            src={resolvedUrl}
            title={asset.title}
            onError={() => setLoadError(true)}
            style={{ width: '100%', height: 600, border: 'none', backgroundColor: '#000', display: 'block' }}
          />
        )}

        {/* Error fallback — surfaces the actual URL we tried so the admin
            can immediately distinguish "wrong URL" from "right URL but
            unreachable" without diving into DevTools. */}
        {loadError && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: colors.text.subtle, marginBottom: 12, fontSize: 14 }}>
              This file cannot be previewed in the browser (unsupported format or network error).
            </p>
            <p style={{ color: colors.text.dim, marginBottom: 16, fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {resolvedUrl}
            </p>
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: colors.accent.gold, fontSize: 14, textDecoration: 'underline' }}
            >
              Open file directly
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper rendered in the RN tree — mounts a fresh DOM root on open, unmounts on close.
function AssetPreviewModal({
  asset,
  onClose,
}: {
  asset: NarrativeAsset;
  onClose: () => void;
}) {
  // Keep onClose stable so the effect doesn't re-run when parent re-renders.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const container = document.createElement('div');
    container.setAttribute('data-asset-preview', '1');
    document.body.appendChild(container);

    let root: any = null;
    const stableClose = () => onCloseRef.current();

    try {
      // React 18
      const { createRoot } = require('react-dom/client');
      root = createRoot(container);
      root.render(<AssetPreviewContent asset={asset} onClose={stableClose} />);
    } catch {
      try {
        // React 17 fallback
        const RD = require('react-dom');
        RD.render(<AssetPreviewContent asset={asset} onClose={stableClose} />, container);
        root = { unmount: () => RD.unmountComponentAtNode(container) };
      } catch { /* no-op */ }
    }

    return () => {
      try { root?.unmount(); } catch { /* no-op */ }
      if (container.parentNode) container.parentNode.removeChild(container);
    };
  // asset is the dependency — a new asset means a new preview mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  return null;
}

// ── Upload helpers ────────────────────────────────────────────────────────────
//
// These three components are intentionally placed above AssetEditModal so
// that Slice 3 of the streamline plan (which mirrors the upload field set
// into the edit modal) can consume them without re-ordering.

/** Pretty-print a byte count for the pending-file chip. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Glyph picked off the MIME type so each file type reads at a glance. */
function fileGlyph(file: { type?: string; name?: string }): string {
  const t = (file.type ?? '').toLowerCase();
  if (t.startsWith('video/')) return '▶';
  if (t.startsWith('audio/')) return '♪';
  if (t.startsWith('image/')) return '◇';
  if (t === 'application/pdf') return '▤';
  return '·';
}

/**
 * File drop zone for the transmissions upload panel.
 *
 * Web: a dashed-border region that listens for OS drag-and-drop on its
 * underlying DOM node. Click anywhere on the zone to open the OS file
 * picker. Highlights with a gold wash while a file is being dragged over.
 *
 * Native (iOS/Android): RN does not expose OS drag-and-drop in this
 * codebase, so the zone collapses to a simple tap-to-browse affordance.
 * In practice the admin shell is web-only — this branch is defensive.
 *
 * When a file is staged, the zone replaces itself with a compact preview
 * chip showing the filename, size, and a remove button. The actual upload
 * is triggered separately by the Upload button below.
 */
function UploadDropZone({
  file,
  onFileSelected,
  onFileRemoved,
  disabled,
}: {
  file: File | null;
  onFileSelected: (f: File) => void;
  onFileRemoved: () => void;
  disabled?: boolean;
}) {
  const [isOver, setIsOver] = useState(false);
  const nodeRef = React.useRef<View>(null);

  // Web only: attach DOM-level drag handlers to the underlying div.
  // RN-Web forwards View refs to the host HTMLDivElement, so we can call
  // addEventListener directly. We use a ref + effect (rather than RN's
  // onDragEnter-style props) because RN's synthetic event system doesn't
  // implement those events.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = nodeRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const stop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDragEnter = (e: DragEvent) => { stop(e); if (!disabled) setIsOver(true); };
    const onDragOver  = (e: DragEvent) => { stop(e); };
    const onDragLeave = (e: DragEvent) => { stop(e); setIsOver(false); };
    const onDrop = (e: DragEvent) => {
      stop(e);
      setIsOver(false);
      if (disabled) return;
      const f = e.dataTransfer?.files?.[0];
      if (f) onFileSelected(f);
    };

    node.addEventListener('dragenter', onDragEnter);
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragenter', onDragEnter);
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, [onFileSelected, disabled]);

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*,application/pdf';
    input.onchange = (e: any) => {
      const f = e.target?.files?.[0];
      if (f) onFileSelected(f);
    };
    input.click();
  };

  // Staged-file preview chip — replaces the drop zone once a file is held.
  if (file) {
    return (
      <View style={s.dropZonePending}>
        <Text style={s.dropZonePendingIcon}>{fileGlyph(file)}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.dropZonePendingName} numberOfLines={1}>{file.name}</Text>
          <Text style={s.dropZonePendingMeta}>{formatBytes(file.size)}</Text>
        </View>
        {!disabled && (
          <TouchableOpacity onPress={onFileRemoved} style={s.dropZoneRemove} activeOpacity={0.7}>
            <Text style={s.dropZoneRemoveText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={openPicker} disabled={disabled}>
      <View ref={nodeRef as any} style={[s.dropZone, isOver && s.dropZoneOver, disabled && s.dropZoneDisabled]}>
        <Text style={s.dropZoneHeadline}>
          {Platform.OS === 'web' ? 'Drop a file here or click to browse' : 'Tap to choose a file'}
        </Text>
        <Text style={s.dropZoneSub}>Supports video, audio, image, PDF · Max 200 MB</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Multi-select picker for assigning a transmission to one or more
 * adventures. Selected entries render as removable pill chips; "+ Add
 * adventure" opens a Dialog that lists every adventure not already
 * selected.
 *
 * Designed for reuse — Slice 3 (AssetEditModal) drops this in unchanged
 * and the original admin-polish plan's Slice C step-attach UX is expected
 * to reuse it as well, so all data flows through props rather than
 * fetching state internally.
 */
function AdventureChipPicker({
  allAdventures,
  selectedIds,
  onChange,
  disabled,
}: {
  allAdventures: Adventure[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected   = allAdventures.filter((a) => selectedIds.includes(a.id));
  const unselected = allAdventures.filter((a) => !selectedIds.includes(a.id));

  const add    = (id: number) => onChange([...selectedIds, id]);
  const remove = (id: number) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <>
      <View style={s.chipPickerWrap}>
        {selected.map((a) => (
          <View key={a.id} style={s.adventureChip}>
            <Text style={s.adventureChipText}>{a.title}</Text>
            {!disabled && (
              <TouchableOpacity
                onPress={() => remove(a.id)}
                style={s.adventureChipRemove}
                activeOpacity={0.7}
                accessibilityLabel={`Remove ${a.title}`}
              >
                <Text style={s.adventureChipRemoveText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {!disabled && unselected.length > 0 && (
          <TouchableOpacity
            style={s.adventureChipAdd}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={s.adventureChipAddText}>
              {selected.length === 0 ? '+ Assign to mission' : '+ Add mission'}
            </Text>
          </TouchableOpacity>
        )}

        {selected.length === 0 && unselected.length === 0 && (
          <Text style={s.chipPickerEmpty}>No missions exist yet — create one in the Missions tab first.</Text>
        )}
      </View>

      <Dialog
        visible={pickerOpen}
        title="Assign to mission"
        onClose={() => setPickerOpen(false)}
      >
        {unselected.length === 0 ? (
          <Text style={s.emptyText}>All missions are already assigned.</Text>
        ) : (
          unselected.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={s.adventurePickerRow}
              onPress={() => { add(a.id); setPickerOpen(false); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.adventurePickerTitle}>{a.title}</Text>
                <Text style={s.adventurePickerMeta}>
                  {a.status.toUpperCase()}
                  {a.starts_at ? ` · ${a.starts_at.slice(0, 10)}` : ''}
                  {a.city ? ` · ${a.city}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </Dialog>
    </>
  );
}

/**
 * Datetime entry for the "Send later" branch.
 *
 * On web we drop down to a raw <input type="datetime-local"> for the
 * native browser picker — RN-Web's TextInput has no equivalent and the
 * browser-provided picker is significantly better than any handrolled
 * approximation. `colorScheme: 'dark'` flips the picker chrome to dark
 * mode in Chromium/Firefox.
 *
 * On native we fall back to a plain TextInput accepting ISO-ish text.
 * The admin shell is web-only in practice; this branch is defensive.
 */
function DateTimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  if (Platform.OS === 'web') {
    const style: React.CSSProperties = {
      backgroundColor: colors.surface.inset,
      borderRadius: radii.md,
      border: `1px solid ${colors.border.input}`,
      color: colors.text.primary,
      fontSize: ty.size.base,
      padding: '10px 12px',
      colorScheme: 'dark',
      fontFamily: 'inherit',
      outline: 'none',
    };
    return React.createElement('input', {
      type: 'datetime-local',
      value,
      onChange: (e: any) => onChange(e.target.value),
      style,
    });
  }
  return (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DDTHH:MM"
      placeholderTextColor={colors.text.placeholder}
      autoCapitalize="none"
    />
  );
}

// ── Asset edit dialog ─────────────────────────────────────────────────────────

function AssetEditModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: NarrativeAsset;
  onClose: () => void;
  onSaved: (updated: NarrativeAsset) => void;
}) {
  const [title, setTitle]         = useState(asset.title);
  const [thumbUrl, setThumbUrl]   = useState(asset.thumbnail_url ?? '');
  const [duration, setDuration]   = useState(
    asset.duration_seconds != null ? String(asset.duration_seconds) : ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { showToast('Title is required.', 'error'); return; }
    setSaving(true);
    try {
      const body: any = { title: title.trim() };
      if (thumbUrl.trim()) body.thumbnail_url = thumbUrl.trim();
      else body.thumbnail_url = null;
      const dur = parseInt(duration, 10);
      body.duration_seconds = isNaN(dur) ? null : dur;
      const updated = await adminApi.updateAsset(asset.id, body);
      onSaved(updated);
      showToast('Transmission updated.', 'success');
      onClose();
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Rebase whatever the API returned onto the backend origin so the
  // <Image> below actually loads. See resolveAssetUrl() docstring.
  const rawPreviewUrl = asset.type === 'image' ? asset.url : asset.thumbnail_url;
  const previewUrl = rawPreviewUrl ? resolveAssetUrl(rawPreviewUrl) : null;

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.dialogOverlay}>
        <View
          style={[
            s.dialogBox,
            s.dialogBoxWide,
            { backgroundColor: colors.surface.overlay, borderColor: colors.accent.goldBorderSoft, borderRadius: radii.xl },
          ]}
        >
          <View style={[s.dialogHeader, { borderBottomColor: colors.border.whisper }]}>
            <Text style={s.dialogTitle}>Edit Transmission</Text>
            <TouchableOpacity onPress={onClose} style={s.dialogCloseBtn}>
              <Text style={s.dialogCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.dialogScroll} contentContainerStyle={s.dialogContent}>

            {/* Asset preview + metadata row */}
            <View style={s.editAssetMeta}>
              {/* Thumbnail / preview */}
              <View style={s.editThumbWrap}>
                {previewUrl ? (
                  <Image source={{ uri: previewUrl }} style={s.editThumb} resizeMode="cover" />
                ) : (
                  <View style={[s.editThumb, s.editThumbEmpty]}>
                    <Text style={s.editThumbEmptyText}>{asset.type.toUpperCase()}</Text>
                  </View>
                )}
              </View>

              {/* Info column */}
              <View style={{ flex: 1 }}>
                <View style={s.editMetaRow}>
                  <Text style={s.editMetaLabel}>Type</Text>
                  <View style={s.assetTypeTag}>
                    <Text style={s.assetTypeTagText}>{asset.type.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.editMetaRow}>
                  <Text style={s.editMetaLabel}>Uploaded</Text>
                  <Text style={s.editMetaValue}>{asset.created_at ? formatDate(asset.created_at) : '—'}</Text>
                </View>
                <View style={s.editMetaRow}>
                  <Text style={s.editMetaLabel}>Used in</Text>
                  <Text style={s.editMetaValue}>{asset.steps_count} {asset.steps_count === 1 ? 'step' : 'steps'}</Text>
                </View>
                <View style={[s.editMetaRow, { alignItems: 'flex-start' }]}>
                  <Text style={s.editMetaLabel}>URL</Text>
                  <Text style={[s.editMetaValue, s.editMetaUrl]} numberOfLines={2}>{asset.url}</Text>
                </View>
              </View>
            </View>

            <View style={s.editDivider} />

            {/* Editable fields */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Transmission title"
                placeholderTextColor={colors.text.placeholder}
              />
            </View>

            <View style={s.fieldRow}>
              <View style={[s.fieldWrap, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Duration (seconds)</Text>
                <TextInput
                  style={s.input}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="e.g. 90"
                  placeholderTextColor={colors.text.placeholder}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>Thumbnail URL</Text>
              <TextInput
                style={s.input}
                value={thumbUrl}
                onChangeText={setThumbUrl}
                placeholder="https://... (video/audio only — leave blank for images)"
                placeholderTextColor={colors.text.placeholder}
                autoCapitalize="none"
              />
              <Text style={s.fieldHint}>
                Used as the preview thumbnail in the table. Images use the file URL automatically.
              </Text>
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, saving && s.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={s.primaryBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Transmissions tab ─────────────────────────────────────────────────────────

function TransmissionsTab() {
  const [assets, setAssets]   = useState<NarrativeAsset[]>([]);
  const [loading, setLoading] = useState(true);

  // The list of adventures is needed by the AdventureChipPicker inside the
  // upload panel. We fetch it here (rather than lifting state into
  // AdminPortal) so this tab remains self-contained — the adventures list
  // is small and re-fetching on tab mount is cheap.
  const [allAdventures, setAllAdventures] = useState<Adventure[]>([]);

  // ── Upload form state ─────────────────────────────────────────────────
  //
  // Replaced the old { title, uploadThumb, uploadDuration } trio with the
  // Slice 2 field set. `uploadProgress` is null when no upload is in
  // flight, otherwise an integer 0–100 driving the progress bar.
  const [uploadFile,        setUploadFile]        = useState<File | null>(null);
  const [uploadTitle,       setUploadTitle]       = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadSendMode,    setUploadSendMode]    = useState<'now' | 'later'>('now');
  const [uploadSendAt,      setUploadSendAt]      = useState('');
  const [uploadAdventures,  setUploadAdventures]  = useState<number[]>([]);
  const [uploadProgress,    setUploadProgress]    = useState<number | null>(null);

  const [editingAsset, setEditingAsset] = useState<NarrativeAsset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<NarrativeAsset | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [assetData, adventureData] = await Promise.all([
        adminApi.getAssets(),
        adminApi.getAdventures(),
      ]);
      setAssets(Array.isArray(assetData) ? assetData : []);
      setAllAdventures(Array.isArray(adventureData) ? adventureData : []);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load transmissions.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Auto-prefill the title from the filename when the title is still empty. */
  const handleFileSelected = (file: File) => {
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
      if (base) setUploadTitle(base);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadTitle('');
    setUploadDescription('');
    setUploadSendMode('now');
    setUploadSendAt('');
    setUploadAdventures([]);
  };

  const isUploading = uploadProgress !== null;

  const handleUpload = async () => {
    if (!uploadFile) {
      showToast('Drop a file or click the zone to browse first.', 'error');
      return;
    }
    if (!uploadTitle.trim()) {
      showToast('Title is required.', 'error');
      return;
    }
    if (uploadSendMode === 'later' && !uploadSendAt) {
      showToast('Pick a send time, or switch to "Now".', 'error');
      return;
    }

    setUploadProgress(0);
    try {
      const fields: Record<string, any> = {
        file:  uploadFile,
        title: uploadTitle.trim(),
      };
      if (uploadDescription.trim()) {
        fields.description = uploadDescription.trim();
      }
      if (uploadSendMode === 'later' && uploadSendAt) {
        // datetime-local inputs hand back "YYYY-MM-DDTHH:MM" (no zone) —
        // funnel through Date so we send a fully-qualified ISO string.
        const d = new Date(uploadSendAt);
        if (!isNaN(d.getTime())) fields.send_at = d.toISOString();
      }
      if (uploadAdventures.length > 0) {
        fields.adventures = uploadAdventures;
      }
      const saved = await adminApi.uploadAsset(fields, (pct) => setUploadProgress(pct));
      setAssets((prev) => [saved, ...prev]);
      resetUploadForm();
      showToast('Transmission uploaded!', 'success');
    } catch (err: any) {
      showToast(err?.message ?? 'Upload failed.', 'error');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDelete = async (asset: NarrativeAsset) => {
    if (Platform.OS === 'web' && !window.confirm(`Delete "${asset.title}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteAsset(asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      showToast('Deleted.', 'info');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to delete.', 'error');
    }
  };

  const handleBroadcast = async (asset: NarrativeAsset) => {
    if (Platform.OS === 'web' && !window.confirm(
      `Send "${asset.title}" to every kid right now? It will land in their inbox immediately, outside the mission steps.`
    )) return;
    try {
      const res = await adminApi.broadcastAsset(asset.id);
      const count = res?.delivered_count;
      showToast(
        typeof count === 'number' ? `Sent to ${count} kid${count === 1 ? '' : 's'}.` : 'Transmission sent.',
        'success',
      );
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to send.', 'error');
    }
  };

  const handleAssetSaved = (updated: NarrativeAsset) => {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Transmissions</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.pageContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent.gold} />}
      >
        {/* Upload panel — Slice 2 rebuild.
            Drop zone → editorial fields → progress bar.
            Thumbnail URL and Duration are deliberately gone: all content
            is in-house, no external URLs, and duration is derivable from
            the file (or simply not useful for editorial decisions). */}
        <View style={s.uploadPanel}>
          <Text style={s.uploadPanelLabel}>Upload New Transmission</Text>

          <UploadDropZone
            file={uploadFile}
            onFileSelected={handleFileSelected}
            onFileRemoved={() => setUploadFile(null)}
            disabled={isUploading}
          />

          <View style={s.fieldWrap}>
            <FieldLabel label="Title" />
            <TextInput
              style={s.input}
              value={uploadTitle}
              onChangeText={setUploadTitle}
              placeholder="Auto-fills from filename"
              placeholderTextColor={colors.text.placeholder}
              editable={!isUploading}
            />
          </View>

          <View style={s.fieldWrap}>
            <FieldLabel label="Description" />
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top' }]}
              value={uploadDescription}
              onChangeText={setUploadDescription}
              placeholder="Optional editorial notes — intent, tone, references…"
              placeholderTextColor={colors.text.placeholder}
              multiline
              editable={!isUploading}
            />
          </View>

          <View style={s.fieldWrap}>
            <FieldLabel label="Send" />
            <View style={s.sendRow}>
              <TouchableOpacity
                style={[s.selectChip, uploadSendMode === 'now' && s.selectChipActive]}
                onPress={() => setUploadSendMode('now')}
                activeOpacity={0.7}
                disabled={isUploading}
              >
                <Text style={[s.selectChipText, uploadSendMode === 'now' && s.selectChipTextActive]}>Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.selectChip, uploadSendMode === 'later' && s.selectChipActive]}
                onPress={() => setUploadSendMode('later')}
                activeOpacity={0.7}
                disabled={isUploading}
              >
                <Text style={[s.selectChipText, uploadSendMode === 'later' && s.selectChipTextActive]}>Later</Text>
              </TouchableOpacity>
              {uploadSendMode === 'later' && (
                <DateTimeInput value={uploadSendAt} onChange={setUploadSendAt} />
              )}
            </View>
            {uploadSendMode === 'later' && (
              <Text style={s.fieldHint}>
                Availability gate, not a delivery trigger — kids still only see this once they reach a step it's attached to.
              </Text>
            )}
          </View>

          <View style={s.fieldWrap}>
            <FieldLabel label="Assigned to" />
            <AdventureChipPicker
              allAdventures={allAdventures}
              selectedIds={uploadAdventures}
              onChange={setUploadAdventures}
              disabled={isUploading}
            />
            <Text style={s.fieldHint}>
              Kids only ever receive a transmission whose adventure set includes their active adventure.
            </Text>
          </View>

          {isUploading ? (
            <View style={s.uploadProgressWrap}>
              <View style={s.uploadProgressTrack}>
                <View style={[s.uploadProgressFill, { width: `${uploadProgress ?? 0}%` }]} />
              </View>
              <Text style={s.uploadProgressText}>{uploadProgress ?? 0}%</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.uploadBtn, !uploadFile && s.btnDisabled]}
              onPress={handleUpload}
              disabled={!uploadFile}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Upload</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Library table */}
        {!loading && assets.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No transmissions uploaded yet.</Text>
          </View>
        ) : (
          <View style={s.table}>
            {/* The thumbnail cell already carries the asset's type via the
                VID / AUD / IMG placeholder (or a real preview image), so a
                separate Type column is pure redundancy — dropped. */}
            <View style={[s.tableRow, s.tableHead]}>
              <View style={[s.tableCell, s.assetThumbCol]} />
              <Text style={[s.tableCell, s.tableCellTitle, s.tableHeadText]}>Title</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Duration</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Added</Text>
              <Text style={[s.tableCell, s.tableCellMeta, s.tableHeadText]}>Used in</Text>
              <Text style={[s.tableCell, s.assetActionsCol, s.tableHeadText]}></Text>
            </View>

            {assets.map((a, idx) => {
              // Same rebasing as the lightbox and edit-modal preview —
              // the API may hand back a path like `/storage/foo.jpg` that
              // only resolves correctly against the backend origin.
              const rawPreviewUrl = a.type === 'image' ? a.url : a.thumbnail_url;
              const previewUrl = rawPreviewUrl ? resolveAssetUrl(rawPreviewUrl) : null;
              return (
                <View key={a.id} style={[s.tableRow, idx % 2 === 1 && s.tableRowAlt]}>
                  {/* Thumbnail */}
                  <View style={[s.tableCell, s.assetThumbCol]}>
                    {previewUrl ? (
                      <TouchableOpacity onPress={() => setPreviewAsset(a)} activeOpacity={0.8}>
                        <Image
                          source={{ uri: previewUrl }}
                          style={s.assetThumb}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setPreviewAsset(a)} activeOpacity={0.8} style={s.assetThumbPlaceholder}>
                        <Text style={s.assetThumbIcon}>
                          {a.type === 'video' ? 'VID' : a.type === 'audio' ? 'AUD' : a.type === 'pdf' ? 'PDF' : 'IMG'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Title — the raw URL sub-text was admin-debug noise and
                      adds no editorial value; admins who need the URL can
                      grab it from the preview lightbox or the network tab. */}
                  <View style={[s.tableCell, s.tableCellTitle]}>
                    <Text style={s.tableTitleText} numberOfLines={1}>{a.title}</Text>
                  </View>
                  {/* Duration */}
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                    {a.duration_seconds != null
                      ? `${Math.floor(a.duration_seconds / 60)}m ${a.duration_seconds % 60}s`
                      : '—'}
                  </Text>
                  {/* Created at */}
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                    {a.created_at ? formatDate(a.created_at) : '—'}
                  </Text>
                  {/* Steps count */}
                  <Text style={[s.tableCell, s.tableCellMeta, s.tableMetaText]}>
                    {a.steps_count} step{a.steps_count !== 1 ? 's' : ''}
                  </Text>
                  {/* Actions */}
                  <View style={[s.tableCell, s.assetActionsCol, { flexDirection: 'row', gap: 14 }]}>
                    <TouchableOpacity onPress={() => handleBroadcast(a)} activeOpacity={0.7}>
                      <Text style={s.linkEdit}>Send to all</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingAsset(a)} activeOpacity={0.7}>
                      <Text style={s.linkEdit}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(a)} activeOpacity={0.7}>
                      <Text style={s.linkDelete}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {editingAsset && (
        <AssetEditModal
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSaved={handleAssetSaved}
        />
      )}

      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export interface AdminPortalProps {
  onExit: () => void;
}

export default function AdminPortal({ onExit }: AdminPortalProps) {
  const [tab, setTab]       = useState<AdminTab>('adventures');
  const [assets, setAssets] = useState<NarrativeAsset[]>([]);
  const [email, setEmail]   = useState<string | null>(null);

  // Lifted from AdventuresTab so the top bar can show the adventure name as
  // the deepest breadcrumb. Clicking "Adventures" in the crumb trail clears
  // this and returns the tab to its list view.
  const [selectedAdventure, setSelectedAdventure] = useState<Adventure | null>(null);

  useEffect(() => {
    adminApi.getAssets()
      .then((data) => setAssets(Array.isArray(data) ? data : []))
      .catch(() => null);
    Repos.auth.getEmail()
      .then((e) => setEmail(e))
      .catch(() => null);
  }, []);

  // Switching tabs should drop any nested context so the top bar reflects
  // the new tab cleanly.
  const handleNavigate = (next: AdminTab) => {
    if (next !== tab) setSelectedAdventure(null);
    setTab(next);
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web' && !window.confirm('Sign out?')) return;
    try { await Repos.auth.logout(); } catch { /* best-effort */ }
    onExit();
  };

  const trail: BreadcrumbItem[] =
    tab === 'transmissions'
      ? [{ label: 'Transmissions' }]
      : tab === 'pathmap'
      ? [{ label: 'Path Map' }]
      : tab === 'drivers'
      ? [{ label: 'Drivers' }]
      : selectedAdventure
        ? [
            { label: 'Missions', onPress: () => setSelectedAdventure(null) },
            { label: selectedAdventure.title },
          ]
        : [{ label: 'Missions' }];

  return (
    <View style={s.root}>
      <AdminSidebar active={tab} onNavigate={handleNavigate} />

      <View style={s.main}>
        <AdminTopBar trail={trail} email={email} onSignOut={handleSignOut} />

        <View style={s.mainContent}>
          {tab === 'adventures' && (
            <AdventuresTab
              assets={assets}
              selected={selectedAdventure}
              onSelect={setSelectedAdventure}
            />
          )}
          {tab === 'transmissions' && <TransmissionsTab />}
          {tab === 'pathmap' && <PathMapTab />}
          {tab === 'drivers' && <DriversTab />}
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
//
// Everything below consumes tokens from `./ui/tokens` so colour, spacing,
// radius, and type can be retuned in one place. Visual output is intentionally
// identical to the pre-token literals — this slice is a structural cleanup.

const s = StyleSheet.create({
  // Layout
  root:        { flex: 1, flexDirection: 'row', backgroundColor: colors.surface.base },
  main:        { flex: 1, flexDirection: 'column', minHeight: 0 },
  mainContent: { flex: 1, flexDirection: 'column', minHeight: 0 },

  // Sidebar
  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: colors.surface.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border.subtle,
    flexDirection: 'column',
  },
  sidebarLogo: {
    padding: spacing['3xl'],
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  sidebarLogoText: {
    color: colors.text.primary,
    fontSize: ty.size.xl,
    fontWeight: ty.weight.heavy,
    letterSpacing: ty.tracking.label,
  },
  sidebarLogoSub: {
    color: colors.accent.gold,
    fontSize: ty.size.xs,
    letterSpacing: ty.tracking.logo,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  sidebarNav: { flex: 1, paddingTop: spacing.md },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  sidebarItemActive: {
    backgroundColor: colors.accent.goldWash,
    borderRightWidth: 2,
    borderRightColor: colors.accent.gold,
  },
  sidebarGlyph: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    backgroundColor: colors.surface.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarGlyphActive: {
    backgroundColor: colors.accent.goldWashActive,
  },
  sidebarGlyphText: {
    color: colors.text.subtle,
    fontSize: ty.size.chip,
    fontWeight: ty.weight.heavy,
  },
  sidebarGlyphTextActive: {
    color: colors.accent.gold,
  },
  sidebarLabel: {
    color: colors.text.subtle,
    fontSize: ty.size.md,
    fontWeight: ty.weight.medium,
  },
  sidebarLabelActive: {
    color: colors.accent.gold,
    fontWeight: ty.weight.bold,
  },
  sidebarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  sidebarFooterText: {
    color: colors.text.veryDim,
    fontSize: ty.size.sm,
    letterSpacing: ty.tracking.label,
  },

  // Page chrome
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.inset,
    backgroundColor: colors.surface.sunken,
  },
  pageTitle: {
    color: colors.text.primary,
    fontSize: ty.size['2xl'],
    fontWeight: ty.weight.bold,
  },
  pageSubtitle: {
    color: colors.text.dim,
    fontSize: ty.size.chip,
    marginTop: 2,
  },
  pageContent: { padding: spacing['4xl'], paddingTop: spacing['2xl'] },

  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  infoBarText:  { color: colors.text.muted,    fontSize: ty.size.md },
  liveTag:      { color: colors.status.successFg, fontSize: ty.size.sm, fontWeight: ty.weight.heavy, letterSpacing: ty.tracking.eyebrow },
  liveTagSmall: { color: colors.status.successFg, fontSize: ty.size.eyebrow, fontWeight: ty.weight.heavy, letterSpacing: ty.tracking.eyebrow },

  backBtn:      { marginRight: spacing.xl },
  backBtnText:  { color: colors.accent.gold, fontSize: ty.size.md, fontWeight: ty.weight.semi },

  addBtn:       { backgroundColor: colors.accent.gold, borderRadius: radii.md, paddingVertical: 9, paddingHorizontal: spacing.xl },
  addBtnText:   { color: '#000', fontSize: ty.size.md, fontWeight: ty.weight.heavy },

  // List | Map toggle in the adventure detail header
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface.raised,
    borderRadius: radii.md,
    padding: 2,
    marginRight: spacing.md,
  },
  viewToggleBtn: {
    paddingVertical: 7,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.accent.gold,
  },
  viewToggleText: {
    color: colors.text.dim,
    fontSize: ty.size.sm,
    fontWeight: ty.weight.semi,
  },
  viewToggleTextActive: {
    color: '#000',
  },

  // Map editor
  mapWrap: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  mapToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 600,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  mapHint: {
    color: colors.text.dim,
    fontSize: ty.size.sm,
    flex: 1,
  },
  autoArrangeBtn: {
    backgroundColor: colors.surface.raised,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent.gold,
  },
  autoArrangeText: {
    color: colors.accent.gold,
    fontSize: ty.size.sm,
    fontWeight: ty.weight.semi,
  },
  mapCanvasFrame: {
    borderWidth: 1,
    borderColor: colors.surface.raised,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  trayLabel: {
    color: colors.text.dim,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: ty.weight.semi,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  traySub: {
    color: colors.text.dim,
    fontSize: ty.size.sm,
    fontStyle: 'italic',
    alignSelf: 'flex-start',
  },
  tray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignSelf: 'flex-start',
    width: '100%',
  },
  trayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface.raised,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent.gold,
  },
  trayPillSeq: {
    color: colors.accent.gold,
    fontSize: ty.size.sm,
    fontWeight: ty.weight.heavy,
  },
  trayPillText: {
    color: colors.text.primary,
    fontSize: ty.size.sm,
    maxWidth: 160,
  },

  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyState:   { paddingVertical: 48, alignItems: 'center' },
  emptyText:    { color: colors.text.dim, fontSize: ty.size.base },

  // Table
  table: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  tableHead:        { backgroundColor: colors.surface.raised },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.inset,
  },
  tableRowAlt:      { backgroundColor: colors.surface.zebra },
  tableRowClickable:{ cursor: 'pointer' } as any,
  tableCell:        { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  tableHeadText:    { color: colors.text.faint,   fontSize: ty.size.xs, fontWeight: ty.weight.bold, letterSpacing: ty.tracking.eyebrow, textTransform: 'uppercase' },
  tableTitleText:   { color: colors.text.primary, fontSize: ty.size.base, fontWeight: ty.weight.medium },
  tableMetaText:    { color: colors.text.subtle,  fontSize: ty.size.md },
  tableSubText:     { color: colors.text.veryDim, fontSize: ty.size.sm, marginTop: 2 },
  tableSeqNum:      { color: colors.accent.gold,  fontSize: ty.size.md, fontWeight: ty.weight.heavy },

  tableCellSeq:         { width: 40 },
  tableCellStatus:      { width: 90 },
  tableCellTitle:       { flex: 1 },
  tableCellMeta:        { width: 100 },
  tableCellTransmission:{ width: 180 },
  tableCellActions:     { width: 100 },
  tableCellColor:       { width: 64, alignItems: 'center', justifyContent: 'center' },
  colorSwatchCell:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },

  // Mission colour picker modal
  colorPickerBackdrop:  { flex: 1, backgroundColor: colors.overlay.backdrop, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  colorPickerCard:      { width: '100%', maxWidth: 340, backgroundColor: colors.surface.overlay, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border.muted, padding: spacing['3xl'] },
  colorPickerHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  colorPickerTitle:     { color: colors.text.primary, fontSize: ty.size.lg, fontWeight: ty.weight.bold },
  colorPickerClose:     { color: colors.accent.gold, fontSize: ty.size.md, fontWeight: ty.weight.semi },
  colorPickerGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  colorPickerSwatch:    { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  colorPickerSwatchActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },

  assetThumbCol:        { width: 72 },
  assetActionsCol:      { width: 200 },
  assetThumb:           { width: 52, height: 40, borderRadius: 4, backgroundColor: colors.surface.inset },
  assetThumbPlaceholder:{ width: 52, height: 40, borderRadius: 4, backgroundColor: colors.surface.inset, alignItems: 'center', justifyContent: 'center' },
  assetThumbIcon:       { color: colors.text.ghost, fontSize: ty.size.md, fontWeight: ty.weight.bold },

  // Status badge
  badge:     { borderRadius: radii.xs, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: ty.size.eyebrow, fontWeight: ty.weight.heavy, letterSpacing: ty.tracking.eyebrow },

  // Action buttons (in detail page)
  activateBtn:     { backgroundColor: colors.status.successBg, borderRadius: radii.md, paddingVertical: 9, paddingHorizontal: spacing.xl },
  activateBtnText: { color: colors.status.successFg, fontSize: ty.size.md, fontWeight: ty.weight.bold },
  archiveBtn:      { backgroundColor: colors.surface.inset, borderRadius: radii.md, paddingVertical: 9, paddingHorizontal: spacing.xl, borderWidth: 1, borderColor: colors.border.strong },
  archiveBtnText:  { color: colors.text.muted, fontSize: ty.size.md },
  btnDisabled:     { opacity: 0.4 },

  // Form
  fieldWrap:  { marginBottom: spacing.xl },
  fieldRow:   { flexDirection: 'row', gap: spacing.xl, marginBottom: 0 },
  fieldLabel: {
    color: colors.text.subtle,
    fontSize: ty.size.xs,
    letterSpacing: ty.tracking.eyebrow,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fieldHint: {
    color: colors.text.ghost,
    fontSize: ty.size.sm,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.surface.inset,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.input,
    color: colors.text.primary,
    fontSize: ty.size.base,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },

  selectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectChip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    backgroundColor: colors.surface.inset,
    borderWidth: 1,
    borderColor: colors.border.input,
  },
  selectChipActive: {
    backgroundColor: colors.accent.goldWashStrong,
    borderColor: colors.accent.gold,
  },
  selectChipText:       { color: colors.text.subtle, fontSize: ty.size.chip },
  selectChipTextActive: { color: colors.accent.gold, fontWeight: ty.weight.bold },

  primaryBtn:     { backgroundColor: colors.accent.gold, borderRadius: radii.md, paddingVertical: 13, alignItems: 'center', marginTop: spacing.sm },
  primaryBtnText: { color: '#000', fontSize: ty.size.md, fontWeight: ty.weight.heavy, letterSpacing: ty.tracking.label },

  linkEdit:   { color: colors.accent.gold,    fontSize: ty.size.md, fontWeight: ty.weight.semi },
  linkDelete: { color: colors.status.dangerFg, fontSize: ty.size.md },

  // Asset picker
  assetPicker: {
    backgroundColor: colors.surface.inset,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.input,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetPickerPlaceholder:{ color: colors.text.placeholder, fontSize: ty.size.md, flex: 1 },
  assetPickerSelected:   { color: colors.accent.gold, fontSize: ty.size.base, fontWeight: ty.weight.semi },
  assetPickerType:       { color: colors.text.dim, fontSize: ty.size.xs, marginTop: 2 },
  assetPickerClear:      { paddingHorizontal: 10 },
  assetPickerClearText:  { color: colors.status.dangerFg, fontSize: ty.size.chip },

  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.inset,
  },
  assetRowSelected:      { backgroundColor: colors.accent.goldWashSoft },
  assetRowTitle:         { color: colors.text.primary, fontSize: ty.size.base, fontWeight: ty.weight.medium },
  assetRowSub:           { color: colors.text.dim, fontSize: ty.size.sm, marginTop: 2 },
  assetRowSelectedLabel: { color: colors.accent.gold, fontSize: ty.size.xl, fontWeight: ty.weight.bold },

  assetTypeTag:     { backgroundColor: colors.accent.goldWashActive, borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 3 },
  assetTypeTagText: { color: colors.accent.gold, fontSize: ty.size.eyebrow, fontWeight: ty.weight.heavy, letterSpacing: ty.tracking.eyebrow },

  transmissionTag:     { backgroundColor: colors.accent.goldWash, borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  transmissionTagText: { color: colors.accent.gold, fontSize: ty.size.sm, fontWeight: ty.weight.semi },

  // Upload panel
  uploadPanel: {
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing['3xl'],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  uploadPanelLabel: { color: colors.text.primary, fontSize: ty.size.lg, fontWeight: ty.weight.semi, marginBottom: spacing.lg },
  uploadBtn: {
    backgroundColor: colors.accent.gold,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.sm,
  },

  // Drop zone — empty + drag-over + disabled states share borders/padding;
  // dropZoneOver and dropZoneDisabled are overlay accents.
  dropZone: {
    borderWidth: 2,
    borderColor: colors.border.input,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    backgroundColor: colors.surface.inset,
  },
  dropZoneOver:      { backgroundColor: colors.accent.goldWashStrong, borderColor: colors.accent.gold },
  dropZoneDisabled:  { opacity: 0.55 },
  dropZoneHeadline:  { color: colors.text.primary, fontSize: ty.size.lg, fontWeight: ty.weight.semi },
  dropZoneSub:       { color: colors.text.dim, fontSize: ty.size.sm, marginTop: 6 },

  // Pending-file chip — replaces the drop zone after a file is staged.
  dropZonePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accent.goldWashStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent.goldBorderSoft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  dropZonePendingIcon: { color: colors.accent.gold, fontSize: ty.size.xl, fontWeight: ty.weight.bold, width: 20, textAlign: 'center' },
  dropZonePendingName: { color: colors.text.primary, fontSize: ty.size.base, fontWeight: ty.weight.semi },
  dropZonePendingMeta: { color: colors.text.dim, fontSize: ty.size.sm, marginTop: 2 },
  dropZoneRemove:      { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  dropZoneRemoveText:  { color: colors.status.dangerFg, fontSize: ty.size.chip, fontWeight: ty.weight.semi },

  // Send: Now / Later row — chip toggles plus the datetime input inline.
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  // Adventure chip picker
  chipPickerWrap:        { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chipPickerEmpty:       { color: colors.text.dim, fontSize: ty.size.chip },
  adventureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent.goldWashActive,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingLeft: spacing.md,
    paddingRight: 6,
  },
  adventureChipText:       { color: colors.accent.gold, fontSize: ty.size.chip, fontWeight: ty.weight.semi },
  adventureChipRemove:     { paddingHorizontal: 4, paddingVertical: 0 },
  adventureChipRemoveText: { color: colors.accent.gold, fontSize: ty.size.base, lineHeight: ty.size.base + 4 },
  adventureChipAdd: {
    borderWidth: 1,
    borderColor: colors.border.input,
    borderStyle: 'dashed',
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  adventureChipAddText:    { color: colors.text.muted, fontSize: ty.size.chip },
  adventurePickerRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.inset,
  },
  adventurePickerTitle:    { color: colors.text.primary, fontSize: ty.size.base, fontWeight: ty.weight.medium },
  adventurePickerMeta:     { color: colors.text.dim, fontSize: ty.size.sm, marginTop: 2 },

  // Upload progress bar — replaces the Upload button while a request is in flight.
  uploadProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  uploadProgressTrack: {
    flex: 1,
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.inset,
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: colors.accent.gold,
    borderRadius: radii.pill,
  },
  uploadProgressText: {
    color: colors.text.primary,
    fontSize: ty.size.md,
    fontWeight: ty.weight.heavy,
    minWidth: 44,
    textAlign: 'right',
  },

  // Preview lightbox
  // Preview lightbox styles are defined inline (portal-rendered, not RN StyleSheet)

  // Dialog (centered modal)
  dialogOverlay: { flex: 1, backgroundColor: colors.overlay.backdrop, alignItems: 'center', justifyContent: 'center', padding: 40 },
  dialogBox: {
    backgroundColor: colors.surface.raised,
    borderRadius: 4,
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border.muted,
    overflow: 'hidden',
  },
  dialogBoxWide: { maxWidth: 700 },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  dialogTitle:    { color: colors.text.primary, fontSize: ty.size.xl, fontWeight: ty.weight.bold },
  dialogCloseBtn: { paddingHorizontal: spacing.xs },
  dialogCloseText:{ color: colors.accent.gold, fontSize: ty.size.base, fontWeight: ty.weight.semi },
  dialogScroll:   { maxHeight: 560 },
  dialogContent:  { padding: spacing['3xl'] },

  // Asset edit modal — preview + metadata block
  editAssetMeta:     { flexDirection: 'row', gap: spacing.xl, marginBottom: spacing.xl },
  editThumbWrap:     { flexShrink: 0 },
  editThumb:         { width: 100, height: 100, borderRadius: radii.md, backgroundColor: colors.surface.inset },
  editThumbEmpty:    { alignItems: 'center', justifyContent: 'center' },
  editThumbEmptyText:{ color: colors.text.ghost, fontSize: ty.size.md, fontWeight: ty.weight.bold, letterSpacing: ty.tracking.eyebrow },
  editMetaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  editMetaLabel:     { color: colors.text.dim, fontSize: ty.size.xs, fontWeight: ty.weight.bold, letterSpacing: ty.tracking.eyebrow, textTransform: 'uppercase', width: 60 },
  editMetaValue:     { color: colors.text.secondary, fontSize: ty.size.md },
  editMetaUrl:       { flex: 1, fontSize: ty.size.sm, opacity: 0.5 },
  editDivider:       { height: 1, backgroundColor: colors.border.subtle, marginBottom: spacing.xl },
});
