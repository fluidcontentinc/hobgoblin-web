import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { useCart } from '../src/usecases/store';

type ViewName = 'home' | 'browse' | 'orders' | 'account' | 'inbox';

interface BottomNavigationProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
}

const MOON_ICONS: Record<'home' | 'browse' | 'orders' | 'account', ImageSourcePropType> = {
  home:    require('../assets/moon-home.png'),
  browse:  require('../assets/moon-browse.png'),
  orders:  require('../assets/moon-orders.png'),
  account: require('../assets/moon-account.png'),
};

export default function BottomNavigation({ currentView, onNavigate }: BottomNavigationProps) {
  const cart = useCart();
  const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const navItems: { id: 'home' | 'browse' | 'orders' | 'account'; label: string }[] = [
    { id: 'home',    label: 'Home'    },
    { id: 'browse',  label: 'Browse'  },
    { id: 'account', label: 'Account' },
  ];

  return (
    <View style={styles.container}>
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        const badgeCount = item.id === 'orders' ? cartCount : 0;

        return (
          <TouchableOpacity
            key={item.id}
            style={styles.navButton}
            onPress={() => onNavigate(item.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Tab: ${item.label}`}
          >
            {/* Moon icon + cart badge */}
            <View style={styles.iconWrap}>
              <Image
                source={MOON_ICONS[item.id]}
                style={[styles.moon, !isActive && styles.moonInactive]}
                resizeMode="contain"
              />
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
                </View>
              )}
            </View>

            {/* Label */}
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 44,
    paddingTop: 8,
    paddingBottom: 8,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  moon: {
    width: 30,
    height: 30,
  },
  moonInactive: {
    opacity: 0.55,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    backgroundColor: '#C9943D',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 9,
    color: '#000000',
    fontWeight: '700',
  },
});
