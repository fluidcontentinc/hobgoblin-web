import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCurrentUser, useRestaurants, useOrders, StoreActions, allocateNextRestaurantId } from '../../src/usecases';
import { MerchantActions } from '../../src/usecases';
import type { Order, Restaurant } from '../../state';
import type { MerchantOrderDto, MenuItemDto, MerchantHoursDto } from '../../src/contracts/dto';
import type { MerchantOrdersTab } from '../../src/contracts/status';
import { safeGetJson, safeSetJson } from '../../utils/storage';
import { showToast } from '../common/Toast';
import RestaurantDetailView from '../RestaurantDetailView';
import HelpFAQView from '../HelpFAQView';

/** UX cap for the restaurant description field (the DB column is `text`). */
const DESCRIPTION_MAX_LENGTH = 500;

/**
 * Frontend-only starter template the merchant can edit. The bracketed fields
 * are intentional prompts for the merchant to fill in. (An AI-generated
 * variant is deferred — it needs a backend endpoint.)
 */
function buildDescriptionTemplate(name: string, cuisine: string): string {
  const safeName = name.trim() || '[Restaurant name]';
  const safeCuisine = cuisine.trim().toLowerCase() || '[cuisine]';
  return `${safeName} is a ${safeCuisine} spot in [neighborhood] known for [signature dish]. Open [hours]. Family-friendly and walkable from the Hobgoblin Hunt route.`;
}

type Page =
  | 'onboarding'
  | 'orders'
  | 'orderDetail'
  | 'menu'
  | 'hours'
  | 'settings'
  | 'support'
  | 'preview';

type MerchantTab = 'orders' | 'menu' | 'hours' | 'settings';
type MerchantRoute = `/merchant/${MerchantTab}`;
type StoreStatus = 'open' | 'paused' | 'closed';

const TAB_TO_ROUTE: Record<MerchantTab, MerchantRoute> = {
  orders: '/merchant/orders',
  menu: '/merchant/menu',
  hours: '/merchant/hours',
  settings: '/merchant/settings',
};

function routeToTab(pathname: string): MerchantTab | null {
  const path = (pathname || '').split('?')[0].split('#')[0];
  if (path === '/merchant' || path === '/merchant/') return 'orders';
  if (path === '/merchant/orders') return 'orders';
  if (path === '/merchant/menu') return 'menu';
  if (path === '/merchant/hours') return 'hours';
  if (path === '/merchant/settings') return 'settings';
  return null;
}

function setWebPath(route: MerchantRoute) {
  if (Platform.OS !== 'web') return;
  try {
    const w = globalThis as any;
    if (w?.history?.replaceState) w.history.replaceState({}, '', route);
  } catch {
    // no-op
  }
}

function getWebOrdersTab(): MerchantOrdersTab | null {
  if (Platform.OS !== 'web') return null;
  try {
    const w = globalThis as any;
    const search = String(w?.location?.search ?? '');
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const raw = (params.get('tab') ?? '').toLowerCase();
    if (raw === 'new' || raw === 'preparing' || raw === 'ready' || raw === 'history') return raw;
    return null;
  } catch {
    return null;
  }
}

function setWebOrdersPath(tab: MerchantOrdersTab) {
  if (Platform.OS !== 'web') return;
  try {
    const w = globalThis as any;
    if (w?.history?.replaceState) w.history.replaceState({}, '', `/merchant/orders?tab=${encodeURIComponent(tab)}`);
  } catch {
    // no-op
  }
}

function setWebOrderDetailPath(orderId: number) {
  if (Platform.OS !== 'web') return;
  try {
    const w = globalThis as any;
    if (w?.history?.replaceState) w.history.replaceState({}, '', `/merchant/orders/${orderId}`);
  } catch {
    // no-op
  }
}

