import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, FlatList } from 'react-native';
import type { Restaurant, MenuItem } from '../state';
import { getImageSource } from '../utils/imageMap';
import { StoreActions, useCart } from '../src/usecases/store';

interface RestaurantDetailViewProps {
  restaurant: Restaurant;
  onBack: () => void;
  onAddToCart?: (item: MenuItem) => void;
  onNavigateToMenuItem?: (menuItem: MenuItem, restaurant: Restaurant) => void;
  /** Only parents order; kids and the merchant preview just browse. */
  canOrder?: boolean;
}

export default function RestaurantDetailView({ restaurant, onBack, onAddToCart, onNavigateToMenuItem, canOrder = false }: RestaurantDetailViewProps) {
  const cart = useCart();
  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const handleAddToCart = () => {
      const existingItem = cart.find(
        cartItem => cartItem.id === item.id && cartItem.restaurantId === restaurant.id
      );
      
      if (existingItem) {
        StoreActions.mutateCart((prev) =>
          prev.map((ci) =>
            ci.id === item.id && ci.restaurantId === restaurant.id
              ? { ...ci, quantity: (ci.quantity || 1) + 1 }
              : ci
          )
        );
      } else {
        StoreActions.mutateCart((prev) => [
          ...prev,
          { ...item, restaurant: restaurant.name, restaurantId: restaurant.id, quantity: 1 },
        ]);
      }
      onAddToCart?.(item);
    };

    return (
      <TouchableOpacity 
        style={styles.menuItemCard}
        onPress={() => onNavigateToMenuItem?.(item, restaurant)}
        activeOpacity={0.8}
      >
        <Image 
          source={getImageSource(item.image || '')} 
          style={styles.menuItemImage}
        />
        <View style={styles.menuItemContent}>
          <View style={styles.menuItemHeader}>
            <Text style={styles.menuItemName}>{item.name}</Text>
            <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
          </View>
          {canOrder && (
            <TouchableOpacity
              style={styles.addToCartButton}
              onPress={(e) => {
                e.stopPropagation();
                handleAddToCart();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.addToCartText}>Add to Cart</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.restaurantHeader}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantCuisine}>{restaurant.cuisine}</Text>
          {restaurant.featured && (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          )}
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Menu</Text>
          {restaurant.menu.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No menu items available</Text>
            </View>
          ) : (
            <FlatList
              data={restaurant.menu}
              renderItem={renderMenuItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.menuSeparator} />}
            />
          )}
        </View>
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
  restaurantHeader: {
    marginBottom: 24,
  },
  restaurantName: {
    fontSize: 24,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  restaurantCuisine: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#C9943D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  featuredText: {
    fontSize: 10,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '400',
  },
  menuSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 16,
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
  menuSeparator: {
    height: 16,
  },
  menuItemCard: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  menuItemImage: {
    width: '100%',
    height: 192,
    backgroundColor: '#27272a',
  },
  menuItemContent: {
    backgroundColor: '#000000',
    padding: 16,
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuItemName: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  menuItemPrice: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  addToCartButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    minWidth: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addToCartText: {
    fontSize: 10,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
});

