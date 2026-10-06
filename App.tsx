import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, View, StyleSheet, StatusBar, Platform, Text } from 'react-native';

// Polyfill: some RN libs (react-native-svg, certain Image utilities) call
// Image.resolveAssetSource on web, which RN-Web doesn't always expose in
// the form they expect. Provide a forgiving shim so the app doesn't crash
// when navigating to screens that use those libs.
if (Platform.OS === 'web' && typeof (Image as any).resolveAssetSource !== 'function') {
  (Image as any).resolveAssetSource = (source: any) => {
    if (!source) return { uri: '', width: 0, height: 0, scale: 1 };
    if (typeof source === 'string') return { uri: source, width: 0, height: 0, scale: 1 };
    if (typeof source === 'number') return { uri: '', width: 0, height: 0, scale: 1 };
    if (typeof source === 'object') {
      return { uri: source.uri ?? '', width: source.width ?? 0, height: source.height ?? 0, scale: source.scale ?? 1 };
    }
    return { uri: '', width: 0, height: 0, scale: 1 };
  };
}
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeView from './components/HomeView';
import BrowseView from './components/BrowseView';
import InboxView from './components/InboxView';
import OrdersView from './components/OrdersView';
import AccountView from './components/AccountView';
import HomeWorldView from './components/HomeWorldView';
import MissionDetailView from './components/MissionDetailView';
import OrderDetailView from './components/OrderDetailView';
import RestaurantDetailView from './components/RestaurantDetailView';
import MenuItemDetailView from './components/MenuItemDetailView';
import BottomNavigation from './components/BottomNavigation';
import EnterView from './components/auth/EnterView';
import LoginView from './components/auth/LoginView';
import RegisterView from './components/auth/RegisterView';
import VerifyEmailView from './components/auth/VerifyEmailView';
import UnknownRoleView from './components/auth/UnknownRoleView';
import KidClaimView from './components/auth/KidClaimView';
import MerchantPortal from './components/merchant/MerchantPortal';
import DriverPortal from './components/driver/DriverPortal';
import ParentPortal from './components/parent/ParentPortal';
import AdminPortal from './components/admin/AdminPortal';
import ToastHost from './components/common/Toast';
import { appState, notifyAppState, setCurrentUser } from './state';
import type { Mission, Order, Restaurant, MenuItem } from './state';
import { getAuthRole, setAuthEmail, setAuthRole, type AuthRole } from './utils/auth';
import { Repos } from './src/usecases/repos';
import api from './src/api/client';
import type { Role } from './src/contracts/roles';
import { setErrorHandlerCallbacks } from './src/api/errorHandler';
import type { ApiError } from './src/api/errors';
import { isNetworkErrorType, ApiErrorType } from './src/api/errors';