function MerchantBottomNav({
  active,
  onSelect,
  bottomInset,
}: {
  active: MerchantTab;
  onSelect: (tab: MerchantTab) => void;
  bottomInset: number;
}) {
  const items: Array<{ id: MerchantTab; label: string }> = [
    { id: 'orders', label: 'Orders' },
    { id: 'menu', label: 'Menu' },
    { id: 'hours', label: 'Hours' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(10, bottomInset) }]}>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <TouchableOpacity
            key={it.id}
            onPress={() => onSelect(it.id)}
            activeOpacity={0.85}
            style={styles.bottomNavItem}
          >
            <Text style={[styles.bottomNavText, isActive && styles.bottomNavTextActive]}>{it.label}</Text>
            <View style={[styles.bottomNavIndicator, isActive && styles.bottomNavIndicatorActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function MerchantPortal({ onExit }: { onExit: () => void }) {
  const currentUser = useCurrentUser();
  const restaurants = useRestaurants();
  const orders = useOrders();

  const insets = useSafeAreaInsets();
  const bottomNavHeight = 64 + Math.max(10, insets.bottom);

  const [storeStatus, setStoreStatus] = useState<StoreStatus>('open');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('onboarding');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [ordersTab, setOrdersTab] = useState<MerchantOrdersTab>('new');
  const [merchantOrders, setMerchantOrders] = useState<MerchantOrderDto[]>([]);

  // Load store status — only if already onboarded, otherwise getStore 404s
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const onboarded = await MerchantActions.isOnboarded();
        if (!onboarded) return;
        const store = await MerchantActions.getStore();
        if (!mounted) return;
        setStoreStatus(store.status);
      } catch {
        // no restaurant yet — onboarding will handle it
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setStoreStatusPersisted = async (next: StoreStatus) => {
    if (next === 'closed') {
      setStoreStatus(next);
      return;
    }
    await MerchantActions.setStoreStatus(next);
    setStoreStatus(next);
  };

  // Load orders when tab changes
  useEffect(() => {
    if (!restaurantId || page !== 'orders') return;
    let mounted = true;
    (async () => {
      const data = await MerchantActions.getOrders(ordersTab);
      if (!mounted) return;
      setMerchantOrders(data);
    })();
    return () => {
      mounted = false;
    };
  }, [restaurantId, ordersTab, page]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const onboarded = await MerchantActions.isOnboarded();
      const rid = await MerchantActions.getRestaurantId();
      if (!mounted) return;
      setRestaurantId(rid);
      if (onboarded && rid) {
        let initialTab: MerchantTab = 'orders';
        if (Platform.OS === 'web') {
          try {
            const w = globalThis as any;
            const path = w?.location?.pathname ?? '';
            const t = routeToTab(path);
            if (t) initialTab = t;
            const search = String(w?.location?.search ?? '');
            const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
            const tabParam = (params.get('tab') ?? '').toLowerCase();
            if (tabParam === 'new' || tabParam === 'preparing' || tabParam === 'ready' || tabParam === 'history') {
              setOrdersTab(tabParam);
            }
          } catch {
            // ignore
          }
        }
        setPage(initialTab);
        setWebPath(TAB_TO_ROUTE[initialTab]);
      } else {
        setPage('onboarding');
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const restaurant = useMemo(() => {
    return restaurantId ? restaurants.find((r) => r.id === restaurantId) ?? null : null;
  }, [restaurantId, restaurants]);

  const signOut = async () => {
    await MerchantActions.signOut();
    onExit();
  };

  const goTab = (tab: MerchantTab) => {
    setSelectedOrderId(null);
    setPage(tab);
    setWebPath(TAB_TO_ROUTE[tab]);
  };

  const go = (p: Page) => {
    if (p !== 'orderDetail') setSelectedOrderId(null);
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
      <MerchantOnboarding
        onComplete={async (rid) => {
          setRestaurantId(rid);
          await MerchantActions.completeOnboarding({ restaurantId: rid, email: currentUser?.email ?? 'merchant@hobgobbler.app' });
          goTab('orders');
        }}
        onCancel={signOut}
      />
    );
  }

  const statusLabel: Record<StoreStatus, string> = {
    open: 'Open',
    paused: 'Paused',
    closed: 'Closed',
  };

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarTitle}>{restaurant?.name ?? 'Restaurant'}</Text>
          <View style={styles.topbarMetaRow}>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>{statusLabel[storeStatus]}</Text>
            </View>
          </View>
        </View>

        {page === 'menu' && (
          <TouchableOpacity onPress={() => go('preview')} style={styles.headerPrimaryAction} activeOpacity={0.85}>
            <Text style={styles.headerPrimaryActionText}>Preview</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.body, { paddingBottom: bottomNavHeight + 16 }]}>
        {page === 'orders' && (
          <MerchantOrders
            orders={merchantOrders}
            tab={ordersTab}
            onTabChange={(t) => {
              setOrdersTab(t);
              setWebOrdersPath(t);
            }}
            onOpenOrder={(id) => {
              setSelectedOrderId(id);
              setPage('orderDetail');
              setWebOrderDetailPath(id);
            }}
            onRefresh={async () => {
              const updated = await MerchantActions.getOrders(ordersTab);
              setMerchantOrders(updated);
            }}
            onJumpTo={(t) => goTab(t)}
          />
        )}
        {page === 'orderDetail' && selectedOrderId != null && (
          <MerchantOrderDetail
            orderId={selectedOrderId}
            onBack={() => go('orders')}
          />
        )}
        {page === 'menu' && restaurantId != null && <MerchantMenu restaurantId={restaurantId} />}
        {page === 'hours' && <MerchantHours />}
        {page === 'settings' && (
          <MerchantSettings
            storeStatus={storeStatus}
            onSetStoreStatus={setStoreStatusPersisted}
            onSignOut={signOut}
          />
        )}
        {page === 'support' && <MerchantSupport />}
        {page === 'preview' && restaurant && (
          <RestaurantDetailView
            restaurant={restaurant}
            onBack={() => go('menu')}
          />
        )}
        {page === 'preview' && !restaurant && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#C9943D" />
          </View>
        )}
      </View>

      {/* Sticky bottom navigation (DoorDash-like) */}
      {page !== 'orderDetail' && page !== 'preview' && (
        <MerchantBottomNav
          active={(page === 'menu' || page === 'hours' || page === 'settings' || page === 'orders') ? page : 'orders'}
          onSelect={goTab}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

function MerchantOnboarding({
  onComplete,
  onCancel,
}: {
  onComplete: (restaurantId: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [creating, setCreating] = useState(false);

  const createRestaurant = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const store = await MerchantActions.createStore({
        name: name.trim(),
        cuisine: cuisine.trim() || undefined,
      });
      if (store?.id != null) onComplete(store.id);
    } catch (err: any) {
      showToast(err?.message || 'Could not create restaurant', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.screenTitle}>Set up your store</Text>
      <Text style={styles.screenSubtitle}>Enter your restaurant details to get started</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Restaurant name"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
      />
      <TextInput
        value={cuisine}
        onChangeText={setCuisine}
        placeholder="Cuisine (optional)"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
      />
      <TouchableOpacity
        style={[styles.primaryBtn, (!name.trim() || creating) && { opacity: 0.5 }]}
        onPress={createRestaurant}
        disabled={!name.trim() || creating}
        activeOpacity={0.85}
      >
        {creating
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.primaryBtnText}>Create & continue</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel} activeOpacity={0.85}>
        <Text style={styles.secondaryBtnText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/**
 * MerchantOnboardingChecklist (Spec #7) — guides a new restaurant owner
 * through the 4 setup steps so they know what to do first after signup.
 * Auto-hides once everything's done.
 */
function MerchantOnboardingChecklist({
  onJumpTo,
}: {
  onJumpTo: (tab: 'menu' | 'hours' | 'settings') => void;
}) {
  const [status, setStatus] = useState<{
    hasLogo: boolean;
    hasHours: boolean;
    hasMenu: boolean;
    loading: boolean;
  }>({ hasLogo: false, hasHours: false, hasMenu: false, loading: true });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [store, hours, menu] = await Promise.all([
          MerchantActions.getStore().catch(() => null),
          MerchantActions.getHours().catch(() => [] as any),
          MerchantActions.getMenu().catch(() => [] as any),
        ]);
        if (!mounted) return;
        // "Hours set" means the restaurant has saved at least one day of hours.
        // The backend only returns rows that have been explicitly saved, so any
        // non-empty response means the owner has been through the hours screen.
        const hoursTouched = Array.isArray(hours) && hours.length > 0;
        setStatus({
          hasLogo: !!(store as any)?.logo_url,
          hasHours: hoursTouched,
          hasMenu: Array.isArray(menu) && menu.length > 0,
          loading: false,
        });
      } catch {
        if (mounted) setStatus((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (status.loading) return null;
  const allDone = status.hasLogo && status.hasHours && status.hasMenu;
  if (allDone) return null;

  const Row = ({ done, label, onPress, action }: { done: boolean; label: string; onPress?: () => void; action?: string }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    }}>
      <View style={{
        width: 26, height: 26, borderRadius: 13,
        backgroundColor: done ? '#1F6E3B' : 'rgba(255,255,255,0.08)',
        borderWidth: done ? 0 : 1, borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>}
      </View>
      <Text style={{ color: done ? 'rgba(255,255,255,0.5)' : '#fff', fontSize: 15, flex: 1 }}>{label}</Text>
      {!done && action && (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={{
            minHeight: 40, paddingHorizontal: 16, borderRadius: 4,
            backgroundColor: 'rgba(201,148,61,0.18)',
            borderWidth: 1, borderColor: '#C9943D',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#C9943D', fontSize: 14, fontWeight: '500' }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.card, { marginBottom: 12 }]}>
      <Text style={styles.cardTitle}>Welcome — let's get you set up</Text>
      <Text style={[styles.cardSubtitle, { marginBottom: 8 }]}>
        Finish these {[status.hasLogo, status.hasHours, status.hasMenu].filter((x) => !x).length} steps so customers can find and order from you.
      </Text>
      <Row done={true} label="Account created" />
      <Row done={status.hasLogo} label="Upload your logo" action="Set" onPress={() => onJumpTo('settings')} />
      <Row done={status.hasHours} label="Set your hours" action="Set" onPress={() => onJumpTo('hours')} />
      <Row done={status.hasMenu} label="Add your first menu item" action="Add" onPress={() => onJumpTo('menu')} />
    </View>
  );
}

function MerchantOrders({
  orders,
  tab,
  onTabChange,
  onOpenOrder,
  onRefresh,
  onJumpTo,
}: {
  orders: MerchantOrderDto[];
  tab: MerchantOrdersTab;
  onTabChange: (t: MerchantOrdersTab) => void;
  onOpenOrder: (id: number) => void;
  onRefresh: () => Promise<void>;
  onJumpTo: (tab: 'menu' | 'hours' | 'settings') => void;
}) {
  const tabs: Array<{ id: MerchantOrdersTab; label: string }> = [
    { id: 'new', label: 'New' },
    { id: 'preparing', label: 'Preparing' },
    { id: 'ready', label: 'Ready' },
    { id: 'history', label: 'History' },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <MerchantOnboardingChecklist onJumpTo={onJumpTo} />
      <View style={styles.ordersTabRow}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.ordersTabBtn, active && styles.ordersTabBtnActive]}
              onPress={() => onTabChange(t.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.ordersTabText, active && styles.ordersTabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {orders.length === 0 ? (
        <Text style={styles.emptyText}>No orders yet.</Text>
      ) : (
        orders.map((o) => (
          <View key={o.id} style={styles.card}>
            <TouchableOpacity onPress={() => onOpenOrder(o.id)} activeOpacity={0.85}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Order #{o.id}</Text>
                <Text style={styles.badge}>{o.status}</Text>
              </View>
              <Text style={styles.cardSubtitle}>{o.items.map((it) => it.name).join(', ')}</Text>
              <Text style={styles.metric}>${o.total.toFixed(2)}</Text>
            </TouchableOpacity>

            {tab === 'new' && (
              <View style={styles.rowGap}>
                <TouchableOpacity
                  style={styles.secondaryBtnInline}
                  onPress={() =>
                    Alert.alert('Reject order?', 'This will cancel the order.', [
                      { text: 'Keep', style: 'cancel' },
                      {
                        text: 'Reject',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await MerchantActions.rejectOrder(o.id);
                            await onRefresh();
                          } catch (e: any) {
                            Alert.alert('Cannot reject', e?.message ?? 'Not allowed');
                          }
                        },
                      },
                    ])
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryBtnInline}
                  onPress={() =>
                    Alert.alert('Accept order', 'Select prep time:', [
                      { text: '10 min', onPress: async () => {
                        await MerchantActions.acceptOrder(o.id, 10);
                        await onRefresh();
                      }},
                      { text: '15 min', onPress: async () => {
                        await MerchantActions.acceptOrder(o.id, 15);
                        await onRefresh();
                      }},
                      { text: '20 min', onPress: async () => {
                        await MerchantActions.acceptOrder(o.id, 20);
                        await onRefresh();
                      }},
                      { text: '30 min', onPress: async () => {
                        await MerchantActions.acceptOrder(o.id, 30);
                        await onRefresh();
                      }},
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}

            {tab === 'preparing' && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={async () => {
                  try {
                    await MerchantActions.markOrderReady(o.id);
                    await onRefresh();
                  } catch (e: any) {
                    Alert.alert('Cannot mark ready', e?.message ?? 'Not allowed');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Mark Ready</Text>
              </TouchableOpacity>
            )}

            {tab === 'ready' && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={async () => {
                  try {
                    await MerchantActions.confirmPickup(o.id);
                    await onRefresh();
                  } catch (e: any) {
                    Alert.alert('Cannot confirm pickup', e?.message ?? 'Not allowed');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Confirm Pickup</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function MerchantOrderDetail({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const [order, setOrder] = useState<MerchantOrderDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await MerchantActions.getOrder(orderId);
      if (!mounted) return;
      setOrder(data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [orderId]);

  if (loading) return <ActivityIndicator color="#C9943D" />;
  if (!order) return <Text style={styles.emptyText}>Order not found.</Text>;

  const status = order.status;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <TouchableOpacity onPress={onBack} style={styles.secondaryBtn} activeOpacity={0.85}>
        <Text style={styles.secondaryBtnText}>Back to orders</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order #{order.id}</Text>
        <Text style={styles.cardSubtitle}>{new Date(order.createdAt).toLocaleString()}</Text>
        <View style={{ height: 10 }} />
        <Text style={styles.badge}>{order.status}</Text>
        <View style={{ height: 10 }} />
        {order.items.map((it, idx) => (
          <Text key={idx} style={styles.itemLine}>
            • {it.name} {it.quantity && it.quantity > 1 ? `(x${it.quantity})` : ''}
          </Text>
        ))}
        <View style={{ height: 10 }} />
        <Text style={styles.metric}>Total: ${order.total.toFixed(2)}</Text>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.actionsTitle}>Actions</Text>
        {status === 'created' && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={async () => {
              try {
                await MerchantActions.acceptOrder(orderId, 15);
                const updated = await MerchantActions.getOrder(orderId);
                if (updated) setOrder(updated);
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Cannot start preparing');
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Start preparing</Text>
          </TouchableOpacity>
        )}
        {status === 'preparing' && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={async () => {
              try {
                await MerchantActions.markOrderReady(orderId);
                const updated = await MerchantActions.getOrder(orderId);
                if (updated) setOrder(updated);
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Cannot mark ready');
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Mark ready</Text>
          </TouchableOpacity>
        )}
        {(status === 'created' || status === 'preparing' || status === 'ready') && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              try {
                await MerchantActions.rejectOrder(orderId);
                onBack();
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Cannot cancel order');
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Cancel order</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

/**
 * MerchantMenu — V1 streamlined menu management (Spec #2 + #6).
 *
 * Replaces the previous photo-scan/QR-import-heavy flow with a clean
 * "add an item with a photo in one shot" UX that a 70-year-old can use:
 *   - Big "+ Add Item" button up top
 *   - List of existing items as cards (photo · name · price · Edit / Delete)
 *   - Inline form modal for add/edit with photo picker
 *   - All actions confirmed via Toast
 *
 * The old bulk-import paths (photo-scan / QR) are intentionally dropped for
 * V1. Restaurants with 30+ items can be re-introduced to those in V1.5.
 */
function MerchantMenu({ restaurantId }: { restaurantId: number }) {
  const restaurants = useRestaurants();
  const restaurant = restaurants.find((r) => r.id === restaurantId);

  type FormState = {
    id?: number;
    name: string;
    price: string;
    description: string;
    image?: any | null;       // Blob/File on web; {uri,name,type} on native
    imagePreview?: string | null; // local preview URL while form is open
    existingImageUrl?: string | null;
  };

  const blankForm = (): FormState => ({
    name: '',
    price: '',
    description: '',
    image: null,
    imagePreview: null,
    existingImageUrl: null,
  });

  const [items, setItems] = useState<MenuItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MenuItemDto | null>(null);

  const reload = async () => {
    try {
      const data = await MerchantActions.getMenu();
      setItems(data);
    } catch (err: any) {
      showToast(err?.message || "Couldn't load menu", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await MerchantActions.getMenu().catch(() => [] as MenuItemDto[]);
      if (!mounted) return;
      setItems(data);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const openAdd = () => setForm(blankForm());
  const openEdit = (item: MenuItemDto) => setForm({
    id: item.id,
    name: item.name,
    price: String(item.price ?? ''),
    description: item.description ?? '',
    image: null,
    imagePreview: null,
    existingImageUrl: (item as any).image ?? (item as any).image_url ?? null,
  });
  const closeForm = () => setForm(null);

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      // Web: use a hidden <input type="file"> trigger.
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const previewUrl = URL.createObjectURL(file);
        setForm((prev) => prev ? { ...prev, image: file, imagePreview: previewUrl } : prev);
      };
      input.click();
      return;
    }
    // Native: expo-image-picker.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Photo permission required', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileLike = {
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };
    setForm((prev) => prev ? { ...prev, image: fileLike, imagePreview: asset.uri } : prev);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { showToast('Item needs a name', 'error'); return; }
    const priceNum = parseFloat(form.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      showToast('Enter a valid price', 'error');
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await MerchantActions.updateMenuItem(form.id, {
          name: form.name.trim(),
          price: priceNum,
          description: form.description.trim() || undefined,
          image: form.image ?? undefined,
        } as any);
        showToast('Item updated', 'success');
      } else {
        await MerchantActions.addMenuItem({
          name: form.name.trim(),
          price: priceNum,
          description: form.description.trim() || undefined,
          available: true,
          image: form.image ?? undefined,
        } as any);
        showToast('Item added', 'success');
      }
      closeForm();
      await reload();
    } catch (err: any) {
      // Surface field-level validation errors when the engine returns 422.
      // `err.fields` is set by client.ts buildHttpError from the response's `errors` object.
      const fields = err?.fields;
      let msg: string = err?.message || "Couldn't save the item — try again";
      if (fields && typeof fields === 'object') {
        const firstField = Object.keys(fields)[0];
        const firstMsg = Array.isArray(fields[firstField]) ? fields[firstField][0] : null;
        if (firstField && firstMsg) msg = `${firstField}: ${firstMsg}`;
      }
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);
    try {
      // Optimistic remove
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      await MerchantActions.deleteMenuItem(item.id);
      showToast('Item removed', 'success');
    } catch (err: any) {
      showToast(err?.message || "Couldn't remove item", 'error');
      // Roll back optimistic removal
      await reload();
    }
  };

  if (loading) {
    return <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color="#C9943D" /></View>;
  }

  // ─────── Form (add / edit) ───────────────────────────────────────────────
  if (form) {
    const previewSrc = form.imagePreview || form.existingImageUrl;
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{form.id ? 'Edit Item' : 'Add Item'}</Text>

          {/* Photo — fixed-height wrapper so the dashed box can't stretch.
             react-native-web applies a min-height:100% on the touchable that
             beats an inline minHeight; a definite-height parent makes that
             100% resolve to a fixed size. */}
          <View style={{ marginTop: 12, height: 200 }}>
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.85}
            style={{
              flex: 1,
              width: '100%',
              borderRadius: 4,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: 'rgba(255,255,255,0.55)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {previewSrc ? (
              <Image source={{ uri: previewSrc }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Add a photo</Text>
                <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15, marginTop: 8 }}>Tap to choose from your device</Text>
              </>
            )}
          </TouchableOpacity>
          </View>
          {previewSrc && (
            <TouchableOpacity onPress={pickImage} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
              <Text style={{ color: '#C9943D', fontSize: 14 }}>Change photo</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={form.name}
            onChangeText={(t) => setForm({ ...form, name: t })}
            placeholder="e.g. Cheeseburger"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Price (USD)</Text>
          <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
            {form.price.length > 0 && (
              <Text style={{ color: '#fff', fontSize: 16, paddingLeft: 14, paddingRight: 4 }}>$</Text>
            )}
            <TextInput
              value={form.price}
              onChangeText={(t) => setForm({ ...form, price: t.replace(/[^0-9.]/g, '') })}
              placeholder="9.99"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={{
                flex: 1,
                color: '#fff',
                fontSize: 16,
                paddingLeft: form.price.length > 0 ? 0 : 14,
                paddingRight: 14,
                minHeight: 46,
              }}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <TextInput
            value={form.description}
            onChangeText={(t) => setForm({ ...form, description: t })}
            placeholder="What's in it?"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={[styles.input, { minHeight: 80, paddingTop: 12 }]}
            multiline
          />

          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.5 }, { marginTop: 20, minHeight: 56 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#000" /> : (
              <Text style={styles.primaryBtnText}>{form.id ? 'Save Changes' : 'Add Item'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 10, minHeight: 48 }]}
            onPress={closeForm}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ─────── List (default) ──────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={styles.cardTitle}>Menu</Text>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={openAdd}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { marginTop: 8, minHeight: 56 }]}
        >
          <Text style={styles.primaryBtnText}>+ Add Item</Text>
        </TouchableOpacity>

        {items.length === 0 && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' }}>
              No items yet. Add your first dish with a photo, name, and price.
            </Text>
          </View>
        )}

        {items.map((item) => {
          const imgUrl = (item as any).image_url ?? (item as any).image ?? null;
          return (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {imgUrl ? (
                <Image source={{ uri: imgUrl }} style={{ width: 72, height: 72, borderRadius: 4 }} />
              ) : (
                <View style={{
                  width: 72, height: 72, borderRadius: 4,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>No{'\n'}photo</Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500' }}>{item.name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 2 }}>
                  ${Number(item.price ?? 0).toFixed(2)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => openEdit(item)}
                activeOpacity={0.85}
                style={{
                  minHeight: 44, minWidth: 60,
                  paddingHorizontal: 14, borderRadius: 4,
                  backgroundColor: 'rgba(201,148,61,0.18)',
                  borderWidth: 1, borderColor: '#C9943D',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#C9943D', fontSize: 14, fontWeight: '500' }}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setConfirmDelete(item)}
                activeOpacity={0.85}
                style={{
                  minHeight: 44, minWidth: 60,
                  paddingHorizontal: 14, borderRadius: 4,
                  backgroundColor: 'rgba(180,60,60,0.16)',
                  borderWidth: 1, borderColor: 'rgba(220,90,90,0.6)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#ff8080', fontSize: 14, fontWeight: '500' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Delete confirmation */}
      {confirmDelete && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100,
        }}>
          <View style={[styles.card, { maxWidth: 420, width: '100%' }]}>
            <Text style={styles.cardTitle}>Remove "{confirmDelete.name}"?</Text>
            <Text style={[styles.cardSubtitle, { marginTop: 8 }]}>
              This will remove the item from your menu. This can't be undone.
            </Text>
            <TouchableOpacity
              onPress={doDelete}
              style={[styles.primaryBtn, { marginTop: 16, minHeight: 52, backgroundColor: '#a83a3a' }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: '#fff' }]}>Remove Item</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmDelete(null)}
              style={[styles.secondaryBtn, { marginTop: 10, minHeight: 48 }]}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
/**
 * MerchantHours — day-by-day weekly hours grid (Spec #3).
 *
 * Engine returns/accepts an array of 7 DayHoursDto rows (one per Mon→Sun).
 * Each row renders:
 *   - Day name (Mon, Tue, ...)
 *   - Open / Closed toggle
 *   - When open: open + close time inputs (HTML <input type="time"> on web,
 *     plain HH:MM TextInput on native)
 * Big save button at the bottom shows a success toast.
 */
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function TimeInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (Platform.OS === 'web') {
    // Web: native time picker — great UX on desktop AND mobile browsers.
    return React.createElement('input', {
      type: 'time',
      value: value ?? '',
      disabled,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        height: 44,
        minWidth: 110,
        padding: '8px 12px',
        borderRadius: 4,
        backgroundColor: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.18)',
        color: '#fff',
        fontSize: 16,
        outline: 'none',
        opacity: disabled ? 0.4 : 1,
      },
    });
  }
  return (
    <TextInput
      value={value ?? ''}
      onChangeText={onChange}
      placeholder="09:00"
      placeholderTextColor="rgba(255,255,255,0.55)"
      keyboardType="numbers-and-punctuation"
      editable={!disabled}
      style={{
        height: 44,
        minWidth: 110,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        color: '#fff',
        fontSize: 16,
        opacity: disabled ? 0.4 : 1,
      }}
    />
  );
}

function MerchantHours() {
  const [hours, setHours] = useState<MerchantHoursDto | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await MerchantActions.getHours();
      if (!mounted) return;
      setHours(data);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!hours) return <ActivityIndicator color="#C9943D" />;

  const updateDay = (day: string, patch: Partial<{ open_time: string | null; close_time: string | null; is_closed: boolean }>) => {
    setHours((prev) =>
      (prev ?? []).map((h) => (h.day === day ? { ...h, ...patch } : h)),
    );
  };

  const save = async () => {
    if (!hours) return;
    setSaving(true);
    try {
      const saved = await MerchantActions.setHours(hours);
      setHours(saved);
      showToast('Hours saved', 'success');
    } catch (err: any) {
      showToast(err?.message || "Couldn't save hours — try again", 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hours</Text>
        <Text style={[styles.cardSubtitle, { marginBottom: 12 }]}>
          Set your restaurant's open hours. Tap "Closed" for days you're closed.
        </Text>

        {hours.map((row) => (
          <View
            key={row.day}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
              gap: 12,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', width: 110 }}>
              {DAY_LABELS[row.day] ?? row.day}
            </Text>

            {/* Open/Closed toggle */}
            <TouchableOpacity
              onPress={() => updateDay(row.day, { is_closed: !row.is_closed })}
              activeOpacity={0.8}
              style={{
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: 4,
                backgroundColor: row.is_closed ? 'rgba(255,255,255,0.06)' : 'rgba(201,148,61,0.18)',
                borderWidth: 1,
                borderColor: row.is_closed ? 'rgba(255,255,255,0.15)' : '#C9943D',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: row.is_closed ? 'rgba(255,255,255,0.7)' : '#C9943D', fontSize: 14, fontWeight: '500' }}>
                {row.is_closed ? 'Closed' : 'Open'}
              </Text>
            </TouchableOpacity>

            {!row.is_closed && (
              <>
                <TimeInput
                  value={row.open_time}
                  onChange={(v) => updateDay(row.day, { open_time: v })}
                />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>to</Text>
                <TimeInput
                  value={row.close_time}
                  onChange={(v) => updateDay(row.day, { close_time: v })}
                />
              </>
            )}
          </View>
        ))}

        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.5 }, { marginTop: 20, minHeight: 56 }]}
          onPress={save}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Save Hours</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function MerchantSettings({
  storeStatus,
  onSetStoreStatus,
  onSignOut,
}: {
  storeStatus: StoreStatus;
  onSetStoreStatus: (next: StoreStatus) => void;
  onSignOut: () => void;
}) {
  // Live store profile from the engine (name, cuisine, description, logo_url, notification_email).
  const [store, setStore] = useState<any | null>(null);
  const [profileDraft, setProfileDraft] = useState<{ name: string; cuisine: string; description: string; notification_email: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await MerchantActions.getStore();
        if (!mounted) return;
        setStore(s);
        setProfileDraft({
          name:               (s as any).name ?? '',
          cuisine:            (s as any).cuisine ?? '',
          description:        (s as any).description ?? '',
          notification_email: (s as any).notification_email ?? '',
        });
      } catch (err: any) {
        showToast(err?.message || "Couldn't load store profile", 'error');
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!store || !profileDraft) return <ActivityIndicator color="#C9943D" />;

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await MerchantActions.setStoreProfile({
        name:               profileDraft.name.trim() || undefined,
        cuisine:            profileDraft.cuisine.trim() || null,
        description:        profileDraft.description.trim() || null,
        notification_email: profileDraft.notification_email.trim().toLowerCase() || null,
      });
      setStore(updated);
      showToast('Profile saved', 'success');
    } catch (err: any) {
      showToast(err?.message || "Couldn't save profile", 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const pickLogo = async () => {
    let fileLike: any = null;
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      await new Promise<void>((resolve) => {
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) fileLike = file;
          resolve();
        };
        input.click();
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast('Photo permission required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      fileLike = { uri: asset.uri, name: asset.fileName ?? 'logo.jpg', type: asset.mimeType ?? 'image/jpeg' };
    }
    if (!fileLike) return;

    setUploadingLogo(true);
    try {
      await MerchantActions.uploadStoreLogo(fileLike);
      // Re-fetch the canonical store profile so logo_url is whatever the
      // engine says it is, not whatever the upload response thought.
      const fresh = await MerchantActions.getStore();
      setStore(fresh);
      showToast('Logo uploaded', 'success');
    } catch (err: any) {
      showToast(err?.message || "Couldn't upload logo", 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const logoUrl: string | null = (store as any).logo_url ?? null;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Store profile + logo */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Store Profile</Text>
        <Text style={[styles.cardSubtitle, { marginBottom: 12 }]}>
          What customers see when they find your restaurant.
        </Text>

        {/* Logo */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={{ width: 88, height: 88, borderRadius: 4 }} />
          ) : (
            <View style={{
              width: 88, height: 88, borderRadius: 4,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
              borderStyle: 'dashed',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' }}>No{'\n'}logo</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={pickLogo}
            disabled={uploadingLogo}
            activeOpacity={0.85}
            style={[styles.primaryBtn, { minHeight: 48, paddingHorizontal: 18, flexShrink: 1, opacity: uploadingLogo ? 0.5 : 1 }]}
          >
            {uploadingLogo ? <ActivityIndicator color="#000" /> : (
              <Text style={styles.primaryBtnText}>{logoUrl ? 'Replace Logo' : 'Upload Logo'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Restaurant name</Text>
        <TextInput
          value={profileDraft.name}
          onChangeText={(t) => setProfileDraft({ ...profileDraft, name: t })}
          placeholder="Your restaurant name"
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Cuisine</Text>
        <TextInput
          value={profileDraft.cuisine}
          onChangeText={(t) => setProfileDraft({ ...profileDraft, cuisine: t })}
          placeholder="e.g. American, Italian, Mexican"
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.input}
          autoCapitalize="words"
        />

        <View style={styles.descriptionHeaderRow}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TouchableOpacity
            onPress={() => setProfileDraft({ ...profileDraft, description: buildDescriptionTemplate(profileDraft.name, profileDraft.cuisine) })}
            activeOpacity={0.7}
          >
            <Text style={styles.useTemplateText}>Use template</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={profileDraft.description}
          onChangeText={(t) => setProfileDraft({ ...profileDraft, description: t })}
          placeholder="A short description of your restaurant"
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={[styles.input, { minHeight: 80, paddingTop: 12, marginBottom: 4 }]}
          multiline
          maxLength={DESCRIPTION_MAX_LENGTH}
        />
        <Text
          style={[
            styles.charCount,
            (profileDraft.description ?? '').length >= DESCRIPTION_MAX_LENGTH - 20 && styles.charCountWarn,
          ]}
        >
          {(profileDraft.description ?? '').length} / {DESCRIPTION_MAX_LENGTH}
        </Text>

        <Text style={styles.fieldLabel}>Notification email</Text>
        <TextInput
          value={profileDraft.notification_email}
          onChangeText={(t) => setProfileDraft({ ...profileDraft, notification_email: t })}
          placeholder="Where to send order alerts"
          placeholderTextColor="rgba(255,255,255,0.55)"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity
          onPress={saveProfile}
          disabled={savingProfile}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { marginTop: 12, minHeight: 56, opacity: savingProfile ? 0.5 : 1 }]}
        >
          {savingProfile ? <ActivityIndicator color="#000" /> : (
            <Text style={styles.primaryBtnText}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Store status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Store status</Text>
        <Text style={styles.cardSubtitle}>Controls whether you're taking orders</Text>
        <View style={{ height: 12 }} />
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentBtn, storeStatus === 'open' && styles.segmentBtnActive]}
            onPress={() => onSetStoreStatus('open')}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, storeStatus === 'open' && styles.segmentTextActive]}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, storeStatus === 'paused' && styles.segmentBtnActive]}
            onPress={() => onSetStoreStatus('paused')}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, storeStatus === 'paused' && styles.segmentTextActive]}>Paused</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, storeStatus === 'closed' && styles.segmentBtnActive]}
            onPress={() => onSetStoreStatus('closed')}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, storeStatus === 'closed' && styles.segmentTextActive]}>Closed</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardSubtitle}>Sign out of the merchant portal</Text>
        <View style={{ height: 12 }} />
        <TouchableOpacity style={styles.secondaryBtn} onPress={onSignOut} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/**
 * MerchantSupport — placeholder support page reached via bottom nav or
 * the Help button. Provides contact info and a short FAQ.
 */
function MerchantSupport() {
  const [showFaq, setShowFaq] = useState(false);

  if (showFaq) {
    return <HelpFAQView role="restaurant" onBack={() => setShowFaq(false)} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Need help?</Text>
        <Text style={[styles.cardSubtitle, { marginBottom: 12 }]}>
          We're here to help you get the most out of Hobgoblin Hunt.
        </Text>
        <Text style={styles.itemLine}>• Email: support@ahomerun.net</Text>
        <TouchableOpacity onPress={() => setShowFaq(true)} activeOpacity={0.7}>
          <Text style={[styles.itemLine, { color: '#C9943D' }]}>• View FAQ</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 6,
  },
  charCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 10,
  },
  charCountWarn: {
    color: '#E23B2E',
  },
  descriptionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  useTemplateText: {
    color: '#C9943D',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
  },
  topbar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topbarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  topbarMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusChip: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  headerPrimaryAction: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#C9943D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPrimaryActionText: { color: '#000', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '800' },
  body: { flex: 1, padding: 16 },
  screenTitle: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 6 },
  screenSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#C9943D',
    borderColor: '#C9943D',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  cardActive: {
    borderColor: '#C9943D',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  input: {
    minHeight: 48,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnInline: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnInline: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ordersTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  ordersTabBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTabBtnActive: {
    backgroundColor: '#C9943D',
    borderColor: '#C9943D',
  },
  ordersTabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  ordersTabTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  itemLine: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 22,
  },
  actionsCard: {
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  actionsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#a83a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metric: {
    color: '#C9943D',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomNavItem: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bottomNavTextActive: {
    color: '#C9943D',
    fontWeight: '600',
  },
  bottomNavIndicator: {
    height: 2,
    marginTop: 6,
    width: 20,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  bottomNavIndicatorActive: {
    backgroundColor: '#C9943D',
  },
});
