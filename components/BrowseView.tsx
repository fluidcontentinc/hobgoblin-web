import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, ScrollView, Alert, TextInput, RefreshControl, Platform, ActivityIndicator } from 'react-native';
import type { Mission, Restaurant, MenuItem } from '../state';
import { getImageSource } from '../utils/imageMap';
import { StoreActions, useCart } from '../src/usecases/store';
import { Repos } from '../src/usecases/repos';
import type { ApiError } from '../src/api/errors';
import { isNetworkErrorType, ApiErrorType } from '../src/api/errors';
import HuntMapView from './HuntMapView';
import ParentWatch from './parent/ParentWatch';
import { kidStatusBadge, formatPoints } from '../utils/missionStatus';

type TabType = 'hunt' | 'missions' | 'menu';

interface BrowseViewProps {
  onNavigateToMission?: (mission: Mission, index: number) => void;
  onNavigateToRestaurant?: (restaurant: Restaurant) => void;
  onNavigateToMenuItem?: (menuItem: MenuItem, restaurant: Restaurant) => void;
  initialTab?: TabType;
  /**
   * Parent supervision mode (ParentPortal's Menu tab): the Hunt tab shows the
   * kid's map read-only with a "kid is here" marker, and the Missions tab
   * shows each kid's mission status instead of the kid-facing browse list.
   */
  parentMode?: boolean;
}

