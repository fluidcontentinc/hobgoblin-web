import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { safeGetJson, safeSetJson } from '../utils/storage';
import type { Order, CartItem } from '../state';
import { StoreActions, useCart, useCurrentUser } from '../src/usecases/store';
import { Repos } from '../src/usecases/repos';
import type { ApiError } from '../src/api/errors';
import { isNetworkErrorType, ApiErrorType } from '../src/api/errors';

interface OrdersViewProps {
  onNavigateToOrder?: (order: Order) => void;
}

const ORDER_STATE_LABELS: Record<string, string> = {
  pending: 'Waiting for restaurant',
  confirmed: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  picked_up: 'On the way',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const DELIVERY_KEY = 'checkout.delivery';

function formatOrderDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function OrdersView({ onNavigateToOrder }: OrdersViewProps = {}) {
  const [cartKey, setCartKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [checkoutMessage, setCheckoutMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    safeGetJson(DELIVERY_KEY, { address: '', notes: '' }).then((saved: any) => {
      setDeliveryAddress(saved?.address ?? '');
      setDeliveryNotes(saved?.notes ?? '');
    });
  }, []);
  
  // Data state
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const cart = useCart();
  const currentUser = useCurrentUser();
  
  // Update when cart changes (triggered by cart operations)
  const updateCart = () => {
    setCartKey(prev => prev + 1);
  };

  // Load orders from repository
  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const ordersData = await Repos.orders.list();
      setOrders(ordersData);
      
      // Sync to appState for backward compatibility
      StoreActions.setOrders(ordersData);
    } catch (err: any) {
      console.error('Error loading orders:', err);
      // Use standardized error if available, otherwise create one
      if (err.type) {
        setError(err);
      } else {
        setError({
          type: ApiErrorType.UNKNOWN,
          message: err?.message || 'Failed to load orders. Please try again.',
          originalError: err,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load orders on mount
  useEffect(() => {
    loadOrders();
    const timer = setInterval(loadOrders, 15000);
    return () => clearInterval(timer);
  }, [loadOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(true);
    try {
      await loadOrders();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadOrders]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutMessage(null);
    const address = deliveryAddress.trim();
    if (address.length < 5) {
      setCheckoutMessage({ text: 'Add a delivery address so the driver knows where to bring your order.', tone: 'error' });
      return;
    }
    await safeSetJson(DELIVERY_KEY, { address, notes: deliveryNotes.trim() });

    setCheckingOut(true);
    
    try {
      // Group cart items by restaurant
      const cartItemsByRestaurant: Record<string, {
        restaurantId: number;
        restaurantName: string;
        items: Array<{ menu_item_id: number; quantity: number }>;
        total: number;
      }> = {};
      
      cart.forEach(item => {
        const key = `${item.restaurantId}_${item.restaurant}`;
        if (!cartItemsByRestaurant[key]) {
          cartItemsByRestaurant[key] = {
            restaurantId: item.restaurantId,
            restaurantName: item.restaurant,
            items: [],
            total: 0
          };
        }
        const quantity = item.quantity || 1;
        cartItemsByRestaurant[key].items.push({
          menu_item_id: item.id,
          quantity: quantity
        });
        cartItemsByRestaurant[key].total += item.price * quantity;
      });
      
      // Create orders locally (standalone version - no API)
      const currentDate = new Date();
      const formattedDate = currentDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      // Generate order IDs starting from highest existing order ID + 1
      let nextOrderId = orders.length > 0 
        ? Math.max(...orders.map(o => o.id)) + 1 
        : 1000;
      
      // Create orders via repository for each restaurant group
      const newOrders: Order[] = [];
      for (const orderData of Object.values(cartItemsByRestaurant)) {
        // Get item names from cart items
        const itemNames: string[] = [];
        cart.forEach(cartItem => {
          if (cartItem.restaurantId === orderData.restaurantId) {
            for (let i = 0; i < (cartItem.quantity || 1); i++) {
              itemNames.push(cartItem.name);
            }
          }
        });
        
        const createdOrder = await Repos.orders.create({
          restaurantId: orderData.restaurantId,
          restaurantName: orderData.restaurantName,
          items: itemNames.length > 0 ? itemNames : orderData.items.map(() => 'Item'),
          lines: orderData.items,
          total: orderData.total,
          state: 'created',
          status: 'created',
          t_created: new Date().toISOString(),
          type: 'food',
          buyerEmail: currentUser?.email || null,
          deliveryAddress: address,
          deliveryNotes: deliveryNotes.trim() || null,
        });
        
        newOrders.push(createdOrder);
      }
      
      // Update local state
      setOrders(prev => [...prev, ...newOrders]);
      StoreActions.appendOrders(newOrders);
      
      // Clear cart
      StoreActions.clearCart();
      updateCart();
      
      setCheckoutMessage({ text: 'Order placed. We will update you as the restaurant and driver pick it up.', tone: 'ok' });
    } catch (error: any) {
      console.error('Checkout error:', error);
      setCheckoutMessage({ text: error?.message || 'Failed to place order. Please try again.', tone: 'error' });
    } finally {
      setCheckingOut(false);
    }
  };

  const renderCartItem = ({ item, index }: { item: CartItem; index: number }) => {
    const quantity = item.quantity || 1;
    const itemTotal = item.price * quantity;

    const handleIncreaseQuantity = () => {
      StoreActions.mutateCart((prev) =>
        prev.map((ci, i) => (i === index ? { ...ci, quantity: (ci.quantity || 1) + 1 } : ci))
      );
      updateCart();
    };

    const handleDecreaseQuantity = () => {
      if (quantity > 1) {
        StoreActions.mutateCart((prev) =>
          prev.map((ci, i) => (i === index ? { ...ci, quantity: quantity - 1 } : ci))
        );
        updateCart();
      } else {
        handleRemoveItem();
      }
    };

    const handleRemoveItem = () => {
      StoreActions.mutateCart((prev) => prev.filter((_, i) => i !== index));
      updateCart();
    };

    return (
      <View style={styles.cartItem}>
        <View style={styles.cartItemContent}>
          <Text style={styles.cartItemName}>{item.name}</Text>
          <Text style={styles.cartItemRestaurant}>{item.restaurant}</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={handleDecreaseQuantity}
              activeOpacity={0.8}
            >
              <Text style={styles.quantityButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={handleIncreaseQuantity}
              activeOpacity={0.8}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.cartItemRight}>
          <Text style={styles.cartItemPrice}>${itemTotal.toFixed(2)}</Text>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={handleRemoveItem}
            activeOpacity={0.8}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity 
      style={styles.orderCard}
      onPress={() => onNavigateToOrder?.(item)}
      activeOpacity={0.8}
    >
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderRestaurant}>{item.restaurantName}</Text>
          <Text style={styles.orderNumber}>Order #{item.id}</Text>
        </View>
        <View style={styles.orderStatusBadge}>
          <Text style={styles.orderStatusText}>
            {ORDER_STATE_LABELS[(item.state || item.status || '').toLowerCase()] ?? (item.state || item.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.orderItems}>{item.items.join(', ')}</Text>
      {!!item.driverName && (item.state === 'picked_up' || item.state === 'ready' || item.state === 'preparing' || item.state === 'confirmed') && (
        <Text style={styles.orderDriver}>Driver: {item.driverName}</Text>
      )}
      <View style={styles.orderFooter}>
        <Text style={styles.orderDate}>{formatOrderDate(item.date)}</Text>
        <Text style={styles.orderTotal}>${item.total.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );

  const total = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9943D" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Checkout</Text>
        {checkoutMessage && (
          <Text style={[styles.checkoutMessage, checkoutMessage.tone === 'error' && styles.checkoutMessageError]}>
            {checkoutMessage.text}
          </Text>
        )}
        {cart.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Your cart is empty</Text>
          </View>
        ) : (
          <View style={styles.cartCard}>
            <View style={styles.cartItems}>
              <FlatList
                data={cart}
                renderItem={({ item, index }) => renderCartItem({ item, index })}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.cartSeparator} />}
              />
            </View>
            
            <View style={styles.cartFooter}>
              <Text style={styles.fieldLabel}>Deliver to</Text>
              <TextInput
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                placeholder="Street address, apartment, city"
                placeholderTextColor="#52525b"
                style={styles.input}
                autoComplete="street-address"
              />
              <TextInput
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
                placeholder="Notes for the driver (optional)"
                placeholderTextColor="#52525b"
                style={styles.input}
              />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.checkoutButton, checkingOut && styles.checkoutButtonDisabled]}
                onPress={handleCheckout}
                activeOpacity={0.8}
                disabled={checkingOut}
              >
                {checkingOut ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.checkoutButtonText}>Checkout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order History</Text>
        {loading && !refreshing ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="small" color="#C9943D" />
            <Text style={[styles.emptyText, { marginTop: 8 }]}>Loading orders...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>
              {isNetworkErrorType(error) ? "Can't reach server. Please check your connection and try again." : error.message}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadOrders} activeOpacity={0.8}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        ) : (
          <FlatList
            data={[...orders].sort((a, b) => b.id - a.id)}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.orderSeparator} />}
          />
        )}
      </View>
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
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
  },
  emptyText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '400',
  },
  cartCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    overflow: 'hidden',
  },
  cartItems: {
    padding: 16,
  },
  cartSeparator: {
    height: 12,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cartItemContent: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  cartItemRestaurant: {
    fontSize: 10,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  quantityButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  quantityText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
    minWidth: 20,
    textAlign: 'center',
  },
  cartItemRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  removeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeButtonText: {
    fontSize: 10,
    color: '#ef4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    padding: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  checkoutButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutButtonText: {
    fontSize: 10,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  fieldLabel: {
    fontSize: 10,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  input: {
    minHeight: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  checkoutMessage: {
    fontSize: 12,
    color: '#C9943D',
    marginBottom: 12,
  },
  checkoutMessageError: {
    color: '#ef4444',
  },
  orderDriver: {
    fontSize: 12,
    color: '#C9943D',
    marginBottom: 12,
  },
  orderSeparator: {
    height: 12,
  },
  orderCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    overflow: 'hidden',
    padding: 16,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderRestaurant: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  orderNumber: {
    fontSize: 10,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  orderStatusBadge: {
    backgroundColor: '#233C15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  orderStatusText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  orderItems: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '400',
    marginBottom: 12,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderDate: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '400',
  },
  orderTotal: {
    fontSize: 12,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#C9943D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});

