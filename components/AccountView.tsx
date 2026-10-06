import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, FlatList, Image, Alert, RefreshControl } from 'react-native';
import type { User, Event, Restaurant, MenuItem } from '../state';
import { getImageSource } from '../utils/imageMap';
import { allocateNextRestaurantId, StoreActions, useCurrentUser, useOrders, useRestaurants, useStats } from '../src/usecases/store';
import { EventActions, useUserEvents } from '../src/usecases/events';
import HelpFAQView from './HelpFAQView';
import PrivacyPolicyView from './PrivacyPolicyView';
import TermsView from './TermsView';

type StaticPage = 'faq' | 'privacy' | 'terms';

type Role = 'parent' | 'restaurant' | 'kid';

// Helper function to get QR code image source
// QR code images should be placed in assets/qr-codes/ folder
// Expected filenames: parent-qr.png, kid-qr.png, restaurant-qr.png
function getQRCodeSource(role: Role) {
  try {
    switch (role) {
      case 'parent':
        return require('../assets/qr-codes/parent-qr.png');
      case 'kid':
        return require('../assets/qr-codes/kid-qr.png');
      case 'restaurant':
        return require('../assets/qr-codes/restaurant-qr.png');
      default:
        return require('../assets/icon.png');
    }
  } catch (error) {
    // Fallback if QR code images don't exist yet
    // User needs to add QR code images to assets/qr-codes/ folder
    return require('../assets/icon.png');
  }
}

interface AccountViewProps {
  onSignOut?: () => void;
}