export default function BrowseView({ onNavigateToMission, onNavigateToRestaurant, onNavigateToMenuItem, initialTab = 'hunt', parentMode = false }: BrowseViewProps = {}) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  // Data state
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const cart = useCart();

  // Load data from repositories
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [restaurantsData, missionsData] = await Promise.all([
        Repos.restaurants.list(),
        Repos.missions.list(),
      ]);
      
      setRestaurants(restaurantsData);
      setMissions(missionsData);
      
      // Sync to appState for backward compatibility
      StoreActions.setRestaurants(restaurantsData);
    } catch (err: any) {
      console.error('Error loading data:', err);
      // Use standardized error if available, otherwise create one
      if (err.type) {
        setError(err);
      } else {
        setError({
          type: ApiErrorType.UNKNOWN,
          message: err?.message || 'Failed to load data. Please try again.',
          originalError: err,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update tab when initialTab prop changes (only when navigating to this view)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadData]);

  const missionImages = [
    require('../assets/mission-1.jpg'),
    require('../assets/mission-2.jpg'),
    require('../assets/mission-3.jpg'),
    require('../assets/mission-4.jpg'),
  ];

  // Get unique cuisines
  const cuisines = useMemo(() => {
    const uniqueCuisines = Array.from(new Set(restaurants.map(r => r.cuisine)));
    return uniqueCuisines;
  }, [restaurants]);

  // Filter and group missions
  const { mainMissions, bonusMissions } = useMemo(() => {
    let allMissions = missions;
    
    // Apply search filter if needed
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      allMissions = missions.filter(mission =>
        mission.title.toLowerCase().includes(query) ||
        mission.location.toLowerCase().includes(query)
      );
    }
    
    // Separate main missions (with restaurantId) from bonus missions (without)
    const main = allMissions.filter(m => m.restaurantId !== undefined);
    const bonus = allMissions.filter(m => m.restaurantId === undefined);
    
    return { mainMissions: main, bonusMissions: bonus };
  }, [searchQuery, missions]);

  // Filter restaurants
  const filteredRestaurants = useMemo(() => {
    let filtered = restaurants;
    
    // On menu page, only show restaurants 1-12 (exclude 13, 14, 15 which are duplicates for menu)
    if (activeTab === 'menu') {
      filtered = filtered.filter(r => r.id <= 12);
    }
    
    // Filter by cuisine
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine === selectedCuisine);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(restaurant => {
        const matchesRestaurant = restaurant.name.toLowerCase().includes(query) ||
          restaurant.cuisine.toLowerCase().includes(query);
        const matchesMenu = restaurant.menu.some(item =>
          item.name.toLowerCase().includes(query)
        );
        return matchesRestaurant || matchesMenu;
      });
    }
    
    return filtered;
  }, [searchQuery, selectedCuisine, restaurants, activeTab]);

  const renderMission = ({ item, index }: { item: Mission; index: number }) => {
    // Get food image for restaurant-based missions
    let foodImageSource = null;
    if (item.restaurantId) {
      const restaurant = restaurants.find(r => r.id === item.restaurantId);
      if (restaurant && restaurant.menu.length > 0) {
        const firstMenuItem = restaurant.menu[0];
        foodImageSource = getImageSource(firstMenuItem.image);
      }
    } else {
      // Use mission images for bonus missions (fallback to first 4)
      const bonusIndex = bonusMissions.findIndex(m => m.id === item.id);
      if (bonusIndex >= 0 && bonusIndex < missionImages.length) {
        foodImageSource = missionImages[bonusIndex];
      } else if (index < missionImages.length) {
        // Fallback to index-based if not found in bonusMissions
        foodImageSource = missionImages[index];
      }
    }
    
    return (
      <TouchableOpacity 
        style={styles.missionCard}
        onPress={() => onNavigateToMission?.(item, index)}
        activeOpacity={0.8}
      >
        {foodImageSource && (
          <>
            <Image 
              source={foodImageSource} 
              style={styles.missionImage as any}
              resizeMode="cover"
            />
            <View style={styles.missionOverlay} />
          </>
        )}
        <View style={styles.missionContent}>
          <View style={styles.missionHeader}>
            <Text style={styles.missionTitle} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
            {(() => {
              const badge = kidStatusBadge(item.kidStatus);
              return (
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.statusText, { color: badge.fg }]}>{badge.label}</Text>
                </View>
              );
            })()}
          </View>
          <Text style={styles.missionLocation}>{item.location}</Text>
          <Text style={styles.missionPoints}>{formatPoints(item.pointsEarned, item.pointsTotal)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMenuItem = ({ item, restaurant }: { item: MenuItem; restaurant: Restaurant }) => {
    const itemKey = `${item.id}-${restaurant.id}`;
    const added = addedItems.has(itemKey);

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
      
      // Visual feedback
      setAddedItems(prev => new Set(prev).add(itemKey));
      setTimeout(() => {
        setAddedItems(prev => {
          const next = new Set(prev);
          next.delete(itemKey);
          return next;
        });
      }, 1000);
      
      // Trigger navigation badge update (will be picked up by BottomNavigation's interval)
    };

    return (
      <TouchableOpacity 
        style={styles.menuItemCard}
        onPress={() => onNavigateToMenuItem?.(item, restaurant)}
        activeOpacity={0.8}
      >
        <Image 
          source={getImageSource(item.image || '')} 
          style={styles.menuItemImage as any}
          onError={(error) => console.log('Menu image load error:', error)}
        />
        <View style={styles.menuItemContent}>
          <View style={styles.menuItemHeader}>
            <Text style={styles.menuItemName}>{item.name}</Text>
            <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.addToCartButton, added && styles.addToCartButtonAdded]}
            onPress={(e) => {
              e.stopPropagation();
              handleAddToCart();
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.addToCartText, added && styles.addToCartTextAdded]}>
              {added ? 'Added!' : 'Add to Cart'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRestaurant = ({ item }: { item: Restaurant }) => {
    return (
      <View style={styles.restaurantSection}>
        <View style={styles.restaurantHeader}>
          <View style={styles.restaurantTitleRow}>
            {item.logo ? (
              <Image
                source={{ uri: item.logo }}
                style={styles.restaurantLogo}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.restaurantLogoFallback}>
                <Text style={styles.restaurantLogoFallbackText}>No{'\n'}logo</Text>
              </View>
            )}
            <View style={styles.restaurantTitleText}>
              <Text style={styles.restaurantName}>{item.name}</Text>
              <Text style={styles.restaurantCuisine}>{item.cuisine}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => onNavigateToRestaurant?.(item)} activeOpacity={0.8}>
            <Text style={styles.fullMenuText}>Full menu</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.menuItemsContainer}>
          {item.menu.map((menuItem) => (
            <View key={menuItem.id}>
              {renderMenuItem({ item: menuItem, restaurant: item })}
            </View>
          ))}
        </View>
      </View>
    );
  };


  // For Hunt tab, render map full screen without ScrollView
  if (activeTab === 'hunt') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Browse</Text>
          
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search map..."
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, (activeTab as TabType) === 'hunt' && styles.tabActive]}
              onPress={() => setActiveTab('hunt')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, (activeTab as TabType) === 'hunt' && styles.tabTextActive]}>
                Hunt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, (activeTab as TabType) === 'missions' && styles.tabActive]}
              onPress={() => setActiveTab('missions')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, (activeTab as TabType) === 'missions' && styles.tabTextActive]}>
                Missions
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, (activeTab as TabType) === 'menu' && styles.tabActive]}
              onPress={() => setActiveTab('menu')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, (activeTab as TabType) === 'menu' && styles.tabTextActive]}>
                Menu
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.huntMapContainer}>
          {parentMode
            ? <ParentWatch mode="map" />
            : <HuntMapView onRestaurantPress={onNavigateToRestaurant} />}
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9943D" />
      }
      nestedScrollEnabled={true}
      showsVerticalScrollIndicator={true}
      scrollEnabled={true}
      bounces={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Browse</Text>
        
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'missions' ? 'Search missions...' : 'Search restaurants or menu...'}
            placeholderTextColor="#71717a"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {activeTab === 'menu' && cuisines.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.cuisineFilter}
            contentContainerStyle={styles.cuisineFilterContent}
          >
            <TouchableOpacity
              style={[styles.cuisineChip, !selectedCuisine && styles.cuisineChipActive]}
              onPress={() => setSelectedCuisine(null)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cuisineChipText, !selectedCuisine && styles.cuisineChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {cuisines.map((cuisine) => (
              <TouchableOpacity
                key={cuisine}
                style={[styles.cuisineChip, selectedCuisine === cuisine && styles.cuisineChipActive]}
                onPress={() => setSelectedCuisine(cuisine)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cuisineChipText, selectedCuisine === cuisine && styles.cuisineChipTextActive]}>
                  {cuisine}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, (activeTab as TabType) === 'hunt' && styles.tabActive]}
            onPress={() => setActiveTab('hunt')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, (activeTab as TabType) === 'hunt' && styles.tabTextActive]}>
              Hunt
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'missions' && styles.tabActive]}
            onPress={() => setActiveTab('missions')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'missions' && styles.tabTextActive]}>
              Missions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'menu' && styles.tabActive]}
            onPress={() => setActiveTab('menu')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'menu' && styles.tabTextActive]}>
              Menu
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading State */}
      {loading && !refreshing && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#C9943D" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>
            {isNetworkErrorType(error) ? "Can't reach server. Please check your connection and try again." : error.message}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
      {activeTab === 'missions' && parentMode ? (
        <View style={[styles.panel, { minHeight: 300 }]}>
          <ParentWatch mode="missions" />
        </View>
      ) : activeTab === 'missions' ? (
        <View style={styles.panel}>
          {mainMissions.length === 0 && bonusMissions.length === 0 ? (
            <>
              <Text style={styles.panelTitle}>No missions found</Text>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Try adjusting your search</Text>
              </View>
            </>
          ) : (
            <>
              {/* Main Missions Section */}
              {mainMissions.length > 0 && (
                <>
                  <Text style={styles.sectionHeader}>Main</Text>
                  <FlatList
                    data={mainMissions}
                    renderItem={({ item, index }) => renderMission({ item, index })}
                    keyExtractor={(item) => `main-${item.id}`}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                  />
                </>
              )}
              
              {/* Bonus Missions Section */}
              {bonusMissions.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, mainMissions.length > 0 && styles.sectionHeaderSpaced]}>
                    Bonus
                  </Text>
                  <FlatList
                    data={bonusMissions}
                    renderItem={({ item, index }) => renderMission({ item, index })}
                    keyExtractor={(item) => `bonus-${item.id}`}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                  />
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <View style={styles.panel}>
          {filteredRestaurants.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No restaurants found. Try adjusting your filters.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredRestaurants}
              renderItem={renderRestaurant}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.restaurantSeparator} />}
            />
          )}
        </View>
      )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
    ...Platform.select({
      web: {
        minHeight: '100%',
        height: 'auto',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      },
    }),
  },
  contentContainer: {
    paddingBottom: 100,
    flexGrow: 1,
    minHeight: '100%',
    ...Platform.select({
      web: {
        minHeight: '100%',
      },
    }),
  },
  huntMapContainer: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  header: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '400',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderRadius: 4,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0,
  },
  cuisineFilter: {
    marginBottom: 12,
  },
  cuisineFilterContent: {
    gap: 4,
    paddingRight: 16,
  },
  cuisineChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  cuisineChipActive: {
    backgroundColor: '#C9943D',
    borderColor: '#C9943D',
  },
  cuisineChipText: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '400',
  },
  cuisineChipTextActive: {
    color: '#000000',
  },
  emptyCard: {
    backgroundColor: '#000000',
    borderRadius: 4,
    padding: 16,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '400',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  tabContainerOnly: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#C9943D',
  },
  tabText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tabTextActive: {
    color: '#C9943D',
  },
  panel: {
    paddingHorizontal: 16,
  },
  panelTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 13,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionHeaderSpaced: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  separator: {
    height: 8,
  },
  missionCard: {
    backgroundColor: '#27272a',
    borderRadius: 4,
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  missionImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  missionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 4,
  },
  missionContent: {
    position: 'relative',
    zIndex: 1,
  },
  missionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  statusBadge: {
    backgroundColor: '#233C15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
  },
  missionLocation: {
    fontSize: 12,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 2,
  },
  missionPoints: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  restaurantSection: {
    marginBottom: 16,
    paddingTop: 16,
  },
  restaurantSeparator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  restaurantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  restaurantTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  restaurantTitleText: {
    flex: 1,
  },
  restaurantLogo: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#27272a',
  },
  restaurantLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantLogoFallbackText: {
    fontSize: 9,
    lineHeight: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  restaurantCuisine: {
    fontSize: 10,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  fullMenuText: {
    fontSize: 11,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  menuItemsContainer: {
    gap: 16,
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
    padding: 20,
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuItemName: {
    fontSize: 16,
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
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  addToCartText: {
    fontSize: 10,
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '400',
    textAlign: 'right',
  },
  addToCartButtonAdded: {
    backgroundColor: '#C9943D',
  },
  addToCartTextAdded: {
    color: '#000000',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    minHeight: 200,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 16,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 32,
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