type ViewName = 'home' | 'browse' | 'world' | 'inbox' | 'orders' | 'account';
type RootFlow = 'enter' | 'login' | 'register' | 'verify-pending' | 'parent' | 'restaurant' | 'driver' | 'kid' | 'kid-claim' | 'admin' | 'unknown';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [rootFlow, setRootFlow] = useState<RootFlow>('enter');
  const [loginRole, setLoginRole] = useState<AuthRole>('parent');
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<ViewName>('home');
  const [browseInitialTab, setBrowseInitialTab] = useState<'hunt' | 'missions' | 'menu'>('hunt');
  const [inboxUnread, setInboxUnread] = useState(0);
  const [selectedMission, setSelectedMission] = useState<{ mission: Mission; index: number } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState<{ menuItem: MenuItem; restaurant: Restaurant } | null>(null);

  const showView = (viewName: ViewName, initialTab?: 'hunt' | 'missions' | 'menu') => {
    setCurrentView(viewName);
    setSelectedMission(null);
    if (viewName === 'browse') {
      if (initialTab) {
        setBrowseInitialTab(initialTab);
      } else {
        setBrowseInitialTab('hunt'); // Reset to hunt if no tab specified
      }
    }
  };

  // Set up error handler for 401 routing
  useEffect(() => {
    setErrorHandlerCallbacks({
      onUnauthorized: () => {
        // Clear user state and route to login
        setCurrentUser(null);
        notifyAppState();
        setRootFlow('enter');
      },
    });
  }, []);

  // Check auth on app launch
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthError(null);
        const user = await Repos.auth.me();
        
        if (user && user.role && user.email) {
          // User is authenticated, route to correct role home
          const roleMap: Record<string, RootFlow> = {
            'parent': 'parent',
            'restaurant': 'restaurant',
            'driver': 'driver',
            'kid': 'kid',
            'admin': 'admin',
          };
          
          const flow = roleMap[user.role] || 'unknown';
          setRootFlow(flow);
          
          // Set current user in app state (roles already match)
          setCurrentUser({
            email: user.email,
            role: user.role,
          });
          notifyAppState();
          
          if (flow === 'parent' || flow === 'kid') {
            showView('home');
          }
        } else {
          // No valid auth, show login
          setRootFlow('enter');
        }
      } catch (error: any) {
        console.error('Auth check error:', error);
        // Error handler will route to login if 401, otherwise show error
        if (error.type === ApiErrorType.UNAUTHORIZED) {
          // Already handled by error handler
          setRootFlow('enter');
        } else {
          setAuthError(error.message || 'Failed to check authentication');
          setRootFlow('enter');
        }
      } finally {
        setBooting(false);
      }
    };
    
    checkAuth();
  }, []);

  // Fetch the kid's unread inbox count for the home-screen badge without
  // pulling the full (heavy) inbox list. Prefers the lightweight
  // /kid/inbox/unread-count endpoint; falls back to /kid/inbox's unread_count
  // if that route isn't deployed yet.
  const refreshInboxUnread = React.useCallback(async () => {
    try {
      const data = await api.get('/kid/inbox/unread-count');
      setInboxUnread(data?.unread_count ?? 0);
    } catch {
      try {
        const data = await api.get('/kid/inbox');
        setInboxUnread(data?.unread_count ?? 0);
      } catch {
        // non-critical — leave the count as-is
      }
    }
  }, []);

  // Refresh the badge whenever the kid lands on the home screen.
  useEffect(() => {
    if (rootFlow === 'kid' && currentView === 'home') {
      refreshInboxUnread();
    }
  }, [rootFlow, currentView, refreshInboxUnread]);

  // Poll the inbox badge while the kid is signed in so it updates from any tab
  // (not just on landing on Home). Pauses while the app is backgrounded.
  useEffect(() => {
    if (rootFlow !== 'kid') return;
    const POLL_MS = 18000;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refreshInboxUnread();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [rootFlow, refreshInboxUnread]);

  const handleNavigateToMission = (mission: Mission, index: number) => {
    // Missions are always opened from the Missions tab — remember that so the
    // ← Back button restores the Missions tab (not the default Hunt/map tab).
    setBrowseInitialTab('missions');
    setSelectedMission({ mission, index });
  };

  const handleBackFromMission = () => {
    // Returns to the originating tab (Missions) since browseInitialTab was set
    // to 'missions' when the detail was opened.
    setSelectedMission(null);
    setCurrentView('browse');
  };

  const handleGoToHuntFromMission = () => {
    setSelectedMission(null);
    setCurrentView('browse');
    setBrowseInitialTab('hunt');
  };

  const handleNavigateToOrder = (order: Order) => {
    setSelectedOrder(order);
  };

  const handleBackFromOrder = () => {
    setSelectedOrder(null);
  };

  const handleNavigateToRestaurant = (restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
  };

  const handleBackFromRestaurant = () => {
    setSelectedRestaurant(null);
  };

  const handleNavigateToMenuItem = (menuItem: MenuItem, restaurant: Restaurant) => {
    setSelectedMenuItem({ menuItem, restaurant });
  };

  const handleBackFromMenuItem = () => {
    setSelectedMenuItem(null);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, rootFlow === 'admin' && styles.containerWide]} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" />
        <View style={styles.content}>
          {booting ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#C9943D" size="large" />
              {authError && (
                <Text style={{ color: '#ff4444', marginTop: 16, textAlign: 'center', paddingHorizontal: 16 }}>
                  {authError}
                </Text>
              )}
            </View>
          ) : rootFlow === 'enter' ? (
            <EnterView
              onPickRole={async (role) => {
                if (role === 'kid') {
                  // Kids don't have email/password — they claim a one-time code.
                  setRootFlow('kid-claim');
                  return;
                }
                setLoginRole(role);
                await Repos.auth.setRole(role);
                setRootFlow('login');
              }}
              onSignUp={async (role) => {
                setLoginRole(role);
                await Repos.auth.setRole(role);
                setAuthError(null);
                setRootFlow('register');
              }}
            />
          ) : rootFlow === 'login' ? (
            <LoginView
              role={loginRole}
              onSwitchRole={() => setRootFlow('enter')}
              onLogin={async (email, password) => {
                try {
                  setAuthError(null);
                  
                  if (!email || !password) {
                    setAuthError('Email and password are required');
                    return;
                  }

                  // Call /auth/login
                  const loginResult = await Repos.auth.login({
                    email,
                    password,
                  });
                  
                  if (!loginResult.token) {
                    setAuthError('Login failed: No token received');
                    return;
                  }

                  // Call /auth/me to get role
                  const user = await Repos.auth.me();
                  
                  if (!user || !user.role) {
                    setAuthError('Failed to get user information');
                    return;
                  }

                  // Set current user in app state (roles already match)
                  setCurrentUser({
                    email: user.email,
                    role: user.role,
                  });
                  notifyAppState();

                  // Reset any customer detail screens
                  setSelectedMission(null);
                  setSelectedOrder(null);
                  setSelectedRestaurant(null);
                  setSelectedMenuItem(null);

                  // Route to correct role home
                  const roleMap: Record<string, RootFlow> = {
                    'parent': 'parent',
                    'restaurant': 'restaurant',
                    'driver': 'driver',
                    'kid': 'kid',
                    'admin': 'admin',
                  };
                  
                  const flow = roleMap[user.role] || 'unknown';
                  setRootFlow(flow);
                  
                  if (flow === 'parent' || flow === 'kid') {
                    showView('home');
                  }
                } catch (error: any) {
                  console.error('Login error:', error);
                  // Use standardized error message
                  if (error.type) {
                    const apiError = error as ApiError;
                    // Don't show error for 401 - error handler will route to login
                    if (apiError.type !== ApiErrorType.UNAUTHORIZED) {
                      setAuthError(isNetworkErrorType(apiError) 
                        ? "Can't reach server. Please check your connection and try again."
                        : apiError.message);
                    }
                  } else {
                    setAuthError(error?.message || 'Login failed. Please try again.');
                  }
                }
              }}
              error={authError}
            />
          ) : rootFlow === 'register' ? (
            <RegisterView
              role={loginRole}
              onSwitchToLogin={() => {
                setAuthError(null);
                setRootFlow('login');
              }}
              onSwitchRole={() => {
                setAuthError(null);
                setRootFlow('enter');
              }}
              onRegistered={(email) => {
                setPendingEmail(email);
                setRootFlow('verify-pending');
              }}
              error={authError}
            />
          ) : rootFlow === 'verify-pending' ? (
            <VerifyEmailView
              email={pendingEmail || ''}
              onVerified={async () => {
                // Token was stored at registration — just check if they're now verified
                const user = await Repos.auth.me();
                if (!user || !user.role) throw new Error('Not verified yet');
                setCurrentUser({ email: user.email ?? '', role: user.role });
                notifyAppState();
                const roleMap: Record<string, RootFlow> = {
                  'parent': 'parent',
                  'restaurant': 'restaurant',
                  'driver': 'driver',
                  'kid': 'kid',
                  'admin': 'admin',
                };
                setRootFlow(roleMap[user.role] ?? 'unknown');
              }}
            />
          ) : rootFlow === 'restaurant' ? (
            <MerchantPortal
              onExit={() => {
                setSelectedMission(null);
                setSelectedOrder(null);
                setSelectedRestaurant(null);
                setSelectedMenuItem(null);
                setRootFlow('enter');
              }}
            />
          ) : rootFlow === 'driver' ? (
            <DriverPortal
              onExit={() => {
                setSelectedMission(null);
                setSelectedOrder(null);
                setSelectedRestaurant(null);
                setSelectedMenuItem(null);
                setRootFlow('enter');
              }}
            />
          ) : rootFlow === 'parent' ? (
            <ParentPortal
              onExit={() => {
                setCurrentUser(null);
                notifyAppState();
                setRootFlow('enter');
              }}
            />
          ) : rootFlow === 'kid-claim' ? (
            <KidClaimView
              onClaimed={async () => {
                // Token is now stored. Fetch the user record to confirm the role.
                try {
                  const user = await Repos.auth.me();
                  if (user?.role === 'kid') {
                    setCurrentUser({ email: user.email ?? '', role: 'kid' });
                    notifyAppState();
                    setRootFlow('kid');
                    showView('home');
                  } else {
                    setRootFlow('unknown');
                  }
                } catch {
                  setRootFlow('enter');
                }
              }}
              onBack={() => setRootFlow('enter')}
            />
          ) : rootFlow === 'admin' ? (
            <AdminPortal
              onExit={() => {
                setCurrentUser(null);
                notifyAppState();
                setRootFlow('enter');
              }}
            />
          ) : rootFlow === 'unknown' ? (
            <UnknownRoleView
              onLogout={async () => {
                await Repos.auth.logout();
                setCurrentUser(null);
                notifyAppState();
                setRootFlow('enter');
              }}
            />
          ) : (
            // Kid flow (customer experience — parent now has its own ParentPortal)
            <>
              {selectedMission ? (
                <MissionDetailView
                  mission={selectedMission.mission}
                  missionIndex={selectedMission.index}
                  onBack={handleBackFromMission}
                  onComplete={handleBackFromMission}
                  onGoToHunt={handleGoToHuntFromMission}
                />
              ) : selectedOrder ? (
                <OrderDetailView order={selectedOrder} onBack={handleBackFromOrder} />
              ) : selectedRestaurant ? (
                <RestaurantDetailView
                  restaurant={selectedRestaurant}
                  onBack={handleBackFromRestaurant}
                  onNavigateToMenuItem={handleNavigateToMenuItem}
                />
              ) : selectedMenuItem ? (
                <MenuItemDetailView
                  menuItem={selectedMenuItem.menuItem}
                  restaurant={selectedMenuItem.restaurant}
                  onBack={handleBackFromMenuItem}
                />
              ) : (
                <>
                  {currentView === 'home' && <HomeView showView={showView} inboxUnread={inboxUnread} />}
                  {currentView === 'browse' && (
                    <BrowseView
                      onNavigateToMission={handleNavigateToMission}
                      onNavigateToRestaurant={handleNavigateToRestaurant}
                      onNavigateToMenuItem={handleNavigateToMenuItem}
                      initialTab={browseInitialTab}
                    />
                  )}
                  {currentView === 'world' && <HomeWorldView />}
                  {currentView === 'inbox' && (
                    <InboxView onUnreadCountChange={setInboxUnread} />
                  )}
                  {currentView === 'orders' && <OrdersView onNavigateToOrder={handleNavigateToOrder} />}
                  {currentView === 'account' && (
                    <AccountView
                      onSignOut={() => {
                        setRootFlow('enter');
                        setCurrentUser(null);
                        notifyAppState();
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </View>
        {rootFlow === 'kid' &&
          !selectedMission &&
          !selectedOrder &&
          !selectedRestaurant &&
          !selectedMenuItem && (
            <BottomNavigation
              currentView={currentView}
              onNavigate={showView}
            />
          )}
        <ToastHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    ...Platform.select({
      web: {
        maxWidth: 428,
        width: '100%',
        marginHorizontal: 'auto',
      },
    }),
  },
  containerWide: {
    // Admin portal: full viewport width, no phone-width cap
    ...Platform.select({
      web: {
        maxWidth: '100%',
      },
    }),
  },
  content: {
    flex: 1,
    paddingBottom: 0,
    ...Platform.select({
      web: {
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        overflow: 'hidden',
      },
    }),
  },
});
