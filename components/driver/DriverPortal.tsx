import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

// Conditionally import MapView only on native platforms (not web)
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
  } catch (e) {
    console.warn('react-native-maps not available:', e);
  }
}
import { useCurrentUser, DriverActions } from '../../src/usecases';
import type { DriverOfferDto, DriverActiveDeliveryDto, DriverEarningsDto, DriverPlaceDto } from '../../src/contracts/dto';
import { safeGetJson, safeSetJson } from '../../utils/storage';
import HelpFAQView from '../HelpFAQView';

type Page = 'onboarding' | 'home' | 'earnings' | 'settings';

const POLL_MS = 10000;

function errorText(e: any, fallback: string): string {
  return (e && typeof e.message === 'string' && e.message) || fallback;
}

function directionsUrl(p: DriverPlaceDto): string | null {
  if (p.lat != null && p.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  }
  if (p.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`;
  }
  return null;
}

function openDirections(p: DriverPlaceDto) {
  const url = directionsUrl(p);
  if (url) Linking.openURL(url).catch(() => {});
}

function DriverBottomNav({ current, onGo, bottomInset }: { current: Page; onGo: (p: Page) => void; bottomInset: number }) {
  const items: Array<{ id: Page; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(10, bottomInset) }]}>
      {items.map((it) => {
        const active = current === it.id;
        return (
          <TouchableOpacity key={it.id} onPress={() => onGo(it.id)} activeOpacity={0.85} style={styles.bottomNavItem}>
            <Text style={[styles.bottomNavText, active && styles.bottomNavTextActive]}>{it.label}</Text>
            <View style={[styles.bottomNavIndicator, active && styles.bottomNavIndicatorActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BottomSheet({ children, bottomOffset }: { children: React.ReactNode; bottomOffset: number }) {
  return (
    <View style={[styles.sheet, { bottom: bottomOffset }]}>
      <View style={styles.sheetHandle} />
      <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
        {children}
      </ScrollView>
    </View>
  );
}

function Notice({ text, tone }: { text: string | null; tone: 'info' | 'error' }) {
  if (!text) return null;
  return <Text style={[styles.notice, tone === 'error' && styles.noticeError]}>{text}</Text>;
}

function PendingApproval({ onRefresh, checking }: { onRefresh: () => void; checking: boolean }) {
  return (
    <View>
      <Text style={styles.cardTitle}>Account under review</Text>
      <Text style={styles.metric}>
        Thanks for signing up to deliver. The Hobgoblin team reviews every driver before they can see orders.
        You'll be able to go online as soon as you're approved.
      </Text>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onRefresh} activeOpacity={0.85} disabled={checking}>
        {checking ? <ActivityIndicator color="#C9943D" /> : <Text style={styles.secondaryBtnText}>Check status</Text>}
      </TouchableOpacity>
    </View>
  );
}

function OffersSheet({
  online,
  offers,
  busy,
  onGoOnline,
  onDecline,
  onAccept,
}: {
  online: boolean;
  offers: DriverOfferDto[];
  busy: boolean;
  onGoOnline: () => void;
  onDecline: (offerId: number) => void;
  onAccept: (offerId: number) => void;
}) {
  if (!online) {
    return (
      <View>
        <Text style={styles.cardTitle}>You're offline</Text>
        <Text style={styles.metric}>Go online to start receiving delivery offers from nearby restaurants.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onGoOnline} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Go Online</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const top = offers[0] ?? null;

  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Offers</Text>
        <Text style={styles.cardSubtitle}>{offers.length} available</Text>
      </View>

      {!top ? (
        <View style={styles.searchingRow}>
          <ActivityIndicator color="#C9943D" size="small" />
          <Text style={styles.emptyTextInline}>Looking for orders near you…</Text>
        </View>
      ) : (
        <View style={styles.offerCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.offerPayout}>${top.payout.toFixed(2)}</Text>
            <Text style={styles.badge}>{top.itemCount} item{top.itemCount === 1 ? '' : 's'}</Text>
          </View>
          <View style={{ height: 8 }} />
          <Text style={styles.cardSubtitle}>Pickup</Text>
          <Text style={styles.offerPickup}>{top.restaurantName}</Text>
          {!!top.pickup.address && <Text style={styles.metric}>{top.pickup.address}</Text>}
          <Text style={styles.hint}>The drop-off address appears after you accept.</Text>

          <View style={styles.rowGap}>
            <TouchableOpacity style={styles.secondaryBtnInline} onPress={() => onDecline(top.id)} activeOpacity={0.85} disabled={busy}>
              <Text style={styles.secondaryBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtnInline} onPress={() => onAccept(top.id)} activeOpacity={0.85} disabled={busy}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Accept</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function ActiveDeliveryCard({
  delivery,
  busy,
  onPickup,
  onComplete,
  onRelease,
}: {
  delivery: DriverActiveDeliveryDto;
  busy: boolean;
  onPickup: () => void;
  onComplete: () => void;
  onRelease: () => void;
}) {
  const atPickupStage = delivery.status === 'accepted';
  const ready = delivery.orderState === 'ready';
  const callUrl = delivery.restaurantPhone ? `tel:${delivery.restaurantPhone.replace(/[^0-9+]/g, '')}` : null;

  if (atPickupStage) {
    return (
      <View>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Head to pickup</Text>
          <Text style={styles.badge}>${delivery.payout.toFixed(2)}</Text>
        </View>
        <Text style={styles.offerPickup}>{delivery.restaurantName}</Text>
        <Text style={styles.metric}>{delivery.pickup.address || 'No address on file — call the restaurant.'}</Text>
        <Text style={[styles.statusLine, ready && styles.statusLineReady]}>
          {ready ? 'Order is ready for pickup' : 'The kitchen is preparing this order'}
        </Text>

        <View style={{ height: 8 }} />
        <Text style={styles.cardSubtitle}>Order #{delivery.orderId}</Text>
        {delivery.items.map((it, idx) => (
          <Text key={idx} style={styles.itemLine}>
            {it.quantity} x {it.name}
          </Text>
        ))}

        <View style={styles.rowGap}>
          <TouchableOpacity
            style={styles.secondaryBtnInline}
            onPress={() => openDirections(delivery.pickup)}
            activeOpacity={0.85}
            disabled={!directionsUrl(delivery.pickup)}
          >
            <Text style={styles.secondaryBtnText}>Directions</Text>
          </TouchableOpacity>
          {callUrl && (
            <TouchableOpacity style={styles.secondaryBtnInline} onPress={() => Linking.openURL(callUrl).catch(() => {})} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Call store</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[styles.primaryBtn, !ready && styles.primaryBtnMuted]} onPress={onPickup} activeOpacity={0.85} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Confirm pickup</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={onRelease} activeOpacity={0.85} disabled={busy}>
          <Text style={styles.linkBtnText}>Unassign this delivery</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>
          Deliver to {delivery.dropoff.customerName || 'customer'}
        </Text>
        <Text style={styles.badge}>${delivery.payout.toFixed(2)}</Text>
      </View>
      <Text style={styles.offerPickup}>{delivery.dropoff.address || 'No address provided'}</Text>
      {!!delivery.dropoff.notes && (
        <>
          <View style={{ height: 6 }} />
          <Text style={styles.cardSubtitle}>Customer note</Text>
          <Text style={styles.metric}>{delivery.dropoff.notes}</Text>
        </>
      )}
      <Text style={styles.hint}>Picked up from {delivery.restaurantName} · Order #{delivery.orderId}</Text>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => openDirections(delivery.dropoff)}
        activeOpacity={0.85}
        disabled={!directionsUrl(delivery.dropoff)}
      >
        <Text style={styles.secondaryBtnText}>Directions</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryBtn} onPress={onComplete} activeOpacity={0.85} disabled={busy}>
        {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Complete delivery</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function DriverPortal({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const bottomNavHeight = 64 + Math.max(10, insets.bottom);

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('onboarding');
  const [approved, setApproved] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferDto[]>([]);
  const [active, setActive] = useState<DriverActiveDeliveryDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 41.885,
    longitude: -87.7845,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const activeRef = useRef<DriverActiveDeliveryDto | null>(null);
  activeRef.current = active;

  const driverEmail = currentUser?.email ?? '';

  const refreshState = useCallback(async () => {
    const state = await DriverActions.getState();
    setApproved(state.approved);
    setOnline(state.online);
    return state;
  }, []);

  // Load driver state
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshState();
        const a = await DriverActions.getActiveDelivery().catch(() => null);
        if (!mounted) return;
        setActive(a);
        setPage((await DriverActions.isOnboarded()) ? 'home' : 'onboarding');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshState]);

  // Driver location for the native map (skip on web)
  useEffect(() => {
    if (page !== 'home' || Platform.OS === 'web') return;
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted || status !== 'granted') return;
        const current = await Location.getCurrentPositionAsync({});
        if (!mounted) return;
        setLocation(current);
        setMapRegion((r) => ({ ...r, latitude: current.coords.latitude, longitude: current.coords.longitude }));
      } catch (error) {
        console.error('Location error:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page]);

  const refreshHome = useCallback(async () => {
    try {
      const a = await DriverActions.getActiveDelivery();
      if (activeRef.current && !a) {
        setNotice({ text: 'That delivery is no longer assigned to you (the order may have been cancelled).', tone: 'info' });
      }
      setActive(a);
      if (!a && online && approved) {
        setOffers(await DriverActions.getOffers());
      }
    } catch (e: any) {
      setNotice({ text: errorText(e, "Can't reach the server right now."), tone: 'error' });
    }
  }, [online, approved]);

  // Poll for offers / active-delivery updates while on Home
  useEffect(() => {
    if (page !== 'home' || !approved) return;
    refreshHome();
    const t = setInterval(() => {
      if (AppState.currentState === 'active') refreshHome();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [page, approved, online, refreshHome]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      setNotice({ text: errorText(e, 'Something went wrong. Please try again.'), tone: 'error' });
      await refreshHome();
    } finally {
      setBusy(false);
    }
  };

  const toggleOnline = async () => {
    const next = !online;
    if (next) await DriverActions.goOnline();
    else await DriverActions.goOffline();
    setOnline(next);
    if (!next) setOffers([]);
  };

  const signOut = async () => {
    await DriverActions.signOut();
    onExit();
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#C9943D" />
      </View>
    );
  }

  if (page === 'onboarding') {
    return (
      <DriverOnboarding
        onComplete={async () => {
          await DriverActions.completeOnboarding({ email: driverEmail });
          setPage('home');
        }}
        onCancel={signOut}
      />
    );
  }

  const pickupCoord = active?.pickup.lat != null && active?.pickup.lng != null
    ? { latitude: active.pickup.lat, longitude: active.pickup.lng }
    : null;
  const dropoffCoord = active?.dropoff.lat != null && active?.dropoff.lng != null
    ? { latitude: active.dropoff.lat, longitude: active.dropoff.lng }
    : null;

  return (
    <View style={styles.container}>
      <View style={[styles.body, { paddingBottom: bottomNavHeight + 16 }]}>
        {page === 'home' && (
          <View style={styles.homeContainer}>
            {Platform.OS === 'web' || !MapView ? (
              <View style={styles.mapFullScreen} />
            ) : (
              <MapView
                style={styles.mapFullScreen}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                showsUserLocation={true}
                showsMyLocationButton={false}
                followsUserLocation={false}
                mapType="standard"
              >
                {location && (
                  <Marker
                    coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
                    title="You"
                    pinColor="#C9943D"
                  />
                )}
                {active?.status === 'accepted' && pickupCoord && (
                  <Marker coordinate={pickupCoord} title="Pickup" description={active.restaurantName} pinColor="#4CAF50" />
                )}
                {active?.status === 'picked_up' && dropoffCoord && (
                  <Marker coordinate={dropoffCoord} title="Drop-off" description={active.dropoff.address ?? ''} pinColor="#FF5722" />
                )}
              </MapView>
            )}

            <View style={[styles.homeTopOverlay, { paddingTop: Math.max(12, insets.top) }]}>
              <View>
                <Text style={styles.homeTitle}>Driver</Text>
                <Text style={styles.homeSubtitle}>
                  {!approved ? 'Pending approval' : active ? 'On a delivery' : online ? 'Online' : 'Offline'}
                </Text>
              </View>
              {approved && !active && (
                <TouchableOpacity onPress={toggleOnline} style={styles.topbarAction} activeOpacity={0.85}>
                  <Text style={styles.topbarActionText}>{online ? 'Go offline' : 'Go online'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <BottomSheet bottomOffset={bottomNavHeight}>
              <Notice text={notice?.text ?? null} tone={notice?.tone ?? 'info'} />
              {!approved ? (
                <PendingApproval
                  checking={checkingApproval}
                  onRefresh={async () => {
                    setCheckingApproval(true);
                    try {
                      const s = await refreshState();
                      if (!s.approved) setNotice({ text: 'Still under review. We will let you know once you are approved.', tone: 'info' });
                    } finally {
                      setCheckingApproval(false);
                    }
                  }}
                />
              ) : active ? (
                <ActiveDeliveryCard
                  delivery={active}
                  busy={busy}
                  onPickup={() =>
                    run(async () => {
                      setActive(await DriverActions.confirmPickup(active.id));
                    })
                  }
                  onComplete={() =>
                    run(async () => {
                      await DriverActions.completeDelivery(active.id);
                      setActive(null);
                      setNotice({ text: `Delivered. $${active.payout.toFixed(2)} added to your earnings.`, tone: 'info' });
                      setOffers(await DriverActions.getOffers());
                    })
                  }
                  onRelease={() =>
                    run(async () => {
                      await DriverActions.releaseDelivery(active.id);
                      setActive(null);
                      setOffers(await DriverActions.getOffers());
                    })
                  }
                />
              ) : (
                <OffersSheet
                  online={online}
                  offers={offers}
                  busy={busy}
                  onGoOnline={toggleOnline}
                  onDecline={(offerId) =>
                    run(async () => {
                      await DriverActions.declineOffer(offerId);
                      setOffers((list) => list.filter((o) => o.id !== offerId));
                    })
                  }
                  onAccept={(offerId) =>
                    run(async () => {
                      setActive(await DriverActions.acceptOffer(offerId));
                      setOffers([]);
                    })
                  }
                />
              )}
            </BottomSheet>
          </View>
        )}

        {page === 'earnings' && <DriverEarnings />}

        {page === 'settings' && (
          <DriverSettings
            onClearDeclines={async () => {
              await DriverActions.clearDeclinedOffers();
            }}
            onResetOnboarding={() => setPage('onboarding')}
            onSignOut={signOut}
          />
        )}
      </View>

      <DriverBottomNav current={page} onGo={setPage} bottomInset={insets.bottom} />
    </View>
  );
}

function DriverOnboarding({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [profile, setProfile] = useState<{ name: string; phone: string; vehicle: string } | null>(null);

  useEffect(() => {
    (async () => {
      const p = await safeGetJson('driver.profile', { name: '', phone: '', vehicle: 'car' });
      setProfile(p);
    })();
  }, []);

  if (!profile) return <ActivityIndicator color="#C9943D" />;

  const save = async () => {
    await safeSetJson('driver.profile', profile);
    onComplete();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.screenTitle}>Driver Onboarding</Text>
      <Text style={styles.screenSubtitle}>Set up your driver profile</Text>

      <TextInput value={profile.name} onChangeText={(t) => setProfile((p) => ({ ...(p as any), name: t }))} placeholder="Name" placeholderTextColor="rgba(255,255,255,0.35)" style={styles.input} />
      <TextInput value={profile.phone} onChangeText={(t) => setProfile((p) => ({ ...(p as any), phone: t }))} placeholder="Phone" placeholderTextColor="rgba(255,255,255,0.35)" style={styles.input} />
      <TextInput value={profile.vehicle} onChangeText={(t) => setProfile((p) => ({ ...(p as any), vehicle: t }))} placeholder="Vehicle (car/bike)" placeholderTextColor="rgba(255,255,255,0.35)" style={styles.input} />

      <TouchableOpacity style={styles.primaryBtn} onPress={save} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Complete</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel} activeOpacity={0.85}>
        <Text style={styles.secondaryBtnText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DriverEarnings() {
  const [data, setData] = useState<DriverEarningsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await DriverActions.getEarnings());
    } catch (e: any) {
      setError(errorText(e, "Couldn't load earnings."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>{error}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={load} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!data) return <ActivityIndicator color="#C9943D" />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Earnings</Text>
        <Text style={styles.cardSubtitle}>{data.deliveries.length} delivered</Text>

        <View style={{ height: 12 }} />
        <View style={styles.rowGap}>
          <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.cardSubtitle}>Today</Text>
            <Text style={styles.earningsValue}>${data.todayTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.cardSubtitle}>Last 7 days</Text>
            <Text style={styles.earningsValue}>${data.weekTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {data.deliveries.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No completed deliveries yet.</Text>
        </View>
      ) : (
        data.deliveries.map((d) => (
          <View key={d.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Order #{d.orderId}</Text>
                <Text style={styles.cardSubtitle}>{d.restaurantName}</Text>
                {!!d.deliveredAt && <Text style={styles.cardSubtitle}>{new Date(d.deliveredAt).toLocaleString()}</Text>}
              </View>
              <Text style={styles.earningsPayout}>${d.payout.toFixed(2)}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function DriverSettings({
  onClearDeclines,
  onResetOnboarding,
  onSignOut,
}: {
  onClearDeclines: () => Promise<void>;
  onResetOnboarding: () => void;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<{ name: string; phone: string; vehicle: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const p = await safeGetJson('driver.profile', { name: '', phone: '', vehicle: 'car' });
      if (mounted) setProfile(p);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!profile) return <ActivityIndicator color="#C9943D" />;

  const saveProfile = async () => {
    await safeSetJson('driver.profile', profile);
    setSaved('Profile saved');
  };

  if (showFaq) {
    return <HelpFAQView role="driver" onBack={() => setShowFaq(false)} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        <Text style={styles.cardSubtitle}>Basic driver info</Text>
        <View style={{ height: 10 }} />
        <TextInput
          value={profile.name}
          onChangeText={(t) => setProfile((p) => ({ ...(p as any), name: t }))}
          placeholder="Name"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <TextInput
          value={profile.phone}
          onChangeText={(t) => setProfile((p) => ({ ...(p as any), phone: t }))}
          placeholder="Phone"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <TextInput
          value={profile.vehicle}
          onChangeText={(t) => setProfile((p) => ({ ...(p as any), vehicle: t }))}
          placeholder="Vehicle (car/bike)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={saveProfile} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Save Profile</Text>
        </TouchableOpacity>
        <Notice text={saved} tone="info" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payouts</Text>
        <Text style={styles.metric}>
          Each delivery's payout is shown before you accept it. Earnings are paid out by the Hobgoblin team; contact
          support to set up your payout account.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Support</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowFaq(true)} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Help & FAQ</Text>
        </TouchableOpacity>
        <View style={{ height: 10 }} />
        <Text style={styles.itemLine}>Go online to see delivery offers.</Text>
        <Text style={styles.itemLine}>Offers appear as soon as a restaurant accepts an order.</Text>
        <Text style={styles.itemLine}>Confirm pickup once the restaurant has marked the order ready.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Utilities</Text>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={async () => {
            await onClearDeclines();
            setSaved('Declined offers will show again');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Show declined offers again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onResetOnboarding} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Edit onboarding</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign out</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topbarAction: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  topbarActionText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  body: { flex: 1, padding: 16 },
  screenTitle: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 6 },
  screenSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  card: { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 4, padding: 14, marginBottom: 10 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  metric: { color: '#fff', fontSize: 12, marginTop: 6, lineHeight: 18 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 8 },
  badge: { color: '#C9943D', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, paddingVertical: 16 },
  emptyTextInline: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  statusLine: { color: 'rgba(255,255,255,0.65)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 },
  statusLineReady: { color: '#7BC67E' },
  notice: { color: '#C9943D', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  noticeError: { color: '#FF7A7A' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { minHeight: 44, borderRadius: 4, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', color: '#fff', paddingHorizontal: 12, marginBottom: 10 },
  primaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#C9943D', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryBtnMuted: { opacity: 0.6 },
  primaryBtnInline: { flex: 1, minHeight: 44, borderRadius: 4, backgroundColor: '#C9943D', alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#000', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  secondaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryBtnInline: { flex: 1, minHeight: 44, borderRadius: 4, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  linkBtn: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  linkBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  itemLine: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 6 },

  // Home (map-first) layout
  homeContainer: { flex: 1, marginHorizontal: -16, marginTop: -16, marginBottom: -16 },
  mapFullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
  },
  homeTopOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  homeTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  homeSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },

  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
    maxHeight: '72%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sheetContent: { paddingHorizontal: 12, paddingBottom: 12 },

  earningsValue: { color: '#C9943D', fontSize: 22, fontWeight: '800', marginTop: 6 },
  earningsPayout: { color: '#C9943D', fontSize: 16, fontWeight: '800' },

  offerCard: {
    marginTop: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    padding: 14,
  },
  offerPayout: { color: '#fff', fontSize: 28, fontWeight: '800' },
  offerPickup: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },

  // Bottom nav (DoorDash-like)
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  bottomNavItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  bottomNavText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  bottomNavTextActive: {
    color: '#C9943D',
  },
  bottomNavIndicator: {
    marginTop: 6,
    width: 20,
    height: 2,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  bottomNavIndicatorActive: {
    backgroundColor: '#C9943D',
  },
});
