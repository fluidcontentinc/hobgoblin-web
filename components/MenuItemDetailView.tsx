import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import type { MenuItem, Restaurant } from '../state';
import { getImageSource } from '../utils/imageMap';
import { StoreActions, useCart } from '../src/usecases/store';

interface MenuItemDetailViewProps {
  menuItem: MenuItem;
  restaurant: Restaurant;
  onBack: () => void;
  /** Only parents order; kids browse. */
  canOrder?: boolean;
}

export default function MenuItemDetailView({ menuItem, restaurant, onBack, canOrder = false }: MenuItemDetailViewProps) {
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();

  const handleAddToCart = () => {
    const existingItem = cart.find(
      cartItem => cartItem.id === menuItem.id && cartItem.restaurantId === restaurant.id
    );
    
    if (existingItem) {
      StoreActions.mutateCart((prev) =>
        prev.map((ci) =>
          ci.id === menuItem.id && ci.restaurantId === restaurant.id
            ? { ...ci, quantity: (ci.quantity || 1) + quantity }
            : ci
        )
      );
    } else {
      StoreActions.mutateCart((prev) => [
        ...prev,
        { ...menuItem, restaurant: restaurant.name, restaurantId: restaurant.id, quantity },
      ]);
    }
    
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const handleIncreaseQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const handleDecreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Image 
        source={getImageSource(menuItem.image || '')} 
        style={styles.itemImage}
        resizeMode="cover"
      />

      <View style={styles.content}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{menuItem.name}</Text>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
          </View>
          <Text style={styles.itemPrice}>${menuItem.price.toFixed(2)}</Text>
        </View>

        <View style={styles.descriptionCard}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>
            A delicious {menuItem.name.toLowerCase()} from {restaurant.name}. 
            Made with fresh ingredients and prepared with care. Perfect for any time of day.
          </Text>
        </View>

        {!canOrder ? (
          <Text style={styles.description}>Ask a parent to order this for you.</Text>
        ) : (<>
        <View style={styles.quantityCard}>
          <Text style={styles.sectionTitle}>Quantity</Text>
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

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>${(menuItem.price * quantity).toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.addToCartButton, added && styles.addToCartButtonAdded]}
          onPress={handleAddToCart}
          activeOpacity={0.8}
        >
          <Text style={[styles.addToCartText, added && styles.addToCartTextAdded]}>
            {added ? 'Added to Cart!' : `Add ${quantity} to Cart`}
          </Text>
        </TouchableOpacity>
        </>)}
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
  itemImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#27272a',
  },
  content: {
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 24,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  itemPrice: {
    fontSize: 24,
    fontWeight: '400',
    color: '#C9943D',
  },
  descriptionCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    fontWeight: '400',
  },
  quantityCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  quantityButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  quantityText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '400',
    minWidth: 30,
    textAlign: 'center',
  },
  totalCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
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
    fontSize: 20,
    fontWeight: '400',
    color: '#C9943D',
  },
  addToCartButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addToCartButtonAdded: {
    backgroundColor: '#16a34a',
  },
  addToCartText: {
    fontSize: 12,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  addToCartTextAdded: {
    color: '#FFFFFF',
  },
});


