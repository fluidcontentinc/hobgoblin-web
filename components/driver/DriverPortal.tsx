import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useCurrentUser, useOrders, StoreActions } from '../../src/usecases';
import { DriverActions } from '../../src/usecases';
import type { DriverOfferDto, DriverActiveDeliveryDto } from '../../src/contracts/dto';
import type { DriverDeliveryStatus } from '../../src/contracts/status';
import type { Order } from '../../state';
import { OrderStates, OrderEvents } from '../../utils/stateMachine';
import { applyOrderEvent } from '../../utils/stateMachine';
import { safeGetJson, safeSetJson } from '../../utils/storage';
import HelpFAQView from '../HelpFAQView';

type Page = 'onboarding' | 'home' | 'earnings' | 'settings';
type DeliveryStep = 'accepted' | 'arrived_pickup' | 'picked_up' | 'arrived_dropoff' | 'delivered';

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
      {children}
    </View>
  );
}

function OffersSheet({
  online,
  offers,
  onGoOnline,
  onDecline,
  onAccept,
}: {
  online: boolean;
  offers: DriverOfferDto[];
  onGoOnline: () => void;
  onDecline: (offerId: number) => void;
  onAccept: (offerId: number) => void;
}) {
  const offersCount = online ? offers.length : 0;

  // Pick a single "interruptive" offer (newest first)
  const topOffer = offersCount > 0 ? offers.slice().sort((a, b) => b.id - a.id)[0] : null;

  const [offerSecondsLeft, setOfferSecondsLeft] = useState(30);
  useEffect(() => {
    if (!online || !topOffer) return;
    setOfferSecondsLeft(30);
    const t = setInterval(() => {
      setOfferSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [online, topOffer?.id]);

  return (
    <View style={styles.sheetContent}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Home</Text>
        <Text style={styles.cardSubtitle}>{online ? `Online • ${offersCount} offer(s)` : 'Offline • 0 offers'}</Text>
      </View>

      {!online ? (
        <>
          <View style={{ height: 8 }} />
          <Text style={styles.metric}>No active delivery.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onGoOnline} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Go Online</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => Alert.alert('How offers work', 'When you’re online, new READY orders will appear here as offers. Accept to start a delivery.')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Learn how offers work</Text>
          </TouchableOpacity>
        </>
      ) : offers.length === 0 ? (
        <>
          <View style={{ height: 8 }} />
          <Text style={styles.metric}>No active delivery.</Text>
          <Text style={styles.emptyText}>Searching for offers…</Text>
        </>
      ) : (
        topOffer && (
          <View style={styles.offerCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.offerPayout}>${topOffer.payout.toFixed(2)}</Text>
              <Text style={styles.badge}>Offer</Text>
            </View>

            <Text style={styles.cardSubtitle}>Est. {topOffer.etaMinutes} min • {topOffer.dropoffDistanceMiles.toFixed(1)} mi</Text>
            <View style={{ height: 8 }} />
            <Text style={styles.metric}>Pickup</Text>
            <Text style={styles.offerPickup}>{topOffer.restaurantName}</Text>
            <View style={{ height: 8 }} />
            <Text style={styles.cardSubtitle}>Expires in {offerSecondsLeft}s</Text>

            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.secondaryBtnInline} onPress={() => onDecline(topOffer.id)} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtnInline} onPress={() => onAccept(topOffer.id)} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      )}
    </View>
  );
}

function ActiveDeliverySheet({ order, driverEmail, onDone }: { order: Order; driverEmail: string; onDone: () => void }) {
  // This component is now driven by DriverPortal's local delivery step state.
  // (Kept here for legacy call sites; actual implementation lives in DriverPortal below.)
  const status = (order.state || order.status || '').toLowerCase();

  return (
    <View style={styles.sheetContent}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Active delivery</Text>
        <Text style={styles.badge}>{order.state || order.status}</Text>
      </View>
      <Text style={styles.cardSubtitle}>
        Order #{order.id} • {order.restaurantName}
      </Text>
      <Text style={styles.metric}>Total: ${order.total.toFixed(2)}</Text>
      <View style={{ height: 8 }} />
      {order.items.slice(0, 4).map((it, idx) => (
        <Text key={idx} style={styles.itemLine}>
          • {it}
        </Text>
      ))}
      {order.items.length > 4 && <Text style={styles.cardSubtitle}>+ {order.items.length - 4} more</Text>}

      <View style={{ height: 10 }} />

      <Text style={styles.cardSubtitle}>Updated in DriverPortal</Text>
    </View>
  );
}

export default function DriverPortal({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const orders = useOrders();

  const insets = useSafeAreaInsets();
  const bottomNavHeight = 64 + Math.max(10, insets.bottom);

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('onboarding');
  const [activeDelivery, setActiveDelivery] = useState<DriverActiveDeliveryDto | null>(null);
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferDto[]>([]);
  const [activeStep, setActiveStep] = useState<DeliveryStep>('accepted');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 40.7128, // Default to NYC
    longitude: -74.0060,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const driverEmail = currentUser?.email ?? 'driver@hobgobbler.app';

  // Load driver state
  useEffect(() => {
    let mounted = true;
    (async () => {
      const state = await DriverActions.getState();
      if (!mounted) return;
      setOnline(state.online);
      setPage((await DriverActions.isOnboarded()) ? 'home' : 'onboarding');
      if (state.activeDeliveryId) {
        const active = await DriverActions.getActiveDelivery();
        if (active) {
          setActiveDelivery(active);
          setActiveStep(active.status);
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Request location permissions and get current location (skip on web)
  useEffect(() => {
    if (page !== 'home' || Platform.OS === 'web') return;
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        if (!mounted) return;
        setLocation(currentLocation);
        setMapRegion({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } catch (error) {
        if (!mounted) return;
        setLocationError('Failed to get location');
        console.error('Location error:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page]);

  // Load offers when online
  useEffect(() => {
    if (!online || page !== 'home') return;
    let mounted = true;
    (async () => {
      const data = await DriverActions.getOffers();
      if (!mounted) return;
      setOffers(data);
    })();
    return () => {
      mounted = false;
    };
  }, [online, page]);

  const advanceStep = async () => {
    if (!activeDelivery) return;
    const id = activeDelivery.id;
    const next: DriverDeliveryStatus =
      activeStep === 'accepted' ? 'arrived_pickup' :
      activeStep === 'arrived_pickup' ? 'picked_up' :
      activeStep === 'picked_up' ? 'arrived_dropoff' :
      activeStep === 'arrived_dropoff' ? 'delivered' :
      'delivered';

    await DriverActions.advanceDelivery(id, next);
    setActiveStep(next);
    
    if (next === 'delivered') {
      setActiveDelivery(null);
      setPage('earnings');
    } else {
      const updated = await DriverActions.getActiveDelivery();
      if (updated) setActiveDelivery(updated);
    }
  };

  const stepTitle: Record<DeliveryStep, string> = {
    accepted: 'Accepted',
    arrived_pickup: 'Arrived at pickup',
    picked_up: 'Picked up',
    arrived_dropoff: 'Arrived at dropoff',
    delivered: 'Delivered',
  };

  const primaryLabel: Record<DeliveryStep, string> = {
    accepted: 'Arrived',
    arrived_pickup: 'Confirm pickup',
    picked_up: 'Arrived',
    arrived_dropoff: 'Complete delivery',
    delivered: 'Delivered',
  };

  const showPickupMarker = !!activeDelivery && (activeStep === 'accepted' || activeStep === 'arrived_pickup');
  const showDropoffMarker = !!activeDelivery && (activeStep === 'picked_up' || activeStep === 'arrived_dropoff');

  // Calculate pickup and dropoff locations (using dummy locations for now)
  // In production, these would come from the activeDelivery DTO
  const pickupLocation = activeDelivery
    ? {
        latitude: (location?.coords.latitude || 40.7128) + 0.01,
        longitude: (location?.coords.longitude || -74.0060) + 0.01,
      }
    : null;
  const dropoffLocation = activeDelivery
    ? {
        latitude: (location?.coords.latitude || 40.7128) + 0.02,
        longitude: (location?.coords.longitude || -74.0060) + 0.02,
      }
    : null;

  const signOut = async () => {
    await DriverActions.signOut();
    onExit();
  };

  const go = (p: Page) => {
    setPage(p);
  };

  if (loading) {
    return (
      <View style={styles.container}>
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

  return (
    <View style={styles.container}>
      <View style={[styles.body, { paddingBottom: bottomNavHeight + 16 }]}>
        {page === 'home' && (
          <View style={styles.homeContainer}>
            {/* MAP-FIRST: the map fills the entire screen behind all UI */}
            {Platform.OS === 'web' ? (
              <View style={styles.mapFullScreen}>
                <Text style={styles.mapPlaceholderText}>Map (web placeholder)</Text>
                {locationError && (
                  <Text style={[styles.mapPlaceholderText, { color: 'rgba(255,100,100,0.8)', marginTop: 8 }]}>
                    {locationError}
                  </Text>
                )}
              </View>
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
                {/* Driver location marker */}
                {location && (
                  <Marker
                    coordinate={{
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                    }}
                    title="Your Location"
                    pinColor="#C9943D"
                  />
                )}

                {/* Pickup marker */}
                {showPickupMarker && pickupLocation && (
                  <Marker
                    coordinate={pickupLocation}
                    title="Pickup"
                    description={activeDelivery?.restaurantName || 'Restaurant'}
                    pinColor="#4CAF50"
                  />
                )}

                {/* Dropoff marker */}
                {showDropoffMarker && dropoffLocation && (
                  <Marker
                    coordinate={dropoffLocation}
                    title="Dropoff"
                    description="Delivery address"
                    pinColor="#FF5722"
                  />
                )}
              </MapView>
            )}

            {/* Top overlay header */}
            <View style={[styles.homeTopOverlay, { paddingTop: Math.max(12, insets.top) }]}>
              <View>
                <Text style={styles.homeTitle}>Driver</Text>
                <Text style={styles.homeSubtitle}>{online ? 'Online' : 'Offline'}</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  const next = !online;
                  if (next) {
                    await DriverActions.goOnline();
                  } else {
                    await DriverActions.goOffline();
                  }
                  setOnline(next);
                }}
                style={styles.topbarAction}
                activeOpacity={0.85}
              >
                <Text style={styles.topbarActionText}>{online ? 'Go offline' : 'Go online'}</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom sheet overlay (offers or active delivery) */}
            <BottomSheet bottomOffset={bottomNavHeight}>
              {activeDelivery ? (
                <View style={styles.sheetContent}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{stepTitle[activeStep]}</Text>
                    <Text style={styles.badge}>Active</Text>
                  </View>

                  <Text style={styles.cardSubtitle}>
                    {showPickupMarker ? 'Pickup' : showDropoffMarker ? 'Dropoff' : 'Delivery'}
                  </Text>
                  <Text style={styles.metric}>
                    {showPickupMarker ? activeDelivery.restaurantName : 'Dropoff address (placeholder)'}
                  </Text>

                  <View style={{ height: 10 }} />

                  {/* Secondary actions */}
                  <View style={styles.rowGap}>
                    <TouchableOpacity
                      style={styles.secondaryBtnInline}
                      onPress={() => Alert.alert('Navigate', 'Opens navigation (placeholder).')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Navigate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtnInline}
                      onPress={() => Alert.alert('Contact', 'Call/Text (placeholder).')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Call/Text</Text>
                    </TouchableOpacity>
                  </View>

                  {/* One primary action to advance */}
                  {activeStep !== 'delivered' && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={advanceStep} activeOpacity={0.85}>
                      <Text style={styles.primaryBtnText}>{primaryLabel[activeStep]}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <OffersSheet
                  online={online}
                  offers={offers}
                  onGoOnline={async () => {
                    await DriverActions.goOnline();
                    setOnline(true);
                  }}
                  onDecline={async (offerId) => {
                    await DriverActions.declineOffer(offerId);
                    const updated = await DriverActions.getOffers();
                    setOffers(updated);
                  }}
                  onAccept={async (offerId) => {
                    const result = await DriverActions.acceptOffer(offerId);
                    const active = await DriverActions.getActiveDelivery();
                    if (active) {
                      setActiveDelivery(active);
                      setActiveStep(active.status);
                    }
                  }}
                />
              )}
            </BottomSheet>
          </View>
        )}

        {page === 'earnings' && <DriverEarnings driverEmail={driverEmail} />}

        {page === 'settings' && (
          <DriverSettings
            online={online}
            onToggleOnline={async () => {
              const next = !online;
              if (next) {
                await DriverActions.goOnline();
              } else {
                await DriverActions.goOffline();
              }
              setOnline(next);
            }}
            onClearDeclines={async () => {
              await DriverActions.clearDeclinedOffers();
              Alert.alert('Cleared', 'Declined offers cleared');
            }}
            onResetOnboarding={async () => {
              // Reset onboarding would require a new action, for now just go back
              setPage('onboarding');
            }}
            onSignOut={signOut}
          />
        )}
      </View>

      <DriverBottomNav current={page} onGo={go} bottomInset={insets.bottom} />
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

function DriverHome({
  online,
  offersCount,
  activeOrder,
  onToggleOnline,
  onGoOffers,
  onGoActive,
}: {
  online: boolean;
  offersCount: number;
  activeOrder: Order | null;
  onToggleOnline: () => void;
  onGoOffers: () => void;
  onGoActive: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardTitle}>Home</Text>
            <Text style={styles.cardSubtitle}>{online ? 'Online' : 'Offline'} • {offersCount} offer(s)</Text>
          </View>
          <TouchableOpacity style={styles.smallBtn} onPress={onToggleOnline} activeOpacity={0.85}>
            <Text style={styles.smallBtnText}>{online ? 'Go offline' : 'Go online'}</Text>
          </TouchableOpacity>
        </View>
        {activeOrder ? (
          <>
            <View style={{ height: 12 }} />
            <Text style={styles.metric}>Active: Order #{activeOrder.id}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={onGoActive} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Open active</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.metric, { marginTop: 12 }]}>No active delivery.</Text>
        )}
        <TouchableOpacity style={styles.secondaryBtn} onPress={onGoOffers} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>View offers</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function DriverOffers({
  online,
  offers,
  onGoOnline,
  onDecline,
  onAccept,
}: {
  online: boolean;
  offers: Order[];
  onGoOnline: () => void;
  onDecline: (orderId: number) => void;
  onAccept: (orderId: number) => void;
}) {
  if (!online) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Offers</Text>
        <Text style={styles.metric}>You’re offline.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onGoOnline} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Go online</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {offers.length === 0 ? (
        <Text style={styles.emptyText}>No offers right now.</Text>
      ) : (
        offers
          .slice()
          .sort((a, b) => b.id - a.id)
          .map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Order #{o.id}</Text>
                <Text style={styles.badge}>{o.state || o.status}</Text>
              </View>
              <Text style={styles.cardSubtitle}>{o.restaurantName}</Text>
              <Text style={styles.metric}>${o.total.toFixed(2)} • {o.items.length} item(s)</Text>

              <View style={styles.rowGap}>
                <TouchableOpacity style={styles.secondaryBtnInline} onPress={() => onDecline(o.id)} activeOpacity={0.85}>
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtnInline} onPress={() => onAccept(o.id)} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
      )}
    </ScrollView>
  );
}

function DriverActive({ orderId, driverEmail, onDone }: { orderId: number; driverEmail: string; onDone: () => void }) {
  const orders = useOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) return <Text style={styles.emptyText}>Order not found.</Text>;
  if (order.driverEmail && order.driverEmail !== driverEmail) return <Text style={styles.emptyText}>Assigned to another driver.</Text>;

  const status = (order.state || order.status || '').toLowerCase();

  const transition = (event: string) => {
    try {
      StoreActions.updateOrder(orderId, (o) => applyOrderEvent(o, event, { driverEmail }));
      if (event === OrderEvents.COMPLETE_DELIVERY) onDone();
    } catch (e: any) {
      Alert.alert('Invalid transition', e?.message ?? 'Cannot do that now');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active Delivery</Text>
        <Text style={styles.cardSubtitle}>Order #{order.id} • {order.restaurantName}</Text>
        <View style={{ height: 10 }} />
        <Text style={styles.badge}>{order.state || order.status}</Text>
        <View style={{ height: 10 }} />
        {order.items.map((it, idx) => (
          <Text key={idx} style={styles.itemLine}>• {it}</Text>
        ))}
        <View style={{ height: 10 }} />
        <Text style={styles.metric}>Total: ${order.total.toFixed(2)}</Text>
      </View>

      {status === OrderStates.PICKED_UP && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => transition(OrderEvents.START_ROUTE)} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Start route</Text>
        </TouchableOpacity>
      )}
      {status === OrderStates.EN_ROUTE && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => transition(OrderEvents.COMPLETE_DELIVERY)} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Mark delivered</Text>
        </TouchableOpacity>
      )}
      {status === OrderStates.DELIVERED && (
        <Text style={styles.emptyText}>Delivered.</Text>
      )}
    </ScrollView>
  );
}

function DriverEarnings({ driverEmail }: { driverEmail: string }) {
  const orders = useOrders();
  const delivered = orders
    .filter((o) => o.driverEmail === driverEmail && (o.state || o.status) === OrderStates.DELIVERED)
    .slice()
    .sort((a, b) => b.id - a.id);

  const payoutForOrder = (o: Order) => 5 + o.total * 0.1;

  const toDate = (o: Order) => {
    const raw = (o as any).t_created || (o as any).created_at || null;
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
    const d2 = new Date((o as any).date || Date.now());
    return isNaN(d2.getTime()) ? new Date() : d2;
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayTotal = delivered
    .filter((o) => toDate(o) >= startOfToday)
    .reduce((sum, o) => sum + payoutForOrder(o), 0);

  const weekTotal = delivered
    .filter((o) => toDate(o) >= weekAgo)
    .reduce((sum, o) => sum + payoutForOrder(o), 0);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Earnings</Text>
        <Text style={styles.cardSubtitle}>{delivered.length} delivered</Text>

        <View style={{ height: 12 }} />
        <View style={styles.rowGap}>
          <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.cardSubtitle}>Today</Text>
            <Text style={styles.earningsValue}>${todayTotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.cardSubtitle}>This week</Text>
            <Text style={styles.earningsValue}>${weekTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {delivered.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No completed deliveries yet.</Text>
        </View>
      ) : (
        delivered.map((o) => (
          <View key={o.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Order #{o.id}</Text>
                <Text style={styles.cardSubtitle}>{o.restaurantName}</Text>
                <Text style={styles.cardSubtitle}>{toDate(o).toLocaleString()}</Text>
              </View>
              <Text style={styles.earningsPayout}>${payoutForOrder(o).toFixed(2)}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function DriverSettings({
  online,
  onToggleOnline,
  onClearDeclines,
  onResetOnboarding,
  onSignOut,
}: {
  online: boolean;
  onToggleOnline: () => void;
  onClearDeclines: () => void;
  onResetOnboarding: () => void;
  onSignOut: () => void;
}) {
  const [profile, setProfile] = useState<{ name: string; phone: string; vehicle: string } | null>(null);
  const [payout, setPayout] = useState<{ method: string } | null>(null);
  const [supportNote, setSupportNote] = useState('');
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const p = await safeGetJson('driver.profile', { name: '', phone: '', vehicle: 'car' });
      const pay = await safeGetJson('driver.payout', { method: '' });
      const note = await safeGetJson('driver.supportNote', { note: '' });
      if (!mounted) return;
      setProfile(p);
      setPayout(pay);
      setSupportNote(note?.note ?? '');
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!profile || !payout) return <ActivityIndicator color="#C9943D" />;

  const saveProfile = async () => {
    await safeSetJson('driver.profile', profile);
    Alert.alert('Saved', 'Profile saved');
  };

  const savePayout = async () => {
    await safeSetJson('driver.payout', payout);
    Alert.alert('Saved', 'Payout method saved');
  };

  const saveSupport = async () => {
    await safeSetJson('driver.supportNote', { note: supportNote });
    Alert.alert('Saved', 'Support message saved');
  };

  if (showFaq) {
    return <HelpFAQView role="driver" onBack={() => setShowFaq(false)} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Profile */}
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
        <View style={styles.rowBetween}>
          <Text style={styles.metric}>Status</Text>
          <TouchableOpacity style={styles.smallBtn} onPress={onToggleOnline} activeOpacity={0.85}>
            <Text style={styles.smallBtnText}>{online ? 'Online' : 'Offline'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={saveProfile} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Save Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Vehicle */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Text style={styles.cardSubtitle}>How you deliver</Text>
        <View style={{ height: 10 }} />
        <TextInput
          value={profile.vehicle}
          onChangeText={(t) => setProfile((p) => ({ ...(p as any), vehicle: t }))}
          placeholder="Vehicle (car/bike)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={saveProfile} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Save Vehicle</Text>
        </TouchableOpacity>
      </View>

      {/* Payout Method */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payout Method</Text>
        <Text style={styles.cardSubtitle}>Where earnings go</Text>
        <View style={{ height: 10 }} />
        <TextInput
          value={payout.method}
          onChangeText={(t) => setPayout((p) => ({ ...(p as any), method: t }))}
          placeholder="e.g. Bank transfer, Venmo, PayPal (placeholder)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={savePayout} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Save Payout</Text>
        </TouchableOpacity>
      </View>

      {/* Support */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Support</Text>
        <Text style={styles.cardSubtitle}>Get help or leave a note</Text>
        <View style={{ height: 10 }} />
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowFaq(true)} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Help & FAQ — what drivers can do</Text>
        </TouchableOpacity>
        <View style={{ height: 10 }} />
        <Text style={styles.itemLine}>• Go online to see offers.</Text>
        <Text style={styles.itemLine}>• Offers appear when merchants mark orders READY.</Text>
        <Text style={styles.itemLine}>• This is frontend-only demo data.</Text>
        <View style={{ height: 10 }} />
        <TextInput
          value={supportNote}
          onChangeText={setSupportNote}
          placeholder="Message (optional)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={[styles.input, { minHeight: 88, paddingTop: 12 }]}
          multiline
        />
        <TouchableOpacity style={styles.secondaryBtn} onPress={saveSupport} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Save message</Text>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign out</Text>
        <Text style={styles.cardSubtitle}>Leave driver mode</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Utilities */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Utilities</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onClearDeclines} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Clear declined offers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onResetOnboarding} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Reset onboarding</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function DriverSupport({ onSignOut }: { onSignOut: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Support</Text>
        <Text style={styles.cardSubtitle}>Frontend-only placeholder</Text>
        <View style={{ height: 8 }} />
        <Text style={styles.itemLine}>• Go online to see offers.</Text>
        <Text style={styles.itemLine}>• Offers appear when merchants mark orders READY.</Text>
        <Text style={styles.itemLine}>• This is local demo data.</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topbar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topbarTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  topbarSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
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
  metric: { color: '#fff', fontSize: 12, marginTop: 6 },
  badge: { color: '#C9943D', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, paddingVertical: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { minHeight: 44, borderRadius: 4, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', color: '#fff', paddingHorizontal: 12, marginBottom: 10 },
  primaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#C9943D', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryBtnInline: { flex: 1, minHeight: 44, borderRadius: 4, backgroundColor: '#C9943D', alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#000', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  secondaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryBtnInline: { flex: 1, minHeight: 44, borderRadius: 4, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  smallBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  itemLine: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 6 },

  // Home (map-first) layout
  homeContainer: { flex: 1, marginHorizontal: -16, marginTop: -16, marginBottom: -16 },
  mapFullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  mapMarker: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,10,0.90)',
  },
  mapMarkerText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
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
    maxHeight: '62%',
  },
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
  offerPickup: { color: '#fff', fontSize: 16, fontWeight: '700' },

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