export default function AccountView({ onSignOut }: AccountViewProps = {}) {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const currentUser = useCurrentUser();
  const restaurants = useRestaurants();
  const orders = useOrders();
  const stats = useStats();
  const userEvents = useUserEvents(10);

  const [showLogin, setShowLogin] = useState(!currentUser);
  const [staticPage, setStaticPage] = useState<StaticPage | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantCuisine, setRestaurantCuisine] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationPhone, setNotificationPhone] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  
  // Parent/Client settings state
  const [profile, setProfile] = useState({ name: '', email: currentUser?.email || '', phone: '' });
  
  // Update profile email when currentUser changes
  useEffect(() => {
    if (currentUser?.email) {
      setProfile((p) => ({ ...p, email: currentUser.email }));
    }
  }, [currentUser?.email]);
  const [addresses, setAddresses] = useState<Array<{ id: number; label: string; address: string; isDefault: boolean }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ id: number; type: string; last4: string; isDefault: boolean }>>([]);
  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    promotions: true,
    missionCompletions: true,
    familyActivity: true,
  });
  const [orderPreferences, setOrderPreferences] = useState({
    dietaryRestrictions: '',
    deliveryInstructions: '',
  });
  const [appSettings, setAppSettings] = useState({
    language: 'en',
    darkMode: true,
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleContinue = () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Please select a role');
      return;
    }

    // Generate a default email based on role
    const defaultEmail = `${selectedRole}@hobgobbler.app`;

    const nextUser: User = { email: defaultEmail, role: selectedRole };

    if (selectedRole === 'restaurant') {
      const restaurant = restaurants.find(r => r.ownerEmail === defaultEmail);
      if (restaurant) {
        nextUser.restaurantId = restaurant.id;
        setRestaurantName(restaurant.name);
        setRestaurantCuisine(restaurant.cuisine);
        setNotificationEmail(restaurant.notificationEmail || '');
        setNotificationPhone(restaurant.notificationPhone || '');
      } else {
        const newId = allocateNextRestaurantId();
        
        StoreActions.setRestaurants([
          ...restaurants,
          {
          id: newId,
          ownerEmail: defaultEmail,
          name: 'My Restaurant',
          cuisine: 'American',
          featured: false,
          menu: []
          },
        ]);
        nextUser.restaurantId = newId;
        setRestaurantName('My Restaurant');
        setRestaurantCuisine('American');
      }
    }

    StoreActions.setCurrentUser(nextUser);
    setShowLogin(false);
  };

  const handleSignOut = () => {
    StoreActions.setCurrentUser(null);
    setSelectedRole(null);
    setShowLogin(true);
    // Call the parent's onSignOut to navigate back to EnterView
    onSignOut?.();
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const renderEvent = ({ item }: { item: Event }) => {
    const timeAgo = formatTimeAgo(new Date(item.createdAt));
    return (
      <View style={styles.eventCard}>
        <View style={styles.eventContent}>
          <View style={styles.eventText}>
            <Text style={styles.eventMessage}>{item.message}</Text>
            <Text style={styles.eventTime}>{timeAgo}</Text>
          </View>
        </View>
      </View>
    );
  };

  const currentRestaurant = currentUser?.restaurantId
    ? restaurants.find(r => r.id === currentUser.restaurantId)
    : null;
  const userPoints = currentUser ? (stats.kids[currentUser.email] || 0) : 0;

  if (showLogin || !currentUser) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Account</Text>
        </View>

        <View style={styles.loginForm}>
          <Text style={styles.rolePrompt}>Select your role to continue</Text>
          
          <View style={styles.roleButtons}>
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRole === 'parent' && styles.roleButtonActive
              ]}
              onPress={() => handleRoleSelect('parent')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.roleButtonText,
                selectedRole === 'parent' && styles.roleButtonTextActive
              ]}>
                Parent
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRole === 'restaurant' && styles.roleButtonActive
              ]}
              onPress={() => handleRoleSelect('restaurant')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.roleButtonText,
                selectedRole === 'restaurant' && styles.roleButtonTextActive
              ]}>
                Restaurant
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRole === 'kid' && styles.roleButtonActive
              ]}
              onPress={() => handleRoleSelect('kid')}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.roleButtonText,
                selectedRole === 'kid' && styles.roleButtonTextActive
              ]}>
                Kid
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (staticPage === 'faq') return <HelpFAQView role={currentUser.role as Role} onBack={() => setStaticPage(null)} />;
  if (staticPage === 'privacy') return <PrivacyPolicyView onBack={() => setStaticPage(null)} />;
  if (staticPage === 'terms') return <TermsView onBack={() => setStaticPage(null)} />;

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9943D" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
      </View>

      <View style={styles.dashboard}>
        <View style={styles.userCard}>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Logged in as</Text>
            <Text style={styles.userRole}>{currentUser.role}</Text>
            {currentUser.role === 'parent' && (
              <View style={styles.pointsContainer}>
                <Text style={styles.pointsLabel}>Points</Text>
                <Text style={styles.pointsValue}>{userPoints}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={handleSignOut} activeOpacity={0.8}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {currentUser.role === 'parent' && (
          <>
            {/* Profile */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Profile</Text>
              <Text style={styles.settingsCardSubtitle}>Basic account information</Text>
              <View style={{ height: 10 }} />
              <TextInput
                value={profile.name}
                onChangeText={(t) => setProfile((p) => ({ ...p, name: t }))}
                placeholder="Name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.settingsInput}
              />
              <TextInput
                value={profile.email}
                onChangeText={(t) => setProfile((p) => ({ ...p, email: t }))}
                placeholder="Email"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.settingsInput}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                value={profile.phone}
                onChangeText={(t) => setProfile((p) => ({ ...p, phone: t }))}
                placeholder="Phone"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.settingsInput}
                keyboardType="phone-pad"
              />
              <View style={styles.settingsRowBetween}>
                <Text style={styles.settingsMetric}>Points</Text>
                <Text style={styles.settingsPointsValue}>{userPoints}</Text>
              </View>
              <TouchableOpacity style={styles.settingsPrimaryBtn} onPress={() => Alert.alert('Saved', 'Profile updated')} activeOpacity={0.85}>
                <Text style={styles.settingsPrimaryBtnText}>Save Profile</Text>
              </TouchableOpacity>
            </View>

            {/* Delivery Addresses */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Delivery Addresses</Text>
              <Text style={styles.settingsCardSubtitle}>Saved delivery locations</Text>
              <View style={{ height: 10 }} />
              {addresses.length === 0 ? (
                <Text style={styles.settingsEmptyText}>No saved addresses</Text>
              ) : (
                addresses.map((addr) => (
                  <View key={addr.id} style={styles.settingsAddressItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingsAddressLabel}>{addr.label}</Text>
                      <Text style={styles.settingsAddressText}>{addr.address}</Text>
                    </View>
                    {addr.isDefault && (
                      <Text style={styles.settingsBadge}>Default</Text>
                    )}
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => Alert.alert('Add Address', 'Address management coming soon')} activeOpacity={0.85}>
                <Text style={styles.settingsSecondaryBtnText}>Add Address</Text>
              </TouchableOpacity>
            </View>

            {/* Payment Methods */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Payment Methods</Text>
              <Text style={styles.settingsCardSubtitle}>Saved payment options</Text>
              <View style={{ height: 10 }} />
              {paymentMethods.length === 0 ? (
                <Text style={styles.settingsEmptyText}>No payment methods saved</Text>
              ) : (
                paymentMethods.map((pm) => (
                  <View key={pm.id} style={styles.settingsPaymentItem}>
                    <Text style={styles.settingsPaymentText}>{pm.type} •••• {pm.last4}</Text>
                    {pm.isDefault && (
                      <Text style={styles.settingsBadge}>Default</Text>
                    )}
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => Alert.alert('Add Payment', 'Payment management coming soon')} activeOpacity={0.85}>
                <Text style={styles.settingsSecondaryBtnText}>Add Payment Method</Text>
              </TouchableOpacity>
            </View>

            {/* Notifications */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Notifications</Text>
              <Text style={styles.settingsCardSubtitle}>Control what you receive</Text>
              <View style={{ height: 10 }} />
              <View style={styles.settingsToggleRow}>
                <Text style={styles.settingsToggleLabel}>Order Updates</Text>
                <TouchableOpacity
                  style={[styles.settingsToggle, notifications.orderUpdates && styles.settingsToggleActive]}
                  onPress={() => setNotifications((n) => ({ ...n, orderUpdates: !n.orderUpdates }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsToggleText}>{notifications.orderUpdates ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.settingsToggleRow}>
                <Text style={styles.settingsToggleLabel}>Promotions & Deals</Text>
                <TouchableOpacity
                  style={[styles.settingsToggle, notifications.promotions && styles.settingsToggleActive]}
                  onPress={() => setNotifications((n) => ({ ...n, promotions: !n.promotions }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsToggleText}>{notifications.promotions ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.settingsToggleRow}>
                <Text style={styles.settingsToggleLabel}>Mission Completions</Text>
                <TouchableOpacity
                  style={[styles.settingsToggle, notifications.missionCompletions && styles.settingsToggleActive]}
                  onPress={() => setNotifications((n) => ({ ...n, missionCompletions: !n.missionCompletions }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsToggleText}>{notifications.missionCompletions ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.settingsToggleRow}>
                <Text style={styles.settingsToggleLabel}>Family Activity</Text>
                <TouchableOpacity
                  style={[styles.settingsToggle, notifications.familyActivity && styles.settingsToggleActive]}
                  onPress={() => setNotifications((n) => ({ ...n, familyActivity: !n.familyActivity }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsToggleText}>{notifications.familyActivity ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Order Preferences */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Order Preferences</Text>
              <Text style={styles.settingsCardSubtitle}>Dietary and delivery preferences</Text>
              <View style={{ height: 10 }} />
              <TextInput
                value={orderPreferences.dietaryRestrictions}
                onChangeText={(t) => setOrderPreferences((p) => ({ ...p, dietaryRestrictions: t }))}
                placeholder="Dietary restrictions or allergies"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.settingsInput}
              />
              <TextInput
                value={orderPreferences.deliveryInstructions}
                onChangeText={(t) => setOrderPreferences((p) => ({ ...p, deliveryInstructions: t }))}
                placeholder="Default delivery instructions"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.settingsInput, { minHeight: 88, paddingTop: 12 }]}
                multiline
              />
              <TouchableOpacity style={styles.settingsPrimaryBtn} onPress={() => Alert.alert('Saved', 'Preferences updated')} activeOpacity={0.85}>
                <Text style={styles.settingsPrimaryBtnText}>Save Preferences</Text>
              </TouchableOpacity>
            </View>

            {/* Family */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Family</Text>
              <Text style={styles.settingsCardSubtitle}>Family activity and points</Text>
              <View style={{ height: 10 }} />
              <FlatList
                data={userEvents.slice(0, 5)}
                renderItem={renderEvent}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                ListEmptyComponent={
                  <Text style={styles.settingsEmptyText}>No recent activity</Text>
                }
              />
            </View>

            {/* App Settings */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>App Settings</Text>
              <Text style={styles.settingsCardSubtitle}>Language and display preferences</Text>
              <View style={{ height: 10 }} />
              <View style={styles.settingsRowBetween}>
                <Text style={styles.settingsMetric}>Language</Text>
                <Text style={styles.settingsMetricValue}>English</Text>
              </View>
              <View style={styles.settingsRowBetween}>
                <Text style={styles.settingsMetric}>Dark Mode</Text>
                <TouchableOpacity
                  style={[styles.settingsToggle, appSettings.darkMode && styles.settingsToggleActive]}
                  onPress={() => setAppSettings((s) => ({ ...s, darkMode: !s.darkMode }))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.settingsToggleText}>{appSettings.darkMode ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Help & Support */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Help & Support</Text>
              <Text style={styles.settingsCardSubtitle}>Get help or report issues</Text>
              <View style={{ height: 10 }} />
              <TouchableOpacity onPress={() => setStaticPage('faq')} activeOpacity={0.7}>
                <Text style={styles.settingsItemLine}>• View FAQ</Text>
              </TouchableOpacity>
              <Text style={styles.settingsItemLine}>• Contact Support</Text>
              <Text style={styles.settingsItemLine}>• Report an Issue</Text>
              <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => Alert.alert('Support', 'Support features coming soon')} activeOpacity={0.85}>
                <Text style={styles.settingsSecondaryBtnText}>Contact Support</Text>
              </TouchableOpacity>
            </View>

            {/* Account */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Account</Text>
              <Text style={styles.settingsCardSubtitle}>Sign out of your account</Text>
              <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={handleSignOut} activeOpacity={0.85}>
                <Text style={styles.settingsSecondaryBtnText}>Sign out</Text>
              </TouchableOpacity>
            </View>

            {/* QR Code */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>Your QR Code</Text>
              <View style={styles.settingsQrContainer}>
                <Image
                  source={getQRCodeSource('parent')}
                  style={styles.settingsQrImage}
                  resizeMode="contain"
                  onError={() => {
                    console.log('QR code image not found');
                  }}
                />
              </View>
            </View>
          </>
        )}

        {currentUser.role === 'restaurant' && currentRestaurant && (
          <>
            <View style={styles.dashboardSection}>
              <Text style={styles.sectionTitle}>Restaurant Profile</Text>
              <TextInput
                style={styles.profileInput}
                placeholder="Restaurant Name"
                placeholderTextColor="#71717a"
                value={restaurantName}
                onChangeText={setRestaurantName}
              />
              <TextInput
                style={styles.profileInput}
                placeholder="Cuisine Type"
                placeholderTextColor="#71717a"
                value={restaurantCuisine}
                onChangeText={setRestaurantCuisine}
              />
              <TextInput
                style={styles.profileInput}
                placeholder="Notification Email"
                placeholderTextColor="#71717a"
                value={notificationEmail}
                onChangeText={setNotificationEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.profileInput}
                placeholder="Notification Phone"
                placeholderTextColor="#71717a"
                value={notificationPhone}
                onChangeText={setNotificationPhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity 
                style={styles.saveButton} 
                activeOpacity={0.8}
                onPress={() => {
                  if (currentRestaurant) {
                    currentRestaurant.name = restaurantName;
                    currentRestaurant.cuisine = restaurantCuisine;
                    currentRestaurant.notificationEmail = notificationEmail;
                    currentRestaurant.notificationPhone = notificationPhone;
                    Alert.alert('Success', 'Profile saved successfully!');
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Save Profile</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.sectionTitle}>Menu Management</Text>
              <Text style={styles.sectionSubtitle}>Current Menu Items</Text>
              {currentRestaurant.menu.length === 0 ? (
                <Text style={styles.emptyText}>No menu items yet</Text>
              ) : (
                <FlatList
                  data={currentRestaurant.menu}
                  renderItem={({ item }) => (
                    <View style={styles.menuItemRow}>
                      <Image 
                        source={getImageSource(item.image || '')} 
                        style={styles.menuItemThumbnail}
                        onError={(error) => console.log('Account menu image load error:', error)}
                      />
                      <View style={styles.menuItemInfo}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => {
                          Alert.prompt(
                            'Edit Price',
                            `Current price: $${item.price.toFixed(2)}`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Update',
                                onPress: (price: string | undefined) => {
                                  const newPrice = parseFloat(price || '0');
                                  if (!isNaN(newPrice) && newPrice > 0) {
                                    item.price = newPrice;
                                    Alert.alert('Success', 'Price updated!');
                                  } else {
                                    Alert.alert('Error', 'Please enter a valid price');
                                  }
                                }
                              }
                            ],
                            'plain-text',
                            item.price.toString()
                          );
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  keyExtractor={(item) => item.id.toString()}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={styles.menuItemSeparator} />}
                />
              )}
              <TouchableOpacity 
                style={styles.addItemButton} 
                activeOpacity={0.8}
                onPress={() => {
                  Alert.prompt(
                    'Add Menu Item',
                    'Enter item name',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Next',
                        onPress: (name: string | undefined) => {
                          if (!name || name.trim() === '') {
                            Alert.alert('Error', 'Please enter a name');
                            return;
                          }
                          Alert.prompt(
                            'Add Menu Item',
                            'Enter item price',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Add',
                                onPress: (price: string | undefined) => {
                                  const itemPrice = parseFloat(price || '0');
                                  if (isNaN(itemPrice) || itemPrice <= 0) {
                                    Alert.alert('Error', 'Please enter a valid price');
                                    return;
                                  }
                                  const newItem = {
                                    id: Math.max(...currentRestaurant.menu.map(m => m.id), 0) + 1,
                                    name: name.trim(),
                                    price: itemPrice,
                                    image: 'https://via.placeholder.com/400x200/000000/FFFFFF?text=' + encodeURIComponent(name.trim())
                                  };
                                  currentRestaurant.menu.push(newItem);
                                  Alert.alert('Success', 'Menu item added!');
                                }
                              }
                            ],
                            'plain-text',
                            '0.00'
                          );
                        }
                      }
                    ],
                    'plain-text'
                  );
                }}
              >
                <Text style={styles.addItemButtonText}>+ Add Menu Item</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.sectionTitle}>Order Management</Text>
              {orders.filter(o => o.restaurantId === currentRestaurant.id).length === 0 ? (
                <Text style={styles.emptyText}>No orders yet</Text>
              ) : (
                <FlatList
                  data={orders.filter(o => o.restaurantId === currentRestaurant.id)}
                  renderItem={({ item }) => (
                    <View style={styles.orderCard}>
                      <View style={styles.orderHeader}>
                        <View>
                          <Text style={styles.orderRestaurant}>Order #{item.id}</Text>
                          <Text style={styles.orderNumber}>{item.items.length} items</Text>
                        </View>
                        <View style={styles.orderStatusBadge}>
                          <Text style={styles.orderStatusText}>{item.state || 'pending'}</Text>
                        </View>
                      </View>
                      <Text style={styles.orderItems}>{item.items.join(', ')}</Text>
                      <Text style={styles.orderTotal}>${item.total.toFixed(2)}</Text>
                      <View style={styles.orderActions}>
                        {item.state === 'pending' && (
                          <TouchableOpacity
                            style={styles.updateButton}
                            onPress={() => {
                              item.state = 'preparing';
                              Alert.alert('Updated', 'Order status updated to Preparing');
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.updateButtonText}>Start Preparing</Text>
                          </TouchableOpacity>
                        )}
                        {item.state === 'preparing' && (
                          <TouchableOpacity
                            style={styles.updateButton}
                            onPress={() => {
                              item.state = 'ready';
                              Alert.alert('Updated', 'Order marked as Ready for Pickup');
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.updateButtonText}>Mark Ready</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                  keyExtractor={(item) => item.id.toString()}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={styles.orderSeparator} />}
                />
              )}
            </View>

            <View style={styles.dashboardSection}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <FlatList
                data={userEvents.slice(0, 5)}
                renderItem={renderEvent}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.eventSeparator} />}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No recent activity</Text>
                }
              />
            </View>
          </>
        )}

        {/* Help & Legal — shared across all roles */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsCardTitle}>Help & Legal</Text>
          <Text style={styles.settingsCardSubtitle}>Support and policies</Text>
          <View style={{ height: 10 }} />
          <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => setStaticPage('faq')} activeOpacity={0.85}>
            <Text style={styles.settingsSecondaryBtnText}>Help & FAQ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => setStaticPage('privacy')} activeOpacity={0.85}>
            <Text style={styles.settingsSecondaryBtnText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsSecondaryBtn} onPress={() => setStaticPage('terms')} activeOpacity={0.85}>
            <Text style={styles.settingsSecondaryBtnText}>Terms of Service</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    paddingBottom: 100,
  },
  header: {
    padding: 16,
    paddingBottom: 16,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loginForm: {
    paddingHorizontal: 16,
    gap: 16,
  },
  rolePrompt: {
    fontSize: 10,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#3a3126',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  roleButtonTextActive: {
    color: '#d4b894',
  },
  continueButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 10,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  dashboard: {
    paddingHorizontal: 16,
    gap: 12,
  },
  userCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 4,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  userInfo: {
    flex: 1,
  },
  userLabel: {
    fontSize: 10,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  pointsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  pointsLabel: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '400',
  },
  pointsValue: {
    fontSize: 18,
    color: '#C9943D',
    fontWeight: '400',
  },
  signOutText: {
    fontSize: 10,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  dashboardSection: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '400',
    marginBottom: 16,
  },
  profileInput: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#18181b',
    borderRadius: 4,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 12,
  },
  saveButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 10,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#18181b',
    borderRadius: 4,
    padding: 12,
  },
  menuItemThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: '#27272a',
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  menuItemSeparator: {
    height: 8,
  },
  addItemButton: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 12,
    backgroundColor: '#27272a',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  addItemButtonText: {
    fontSize: 10,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  eventCard: {
    backgroundColor: '#000',
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  eventIcon: {
    fontSize: 16,
  },
  eventText: {
    flex: 1,
  },
  eventMessage: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  eventTime: {
    fontSize: 10,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  eventSeparator: {
    height: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#71717a',
  },
  orderCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
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
    marginBottom: 8,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '400',
    color: '#C9943D',
    marginBottom: 12,
  },
  orderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  orderSeparator: {
    height: 12,
  },
  acceptButton: {
    backgroundColor: '#C9943D',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  updateButton: {
    backgroundColor: '#27272a',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  editButton: {
    backgroundColor: '#27272a',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  editButtonText: {
    fontSize: 10,
    color: '#C9943D',
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Settings styles (matching merchant/driver portals)
  settingsCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 4,
    padding: 14,
    marginBottom: 0,
  },
  settingsCardTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  settingsCardSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  settingsInput: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  settingsPrimaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#C9943D', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  settingsPrimaryBtnText: { color: '#000', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  settingsSecondaryBtn: { minHeight: 44, borderRadius: 4, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  settingsSecondaryBtnText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  settingsRowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 6 },
  settingsMetric: { color: '#fff', fontSize: 12 },
  settingsPointsValue: { color: '#C9943D', fontSize: 16, fontWeight: '800' },
  settingsMetricValue: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  settingsBadge: { color: '#C9943D', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  settingsEmptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, paddingVertical: 16 },
  settingsAddressItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  settingsAddressLabel: { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  settingsAddressText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  settingsPaymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  settingsPaymentText: { color: '#fff', fontSize: 12 },
  settingsToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  settingsToggleLabel: { color: '#fff', fontSize: 12 },
  settingsToggle: { minHeight: 36, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  settingsToggleActive: { borderColor: 'rgba(201,148,61,0.8)', backgroundColor: 'rgba(201,148,61,0.15)' },
  settingsToggleText: { color: '#C9943D', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  settingsItemLine: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 6 },
  settingsQrContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 16,
  },
  settingsQrImage: {
    width: 250,
    height: 250,
  },
});

