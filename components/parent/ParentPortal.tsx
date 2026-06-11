import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Image,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ParentActions, currentStepOf, nextStepOf } from '../../src/usecases/parent';
import { Repos } from '../../src/usecases/repos';
import { showToast } from '../common/Toast';
import HelpFAQView from '../HelpFAQView';
import BrowseView from '../BrowseView';
import type { Kid, KidProgress, PendingCompletion, InviteCode } from '../../src/repositories/ParentRepository';

// ── Types ─────────────────────────────────────────────────────────────────────

type ParentTab = 'kids' | 'reviews' | 'menu' | 'account';
type Page = 'main' | 'kidDetail';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(isoString: string): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * "6d 14h" / "4h 12m" / "Expires soon" / "Expired"
 * Time remaining until `iso` from now (or from `nowMs` if supplied — passing
 * the tick from a setInterval re-render keeps the countdown live).
 */
function formatTimeUntil(iso: string, nowMs: number = Date.now()): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins <= 1 ? 'Expires soon' : `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h left`;
}

/**
 * True if the code has under 24h to go — used to flag the row red.
 */
function isExpiringSoon(iso: string, nowMs: number = Date.now()): boolean {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - nowMs;
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

function copyCode(code: string) {
  if (Platform.OS === 'web') {
    (navigator as any).clipboard?.writeText(code).catch(() => null);
  } else {
    Clipboard.setString(code);
  }
  showToast('Code copied!', 'success');
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

interface BottomNavProps {
  active: ParentTab;
  reviewCount: number;
  onNavigate: (tab: ParentTab) => void;
}

function ParentBottomNav({ active, reviewCount, onNavigate }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const tabs: { key: ParentTab; label: string }[] = [
    { key: 'kids', label: 'Kids' },
    { key: 'menu', label: 'Menu' },
    { key: 'account', label: 'Account' },
  ];

  return (
    <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.navItem}
            onPress={() => onNavigate(tab.key)}
            activeOpacity={0.7}
          >
            <View style={s.navIconArea}>
              {tab.key === 'kids' && <NavIconKids color={isActive ? '#C9943D' : 'rgba(255,255,255,0.4)'} />}
              {tab.key === 'reviews' && (
                <View>
                  <NavIconReviews color={isActive ? '#C9943D' : 'rgba(255,255,255,0.4)'} />
                  {reviewCount > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{reviewCount > 99 ? '99+' : reviewCount}</Text>
                    </View>
                  )}
                </View>
              )}
              {tab.key === 'menu' && <NavIconMenu color={isActive ? '#C9943D' : 'rgba(255,255,255,0.4)'} />}
              {tab.key === 'account' && <NavIconAccount color={isActive ? '#C9943D' : 'rgba(255,255,255,0.4)'} />}
            </View>
            <Text style={[s.navLabel, isActive && s.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Simple inline SVG-like icon placeholders using React Native shapes
function NavIconKids({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <View style={{ width: 14, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function NavIconReviews({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 18, height: 14, borderRadius: 3, borderWidth: 2, borderColor: color }} />
      <View style={{ position: 'absolute', bottom: 2, width: 8, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

function NavIconAccount({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 18, height: 6, borderRadius: 3, borderWidth: 2, borderColor: color }} />
    </View>
  );
}

function NavIconMenu({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${pct}%` as any }]} />
    </View>
  );
}

// ── Completion card ────────────────────────────────────────────────────────────

interface CompletionCardProps {
  item: PendingCompletion;
  showKidName?: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  processing: boolean;
}

function CompletionCard({ item, showKidName, onApprove, onReject, processing }: CompletionCardProps) {
  const [photoVisible, setPhotoVisible] = useState(false);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          {showKidName && item.kid?.name && (
            <Text style={s.cardKidName}>{item.kid.name}</Text>
          )}
          <Text style={s.cardStepTitle}>{item.step?.title ?? 'Step'}</Text>
          <Text style={s.cardTime}>{timeAgo(item.submitted_at)}</Text>
        </View>
        {item.proof_url && (
          <TouchableOpacity onPress={() => setPhotoVisible(true)} activeOpacity={0.8}>
            <Image
              source={{ uri: item.proof_url }}
              style={s.proofThumb}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
        {!item.proof_url && (
          <View style={s.noProof}>
            <Text style={s.noProofText}>No{'\n'}Photo</Text>
          </View>
        )}
      </View>

      <View style={s.cardActions}>
        <TouchableOpacity
          style={[s.actionBtn, s.rejectBtn, processing && s.btnDisabled]}
          onPress={() => onReject(item.id)}
          disabled={processing}
          activeOpacity={0.7}
        >
          <Text style={s.rejectBtnText}>✕  Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.approveBtn, processing && s.btnDisabled]}
          onPress={() => onApprove(item.id)}
          disabled={processing}
          activeOpacity={0.7}
        >
          {processing
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.approveBtnText}>Approve</Text>}
        </TouchableOpacity>
      </View>

      {/* Full-screen photo modal */}
      {item.proof_url && (
        <Modal visible={photoVisible} transparent animationType="fade" onRequestClose={() => setPhotoVisible(false)}>
          <TouchableOpacity
            style={s.photoModal}
            activeOpacity={1}
            onPress={() => setPhotoVisible(false)}
          >
            <Image
              source={{ uri: item.proof_url }}
              style={s.photoFull}
              resizeMode="contain"
            />
            <Text style={s.photoClose}>Tap anywhere to close</Text>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

// ── Add Kid modal ─────────────────────────────────────────────────────────────

interface AddKidModalProps {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function AddKidModal({ visible, onClose, onAdded }: AddKidModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep]         = useState<'form' | 'code'>('form');
  const [kidName, setKidName]   = useState('');
  const [invite, setInvite]     = useState<InviteCode | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const reset = () => {
    setStep('form');
    setKidName('');
    setInvite(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    if (!kidName.trim()) {
      setError("Enter the kid's name first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await ParentActions.generateInviteCode(kidName.trim());
      setInvite(result);
      setStep('code');
      // Reload kids list after a short delay (the kid doesn't exist yet, but
      // this primes any cache so the list is fresh when the kid claims).
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!invite) return;
    if (Platform.OS === 'web') {
      (navigator as any).clipboard?.writeText(invite.code).catch(() => null);
    } else {
      Clipboard.setString(invite.code);
    }
    showToast('Code copied!', 'success');
  };

  const handleDone = () => {
    reset();
    onAdded(); // parent will reload kids
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 40 }]}>
          {/* Handle bar */}
          <View style={s.modalHandle} />

          {step === 'form' ? (
            <>
              <Text style={s.modalTitle}>Add a Kid</Text>
              <Text style={s.modalSub}>
                Enter your kid's name. A one-time code will be generated — give it to them
                to set up their account.
              </Text>

              <TextInput
                style={s.modalInput}
                value={kidName}
                onChangeText={(t) => { setKidName(t); setError(null); }}
                placeholder="Kid's name"
                placeholderTextColor="rgba(255,255,255,0.25)"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleGenerate}
              />

              {error ? <Text style={s.modalError}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.modalBtn, loading && s.btnDisabled]}
                onPress={handleGenerate}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={s.modalBtnText}>Generate Code</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.modalCancelBtn} onPress={handleClose} activeOpacity={0.7}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.modalTitle}>Code Ready</Text>
              <Text style={s.modalSub}>
                Give {invite?.kid_name ?? 'your kid'} this code. They tap "Kid" in the app and
                enter it once — then they're always signed in.
              </Text>

              <TouchableOpacity style={s.codeBox} onPress={handleCopy} activeOpacity={0.85}>
                <Text style={s.codeText}>{invite?.code}</Text>
                <Text style={s.codeCopyHint}>Tap to copy</Text>
              </TouchableOpacity>

              <Text style={s.codeExpiry}>
                Expires in 7 days. One-time use.
              </Text>

              <TouchableOpacity style={s.modalBtn} onPress={handleDone} activeOpacity={0.8}>
                <Text style={s.modalBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Pending Invites row ───────────────────────────────────────────────────────

interface PendingInviteRowProps {
  invite: InviteCode;
  nowMs: number;
  busy: boolean;
  onRegenerate: (invite: InviteCode) => void;
  onRevoke: (invite: InviteCode) => void;
}

function PendingInviteRow({ invite, nowMs, busy, onRegenerate, onRevoke }: PendingInviteRowProps) {
  const expiring = isExpiringSoon(invite.expires_at, nowMs);

  return (
    <View style={s.inviteRow}>
      <View style={s.inviteHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.inviteLabel}>ACCESS CODE</Text>
          <Text style={s.inviteKidName}>{invite.kid_name || 'Unnamed kid'}</Text>
        </View>
        <Text style={[s.inviteExpiry, expiring && s.inviteExpiryUrgent]}>
          {formatTimeUntil(invite.expires_at, nowMs)}
        </Text>
      </View>

      <TouchableOpacity
        style={s.inviteCodeBox}
        onPress={() => copyCode(invite.code)}
        activeOpacity={0.8}
      >
        <Text style={s.inviteCodeText}>{invite.code}</Text>
        <Text style={s.inviteCodeHint}>Tap to copy</Text>
      </TouchableOpacity>

      <View style={s.inviteActions}>
        <TouchableOpacity
          style={[s.inviteActionBtn, s.inviteRevokeBtn, busy && s.btnDisabled]}
          onPress={() => onRevoke(invite)}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={s.inviteRevokeText}>Revoke</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.inviteActionBtn, s.inviteRegenBtn, busy && s.btnDisabled]}
          onPress={() => onRegenerate(invite)}
          disabled={busy}
          activeOpacity={0.7}
        >
          {busy
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={s.inviteRegenText}>↻ New Code</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Kids tab ──────────────────────────────────────────────────────────────────

interface KidsTabProps {
  kids: Kid[];
  pendingCodes: InviteCode[];
  loading: boolean;
  onRefresh: () => void;
  onSelectKid: (kid: Kid) => void;
  onRegenerate: (opts: { kidId?: number; kidName?: string }) => Promise<void>;
  onRevoke: (code: string) => Promise<void>;
}

function KidsTab({
  kids,
  pendingCodes,
  loading,
  onRefresh,
  onSelectKid,
  onRegenerate,
  onRevoke,
}: KidsTabProps) {
  const insets = useSafeAreaInsets();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  // Re-render the countdown every minute so "expires in" stays current
  // without the parent having to refresh manually.
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleRegenerate = async (invite: InviteCode) => {
    setBusyCode(invite.code);
    try {
      await onRegenerate({
        kidId: invite.kid_id ?? undefined,
        kidName: invite.kid_name,
      });
      showToast('New code generated', 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to regenerate', 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const handleRevoke = async (invite: InviteCode) => {
    setBusyCode(invite.code);
    try {
      await onRevoke(invite.code);
      showToast('Code revoked', 'info');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to revoke', 'error');
    } finally {
      setBusyCode(null);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color="#C9943D" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#C9943D" />}
      >
        <View style={s.kidsHeader}>
          <View>
            <Text style={s.screenTitle}>Your Kids</Text>
            <Text style={s.screenSubtitle}>TAP A KID TO SEE THEIR PROGRESS</Text>
          </View>
          <TouchableOpacity
            style={s.addKidBtn}
            onPress={() => setAddModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={s.addKidBtnText}>+ Add Kid</Text>
          </TouchableOpacity>
        </View>

        {/* ── Pending Invites — codes the parent has issued but a kid hasn't claimed yet ── */}
        {pendingCodes.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>PENDING INVITES ({pendingCodes.length})</Text>
            {pendingCodes.map((invite) => (
              <PendingInviteRow
                key={invite.code}
                invite={invite}
                nowMs={nowMs}
                busy={busyCode === invite.code}
                onRegenerate={handleRegenerate}
                onRevoke={handleRevoke}
              />
            ))}
          </View>
        )}

        {/* ── Linked Kids ── */}
        {(pendingCodes.length > 0 || kids.length > 0) && (
          <Text style={[s.sectionLabel, { marginTop: pendingCodes.length > 0 ? 8 : 0 }]}>
            LINKED KIDS ({kids.length})
          </Text>
        )}

        {kids.length === 0 && pendingCodes.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No kids linked to your account yet.</Text>
            <Text style={s.emptyTextSmall}>Tap "Add Kid" to generate a code for them.</Text>
          </View>
        )}

        {kids.map((kid) => (
          <TouchableOpacity
            key={kid.id}
            style={s.kidRow}
            onPress={() => onSelectKid(kid)}
            activeOpacity={0.75}
          >
            <View style={s.kidAvatar}>
              <Text style={s.kidAvatarText}>{initials(kid.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.kidName}>{kid.name ?? 'Unknown'}</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <AddKidModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdded={onRefresh}
      />
    </>
  );
}

// ── Kid detail ─────────────────────────────────────────────────────────────────

interface KidDetailProps {
  kid: Kid;
  onBack: () => void;
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  processingId: number | null;
}

function KidDetail({ kid, onBack, onApprove, onReject, processingId }: KidDetailProps) {
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<KidProgress | null>(null);
  const [completions, setCompletions] = useState<PendingCompletion[]>([]);
  const [activeCode, setActiveCode] = useState<InviteCode | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live countdown tick.
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [prog, all, codes] = await Promise.all([
        ParentActions.loadProgress(kid.id),
        ParentActions.loadPendingCompletions(),
        ParentActions.listInviteCodes().catch(() => [] as InviteCode[]),
      ]);
      setProgress(prog);
      // Filter to only this kid's pending completions
      setCompletions(all.filter((c) => c.kid?.id === kid.id));
      // First active code that's bound to this kid (kid_id matches).
      setActiveCode(codes.find((c) => c.kid_id === kid.id) ?? null);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load progress', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kid.id]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const handleGenerateCode = async () => {
    setCodeBusy(true);
    try {
      const newCode = await ParentActions.regenerateInviteCode({
        kidId: kid.id,
        kidName: kid.name,
      });
      setActiveCode(newCode);
      showToast('Sign-in code ready', 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to generate code', 'error');
    } finally {
      setCodeBusy(false);
    }
  };

  const adv = progress?.activeAdventure ?? null;
  const nodes = progress?.mapNodes ?? [];
  const currentStep = currentStepOf(nodes);
  const nextStep = nextStepOf(nodes);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[s.detailHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.detailTitle}>{kid.name ?? kid.email}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#C9943D" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#C9943D" />}
        >
          {/* Sign-In Code — for re-issuing a code so the kid can log in on a new device */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>SIGN-IN CODE</Text>
            {activeCode ? (
              <View style={s.inviteRow}>
                <View style={s.inviteHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inviteLabel}>ACTIVE CODE</Text>
                  </View>
                  <Text style={[
                    s.inviteExpiry,
                    isExpiringSoon(activeCode.expires_at, nowMs) && s.inviteExpiryUrgent,
                  ]}>
                    {formatTimeUntil(activeCode.expires_at, nowMs)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.inviteCodeBox}
                  onPress={() => copyCode(activeCode.code)}
                  activeOpacity={0.8}
                >
                  <Text style={s.inviteCodeText}>{activeCode.code}</Text>
                  <Text style={s.inviteCodeHint}>Tap to copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.inviteActionBtn, s.inviteRegenBtn, codeBusy && s.btnDisabled]}
                  onPress={handleGenerateCode}
                  disabled={codeBusy}
                  activeOpacity={0.7}
                >
                  {codeBusy
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.inviteRegenText}>↻ Generate New Code</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.emptyText}>
                  No active code. Generate one so {kid.name ?? 'this kid'} can sign in on a new device.
                </Text>
                <TouchableOpacity
                  style={[s.inviteActionBtn, s.inviteRegenBtn, codeBusy && s.btnDisabled, { marginTop: 12 }]}
                  onPress={handleGenerateCode}
                  disabled={codeBusy}
                  activeOpacity={0.7}
                >
                  {codeBusy
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.inviteRegenText}>Generate Sign-In Code</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Adventure progress */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>CURRENT ADVENTURE</Text>
            {adv ? (
              <View style={s.card}>
                <Text style={s.advTitle}>{adv.title}</Text>
                <View style={s.progressRow}>
                  <ProgressBar value={adv.progress} />
                  <Text style={s.progressPct}>{adv.progress}%</Text>
                </View>
                <Text style={s.progressDetail}>
                  {adv.completedSteps} of {adv.totalSteps} steps complete
                </Text>
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.emptyText}>No active mission right now.</Text>
              </View>
            )}
          </View>

          {/* Where they are on the hunt — current spot, next stop, map link */}
          {adv && nodes.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>WHERE THEY ARE</Text>
              <View style={s.card}>
                {currentStep ? (
                  <>
                    <View style={s.whereRow}>
                      <Text style={s.whereMarker}>📍</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.whereStepTitle}>
                          {currentStep.sequence}. {currentStep.title}
                        </Text>
                        <Text
                          style={[
                            s.whereStatus,
                            currentStep.status === 'pending' && s.whereStatusPending,
                            currentStep.status === 'rejected' && s.whereStatusRejected,
                          ]}
                        >
                          {currentStep.status === 'pending'
                            ? 'Submitted — waiting on your review'
                            : currentStep.status === 'rejected'
                            ? 'Needs another try'
                            : 'Exploring this stop'}
                        </Text>
                      </View>
                    </View>
                    {nextStep && (
                      <View style={[s.whereRow, s.whereRowNext]}>
                        <Text style={s.whereMarker}>›</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.whereNextLabel}>UP NEXT</Text>
                          <Text style={s.whereNextTitle}>
                            {nextStep.sequence}. {nextStep.title}
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={s.emptyText}>
                    All steps complete — mission finished! 🎉
                  </Text>
                )}
                <Text style={s.mapHint}>
                  See the full map under Menu › Hunt.
                </Text>
              </View>
            </View>
          )}

          {/* Pending reviews for this kid */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>PENDING REQUESTS ({completions.length})</Text>
            {completions.length === 0 && (
              <View style={s.card}>
                <Text style={s.emptyText}>No pending requests — all caught up!</Text>
              </View>
            )}
            {completions.map((c) => (
              <CompletionCard
                key={c.id}
                item={c}
                showKidName={false}
                onApprove={onApprove}
                onReject={onReject}
                processing={processingId === c.id}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Reviews tab ────────────────────────────────────────────────────────────────

interface ReviewsTabProps {
  completions: PendingCompletion[];
  loading: boolean;
  onRefresh: () => void;
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  processingId: number | null;
}

function ReviewsTab({ completions, loading, onRefresh, onApprove, onReject, processingId }: ReviewsTabProps) {
  const insets = useSafeAreaInsets();

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color="#C9943D" /></View>;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#C9943D" />}
    >
      <Text style={s.screenTitle}>Pending Requests</Text>
      <Text style={s.screenSubtitle}>{completions.length} AWAITING YOUR APPROVAL</Text>

      {completions.length === 0 && (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>No pending requests — all caught up!</Text>
        </View>
      )}

      {completions.map((c) => (
        <CompletionCard
          key={c.id}
          item={c}
          showKidName={true}
          onApprove={onApprove}
          onReject={onReject}
          processing={processingId === c.id}
        />
      ))}
    </ScrollView>
  );
}

// ── Account tab ────────────────────────────────────────────────────────────────

interface AccountTabProps {
  onSignOut: () => void;
}

function AccountTab({ onSignOut }: AccountTabProps) {
  const insets = useSafeAreaInsets();
  const [showFaq, setShowFaq] = useState(false);

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Are you sure you want to sign out?')) return;
      try { await Repos.auth.logout(); } catch { /* best-effort */ }
      onSignOut();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try { await Repos.auth.logout(); } catch { /* best-effort */ }
            onSignOut();
          },
        },
      ]);
    }
  };

  if (showFaq) {
    return <HelpFAQView role="parent" onBack={() => setShowFaq(false)} />;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
    >
      <Text style={s.screenTitle}>Account</Text>
      <Text style={s.screenSubtitle}>PARENT SETTINGS</Text>

      <View style={s.card}>
        <Text style={s.settingsRowLabel}>Role</Text>
        <Text style={s.settingsRowValue}>Parent</Text>
      </View>

      <TouchableOpacity style={s.card} onPress={() => setShowFaq(true)} activeOpacity={0.75}>
        <Text style={s.settingsRowLabel}>Help & FAQ</Text>
        <Text style={s.settingsRowValue}>What parents can do</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.card, s.signOutCard]} onPress={handleSignOut} activeOpacity={0.75}>
        <Text style={s.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export interface ParentPortalProps {
  onExit: () => void;
}

export default function ParentPortal({ onExit }: ParentPortalProps) {
  const insets = useSafeAreaInsets();

  const [tab, setTab]       = useState<ParentTab>('kids');
  const [page, setPage]     = useState<Page>('main');
  const [selectedKid, setSelectedKid] = useState<Kid | null>(null);

  const [kids, setKids]               = useState<Kid[]>([]);
  const [completions, setCompletions] = useState<PendingCompletion[]>([]);
  const [pendingCodes, setPendingCodes] = useState<InviteCode[]>([]);
  const [kidsLoading, setKidsLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [processingId, setProcessingId] = useState<number | null>(null);

  // ── data loading ──────────────────────────────────────────────────────────

  const loadCodes = useCallback(async () => {
    try {
      const data = await ParentActions.listInviteCodes();
      setPendingCodes(data);
    } catch (e: any) {
      // Quietly fail — not the primary content of the screen.
      console.warn('Failed to load invite codes:', e?.message ?? e);
    }
  }, []);

  const loadKids = useCallback(async () => {
    try {
      setKidsLoading(true);
      const [kidsData] = await Promise.all([
        ParentActions.loadKids(),
        loadCodes(),
      ]);
      setKids(kidsData);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load kids', 'error');
    } finally {
      setKidsLoading(false);
    }
  }, [loadCodes]);

  const loadCompletions = useCallback(async () => {
    try {
      setReviewsLoading(true);
      const data = await ParentActions.loadPendingCompletions();
      setCompletions(data);
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to load reviews', 'error');
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKids();
    loadCompletions();
  }, [loadKids, loadCompletions]);

  // ── invite code actions ───────────────────────────────────────────────────

  const handleRegenerateCode = useCallback(async (opts: { kidId?: number; kidName?: string }) => {
    await ParentActions.regenerateInviteCode(opts);
    await loadCodes();
  }, [loadCodes]);

  const handleRevokeCode = useCallback(async (code: string) => {
    await ParentActions.revokeInviteCode(code);
    await loadCodes();
  }, [loadCodes]);

  // ── approve / reject ──────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: number) => {
    setProcessingId(id);
    try {
      await ParentActions.approveCompletion(id);
      showToast('Approved!', 'success');
      // Remove from local list immediately
      setCompletions((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to approve', 'error');
    } finally {
      setProcessingId(null);
    }
  }, []);

  const handleReject = useCallback(async (id: number) => {
    // Show reason prompt on web/native
    const doReject = async (reason?: string) => {
      setProcessingId(id);
      try {
        await ParentActions.rejectCompletion(id, reason);
        showToast('Rejected', 'info');
        setCompletions((prev) => prev.filter((c) => c.id !== id));
      } catch (e: any) {
        showToast(e?.message ?? 'Failed to reject', 'error');
      } finally {
        setProcessingId(null);
      }
    };

    if (Platform.OS === 'web') {
      // Web: use browser prompt as a simple reason dialog
      const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
      if (reason === null) return; // user cancelled the prompt
      await doReject(reason || undefined);
    } else {
      Alert.prompt(
        'Reject Submission',
        'Add a reason (optional):',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reject', style: 'destructive', onPress: (reason?: string) => doReject(reason || undefined) },
        ],
        'plain-text',
      );
    }
  }, []);

  // ── navigation ─────────────────────────────────────────────────────────────

  const handleSelectKid = (kid: Kid) => {
    setSelectedKid(kid);
    setPage('kidDetail');
  };

  const handleBack = () => {
    setPage('main');
    setSelectedKid(null);
    // Refresh completions list when returning from kid detail
    loadCompletions();
  };

  const handleTabChange = (t: ParentTab) => {
    setPage('main');
    setSelectedKid(null);
    setTab(t);
    if (t === 'reviews') loadCompletions();
    if (t === 'kids') loadKids();
  };

  // ── render ─────────────────────────────────────────────────────────────────

  // Kid detail page sits on top of everything (full-screen, own header)
  if (page === 'kidDetail' && selectedKid) {
    return (
      <View style={s.root}>
        <KidDetail
          kid={selectedKid}
          onBack={handleBack}
          onApprove={handleApprove}
          onReject={handleReject}
          processingId={processingId}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={[s.topbar, { paddingTop: insets.top + 8 }]}>
        <Text style={s.topbarTitle}>Hobgoblin Hunt</Text>
        {completions.length > 0 && (
          <TouchableOpacity
            style={s.reviewPill}
            onPress={() => handleTabChange('reviews')}
            activeOpacity={0.8}
          >
            <Text style={s.reviewPillText}>{completions.length} pending</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === 'kids' && (
          <KidsTab
            kids={kids}
            pendingCodes={pendingCodes}
            loading={kidsLoading}
            onRefresh={loadKids}
            onSelectKid={handleSelectKid}
            onRegenerate={handleRegenerateCode}
            onRevoke={handleRevokeCode}
          />
        )}
        {tab === 'reviews' && (
          <ReviewsTab
            completions={completions}
            loading={reviewsLoading}
            onRefresh={loadCompletions}
            onApprove={handleApprove}
            onReject={handleReject}
            processingId={processingId}
          />
        )}
        {tab === 'account' && <AccountTab onSignOut={onExit} />}
        {tab === 'menu' && <BrowseView initialTab="menu" parentMode />}
      </View>

      <ParentBottomNav
        active={tab}
        reviewCount={completions.length}
        onNavigate={handleTabChange}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
// Kids-view design canon: black/near-black surfaces, red primary action,
// cream code highlight, gold accent labels, square-ish corners (radius 4),
// serif headings + code.

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Top bar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#000',
  },
  topbarTitle: {
    fontSize: 22,
    fontFamily: 'serif',
    fontWeight: '400',
    color: '#F6E3AE',
    letterSpacing: 1,
  },
  reviewPill: {
    backgroundColor: '#E23B2E',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reviewPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Bottom nav
  nav: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navIconArea: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  navLabelActive: {
    color: '#C9943D',
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E23B2E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  // Shared layout
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  screenTitle: {
    fontSize: 30,
    fontFamily: 'serif',
    fontWeight: '400',
    color: '#fff',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#C9943D',
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 10,
  },

  // Cards
  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardKidName: {
    fontSize: 12,
    color: '#C9943D',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 2,
  },
  cardStepTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  cardTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  proofThumb: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: '#000',
  },
  noProof: {
    width: 64,
    height: 64,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProofText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(226,59,46,0.6)',
  },
  rejectBtnText: {
    color: '#E23B2E',
    fontSize: 14,
    fontWeight: '700',
  },
  approveBtn: {
    backgroundColor: '#E23B2E',
  },
  approveBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Photo modal
  photoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFull: {
    width: '90%',
    height: '70%',
  },
  photoClose: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 20,
    letterSpacing: 1,
  },

  // Add Kid modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    ...Platform.select({
      web: {
        width: '100%',
        maxWidth: 428,
        marginHorizontal: 'auto',
      },
    }),
  },
  modalSheet: {
    width: '100%',
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingTop: 12,
    ...Platform.select({
      web: {
        maxWidth: 428,
      },
    }),
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: 'serif',
    color: '#fff',
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  modalError: {
    color: '#E23B2E',
    fontSize: 13,
    marginBottom: 12,
  },
  modalBtn: {
    backgroundColor: '#C9943D',
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  modalCancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },

  // Code box (modal "Code Ready")
  codeBox: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(201,148,61,0.4)',
    borderRadius: 4,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  codeText: {
    fontFamily: 'serif',
    fontSize: 36,
    letterSpacing: 8,
    color: '#F6E3AE',
    fontWeight: '700',
  },
  codeCopyHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
    letterSpacing: 1,
  },
  codeExpiry: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Invite rows (pending invites + sign-in code)
  inviteRow: {
    backgroundColor: '#0a0a0a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteLabel: {
    fontSize: 10,
    color: '#C9943D',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  inviteKidName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginTop: 2,
  },
  inviteExpiry: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  inviteExpiryUrgent: {
    color: '#E23B2E',
  },
  inviteCodeBox: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(201,148,61,0.4)',
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteCodeText: {
    fontFamily: 'serif',
    fontSize: 26,
    letterSpacing: 5,
    color: '#F6E3AE',
    fontWeight: '700',
  },
  inviteCodeHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 6,
    letterSpacing: 1,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  inviteRevokeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  inviteRevokeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  inviteRegenBtn: {
    backgroundColor: '#C9943D',
  },
  inviteRegenText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Kids tab
  kidsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  addKidBtn: {
    backgroundColor: '#C9943D',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
  },
  addKidBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  emptyTextSmall: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 6,
  },
  kidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  kidAvatar: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(201,148,61,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidAvatarText: {
    color: '#F6E3AE',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'serif',
  },
  kidName: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '600',
  },
  chevron: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '300',
  },

  // Kid detail
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 60,
  },
  backBtnText: {
    color: '#C9943D',
    fontSize: 16,
    fontWeight: '600',
  },
  detailTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'serif',
    color: '#fff',
  },
  advTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#E23B2E',
  },
  progressPct: {
    fontSize: 14,
    color: '#F6E3AE',
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  progressDetail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 10,
  },

  // Account tab
  settingsRowLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  settingsRowValue: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  signOutCard: {
    alignItems: 'center',
  },
  signOutText: {
    color: '#C9943D',
    fontSize: 16,
    fontWeight: '700',
  },

  // "Where they are" (kid detail)
  whereRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  whereRowNext: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  whereMarker: {
    fontSize: 14,
    color: '#C9943D',
    width: 20,
    textAlign: 'center',
  },
  whereStepTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  whereStatus: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },
  whereStatusPending: {
    color: '#f59e0b',
  },
  whereStatusRejected: {
    color: '#ef4444',
  },
  whereNextLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  whereNextTitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  mapHint: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
      