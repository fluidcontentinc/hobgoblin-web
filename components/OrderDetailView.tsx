import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { Order } from '../state';

interface OrderDetailViewProps {
  order: Order;
  onBack: () => void;
}

const statusSteps = [
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

export default function OrderDetailView({ order, onBack }: OrderDetailViewProps) {
  const getStatusIndex = () => {
    const status = order.state || order.status || 'preparing';
    const index = statusSteps.findIndex(step => step.key === status);
    return index >= 0 ? index : 0;
  };

  const currentStatusIndex = getStatusIndex();
  const status = order.state || order.status || 'preparing';
  const statusStyleKey = (`statusBadge${status.charAt(0).toUpperCase() + status.slice(1).replace('_', '')}`) as string;
  const statusBadgeVariantStyle = (styles as any)[statusStyleKey] as any;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>Order #{order.id}</Text>
            <Text style={styles.restaurantName}>{order.restaurantName}</Text>
          </View>
          <View style={[styles.statusBadge, statusBadgeVariantStyle]}>
            <Text style={styles.statusText}>{status.replace('_', ' ')}</Text>
          </View>
        </View>

        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Order Date</Text>
          <Text style={styles.dateValue}>{order.date}</Text>
        </View>

        <View style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Items</Text>
          {order.items.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <Text style={styles.itemName}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Order Status</Text>
          {statusSteps.map((step, index) => {
            const isCompleted = index <= currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            
            return (
              <View key={step.key} style={styles.timelineItem}>
                <View style={styles.timelineIconContainer}>
                  <View style={[
                    styles.timelineIcon,
                    isCompleted && styles.timelineIconCompleted,
                    isCurrent && styles.timelineIconCurrent
                  ]}>
                    <View style={[styles.timelineIconDot, isCompleted && styles.timelineIconDotCompleted, isCurrent && styles.timelineIconDotCurrent]} />
                  </View>
                  {index < statusSteps.length - 1 && (
                    <View style={[
                      styles.timelineLine,
                      isCompleted && styles.timelineLineCompleted
                    ]} />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[
                    styles.timelineLabel,
                    isCompleted && styles.timelineLabelCompleted
                  ]}>
                    {step.label}
                  </Text>
                  {isCurrent && (
                    <Text style={styles.timelineCurrent}>Current Status</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>${order.total.toFixed(2)}</Text>
          </View>
        </View>

        {status === 'preparing' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Your order is being prepared. We'll notify you when it's ready!
            </Text>
          </View>
        )}

        {status === 'ready' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Your order is ready for pickup! Please come to the restaurant to collect it.
            </Text>
          </View>
        )}

        {status === 'out_for_delivery' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Your order is on the way! Track your delivery in real-time.
            </Text>
          </View>
        )}

        {status === 'delivered' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Order delivered! Thank you for your order. Enjoy your meal!
            </Text>
          </View>
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
  content: {
    padding: 16,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 14,
    color: '#71717a',
    fontWeight: '400',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#233C15',
  },
  statusBadgePreparing: {
    backgroundColor: '#C9943D',
  },
  statusBadgeReady: {
    backgroundColor: '#3b82f6',
  },
  statusBadgeOutForDelivery: {
    backgroundColor: '#f59e0b',
  },
  statusBadgeDelivered: {
    backgroundColor: '#16a34a',
  },
  statusText: {
    fontSize: 12,
    color: '#FFFFFF',
    textTransform: 'capitalize',
    fontWeight: '400',
  },
  dateCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  itemsCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  itemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  itemName: {
    fontSize: 14,
    color: '#a1a1aa',
    fontWeight: '400',
  },
  timelineCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineIconContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3f3f46',
  },
  timelineIconCompleted: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  timelineIconCurrent: {
    backgroundColor: '#C9943D',
    borderColor: '#C9943D',
  },
  timelineIconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3f3f46',
  },
  timelineIconDotCompleted: {
    backgroundColor: '#10b981',
  },
  timelineIconDotCurrent: {
    backgroundColor: '#C9943D',
  },
  timelineLine: {
    width: 2,
    height: 40,
    backgroundColor: '#3f3f46',
    marginTop: 4,
  },
  timelineLineCompleted: {
    backgroundColor: '#16a34a',
  },
  timelineContent: {
    flex: 1,
    paddingTop: 8,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#71717a',
    fontWeight: '400',
  },
  timelineLabelCompleted: {
    color: '#FFFFFF',
  },
  timelineCurrent: {
    fontSize: 12,
    color: '#C9943D',
    marginTop: 4,
    fontWeight: '400',
  },
  totalCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '400',
    color: '#C9943D',
  },
  infoCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#C9943D',
  },
  infoText: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    fontWeight: '400',
  },
});

