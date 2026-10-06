import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text, PanResponder, Image, ImageBackground, ScrollView, ActivityIndicator, AppState, Animated, Easing } from 'react-native';
// @ts-ignore
import Svg, { Circle, G, Text as SvgText, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Animated SVG circle for the "current step" pulse ring.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { AdventureActions } from '../src/usecases/adventure';
import type { AdventureMapNode, AdventureMap, ProofSubmission } from '../src/repositories/AdventureRepository';
import StepDetailModal from './StepDetailModal';
import SnackStartModal from './SnackStartModal';
import TransmissionOverlay from './TransmissionOverlay';
import PoiZoomOverlay from './PoiZoomOverlay';
import { resolveScene } from './poiScenes';
import type { PathSnack, PathRestaurant } from '../src/repositories/PathMapRepository';
import SceneOverlay from './SceneOverlay';
import type { Transmission } from '../state';
import { Repos } from '../src/usecases';
import { showToast } from './common/Toast';
import { useGeoCheckIn } from './useGeoCheckIn';

// Width of an admin-placed snack card on the map; used to center it on its point.
const SNACK_CARD_WIDTH = 72;

// Street-name labels overlaid on the map. Positions are 0–100 percentages of
// the map image with a rotation (deg). Ported from the Path of Power prototype
// (STREETS array). Rendered inside the scaled content so they pan/zoom with it.
const STREETS: ReadonlyArray<{ name: string; x: number; y: number; rotate: number }> = [
  { name: 'HARLEM AVE', x: 8, y: 27, rotate: -57 },
  { name: 'LAKE ST', x: 32, y: 44, rotate: -7 },
  { name: 'NORTH BLVD', x: 50, y: 58, rotate: -6 },
  { name: 'SOUTH BLVD', x: 57, y: 63, rotate: -6 },
  { name: 'PLEASANT ST', x: 23, y: 76, rotate: -7 },
  { name: 'S OAK PARK AVE', x: 43, y: 83, rotate: -72 },
  { name: 'DIVISION ST', x: 76, y: 20, rotate: -9 },
  { name: 'RIDGELAND AVE', x: 72, y: 49, rotate: -72 },
];

interface HuntMapViewProps {
  onRestaurantPress?: (restaurant: any) => void;
  /**
   * Parent supervision mode: render these nodes (a kid's map state from
   * /parent/kids/{id}/progress) instead of self-fetching the signed-in
   * kid's map. Disables polling, snacks, and proof submission — the map
   * becomes a read-only window into the kid's hunt.
   */
  parentNodes?: AdventureMapNode[];
  /** Label for the "kid is here" marker in parent mode (e.g. kid initials). */
  hereLabel?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Map size matches the available viewport (accounting for header ~60px and instructions ~50px)
const headerHeight = 60;
const instructionsHeight = 50;
const MAP_WIDTH = SCREEN_WIDTH;
// Use full screen height minus just the header, let instructions overlay if needed
const MAP_HEIGHT = SCREEN_HEIGHT - headerHeight;
const DEBUG_LOGS = false;
// Height of the app-level BottomNavigation's CONTENT (icons + labels + border),
// excluding the home-indicator inset it pads for. The Hunt screen reserves this
// PLUS the same safe-area pad the nav uses (see render) so the hint bar sits
// flush on top of the nav with no gap on web or device.
const BOTTOM_NAV_SPACE = 52;

// New "Path of Power" map art (4691x2640). Aspect ratio is resolved at
// runtime via Image.resolveAssetSource, so pan/zoom bounds adapt automatically.
const ARTBOARD_IMAGE = require('../assets/map.png');
const PATH_OF_POWER_IMAGE = require('../assets/path-of-power.png');

// Define node positions - 12 nodes matching reference: zigzag from top-left to bottom-right
// Reference pattern: starts upper-left, alternates left-right, ends with 3 horizontal at bottom
export default function HuntMapView({ onRestaurantPress, parentNodes, hereLabel }: HuntMapViewProps) {
  const insets = useSafeAreaInsets();
  const isParentView = Array.isArray(parentNodes);
  const [activeAdventure, setActiveAdventure] = useState<any>(null);
  const [adventureMap, setAdventureMap] = useState<AdventureMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<AdventureMapNode | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  // Full-screen spooky POI close-up shown when tapping a node that has scene art.
  const [poiVisible, setPoiVisible] = useState(false);
  // Transmission surfaced after an automatic GPS check-in (reuses the same
  // overlay the photo-proof flow uses).
  const [arrivedTransmission, setArrivedTransmission] = useState<Transmission | null>(null);
  const [showArrivedTransmission, setShowArrivedTransmission] = useState(false);
  // Admin-controlled snack placements (Path to Power). Replaces the old
  // per-restaurant pathStop cards.
  const [pathSnacks, setPathSnacks] = useState<PathSnack[]>([]);
  const [selectedSnack, setSelectedSnack] = useState<PathSnack | null>(null);
  const [snackModalVisible, setSnackModalVisible] = useState(false);
  // Always-on restaurant POIs (permanent fixtures, mission-independent).
  const [restaurants, setRestaurants] = useState<PathRestaurant[]>([]);
  // The restaurant whose close-up scene is open (rendered via SceneOverlay).
  const [restaurantScene, setRestaurantScene] = useState<AdventureMapNode | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: MAP_WIDTH, height: MAP_HEIGHT });
  // Actual visible viewport for the map area (measured). Using MAP_HEIGHT was causing bad bounds.
  const [viewport, setViewport] = useState({ width: MAP_WIDTH, height: MAP_HEIGHT });
  // The map fills its container exactly — the hint bar and bottom nav now live
  // in normal layout flow below it (see render), so no scroll-clearance band is
  // needed here. Kept at 0 so the pinch/zoom centre math uses the full viewport.
  const bottomOverlayHeight = 0;
  const originalImageSize = useRef<{ width: number; height: number } | null>(null);

  // 2D scroll (Menu-style) + zoom (Google Maps style)
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const horizontalRef = useRef<ScrollView | null>(null);
  const verticalRef = useRef<ScrollView | null>(null);
  const scrollOffset = useRef({ x: 0, y: 0 });
  const [isPinching, setIsPinching] = useState(false);
  const pinchState = useRef<{
    startDistance: number;
    startZoom: number;
    startOffsetX: number;
    startOffsetY: number;
    visibleW: number;
    visibleH: number;
  } | null>(null);

  // Load active adventure, map, and restaurants on mount
  useEffect(() => {
    // Parent mode: nodes come in via props — no fetching, no snacks.
    if (isParentView) {
      setAdventureMap({ id: 0, adventureId: 0, nodes: parentNodes ?? [], edges: [] });
      setPathSnacks([]);
      setRestaurants([]);
      setLoading(false);
      return;
    }

    const loadAdventureData = async () => {
      try {
        setLoading(true);
        const [adventure, pathMap] = await Promise.all([
          AdventureActions.loadActiveAdventure(),
          Repos.pathMap.get().catch(() => ({ snacks: [], restaurants: [], updatedAt: '' })),
        ]);

        setPathSnacks(pathMap.snacks ?? []);
        setRestaurants((pathMap as any).restaurants ?? []);

        if (adventure) {
          setActiveAdventure(adventure);
          const map = await AdventureActions.loadMap(adventure.id);
          setAdventureMap(map);
        }
      } catch (error) {
        console.error('Error loading adventure:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAdventureData();
  }, [isParentView, parentNodes]);

  // Keep a live ref of whether the step modal is open so the poll loop can read
  // it without resubscribing the interval on every open/close.
  const modalVisibleRef = useRef(modalVisible);
  useEffect(() => { modalVisibleRef.current = modalVisible; }, [modalVisible]);

  // Auto-refresh the map so admin changes (new transmissions, unlocked steps)
  // appear without a manual reload. Polls only while an adventure is active,
  // the app is foregrounded, and the StepDetailModal isn't open (which would
  // otherwise clobber optimistic state during a proof upload).
  useEffect(() => {
    const adventureId = activeAdventure?.id;
    if (!adventureId) return;

    const POLL_MS = 18000;
    const tick = async () => {
      if (modalVisibleRef.current) return;
      if (AppState.currentState !== 'active') return;
      try {
        const refreshedMap = await AdventureActions.refreshMap(adventureId);
        setAdventureMap(refreshedMap);
      } catch {
        // non-critical — keep the existing map on a failed poll
      }
    };

    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [activeAdventure?.id]);

  // Nodes visible to the kid are determined server-side via is_visible / status.
  // Any node that is not 'locked' should be shown on the map.
  const computeVisibleNodes = useCallback((map: AdventureMap | null): Set<number> => {
    if (!map) return new Set();
    const visible = new Set<number>();
    map.nodes.forEach(node => {
      if (node.isVisible || node.status !== 'locked') {
        visible.add(node.id);
      }
    });
    return visible;
  }, []);

  const visibleNodeIds = computeVisibleNodes(adventureMap);

  // Resolve the Artboard's intrinsic size (reliable for bundled assets, unlike Image onLoad on device).
  useEffect(() => {
    const src = Image.resolveAssetSource(ARTBOARD_IMAGE);
    if (src?.width && src?.height) {
      originalImageSize.current = { width: src.width, height: src.height };
    }
  }, []);

  // If the viewport changes (header size, safe areas, etc.), recompute the scaled image size so
  // panning bounds stay correct.
  useEffect(() => {
    if (!originalImageSize.current) return;
    const { width, height } = originalImageSize.current;
    if (!width || !height) return;

    const imageAspectRatio = width / height;
    const containerWidth = viewport.width || MAP_WIDTH;
    const containerHeight = viewport.height || MAP_HEIGHT;

    // "Cover" the viewport: the new Path of Power map is landscape (16:9), so
    // fitting to height fills the screen vertically and pans horizontally.
    // (Falls back to fit-to-width for portrait art.) min-zoom-1 keeps the
    // covered dimension fully visible.
    const coverByHeight = containerHeight * imageAspectRatio >= containerWidth;
    const scaledWidth = coverByHeight ? containerHeight * imageAspectRatio : containerWidth;
    const scaledHeight = coverByHeight ? containerHeight : containerWidth / imageAspectRatio;

    setImageDimensions({ width: scaledWidth, height: scaledHeight });
  }, [viewport.width, viewport.height]);

  // Center the (wider-than-screen) landscape map horizontally once, on first
  // layout, so it doesn't open biased to the left edge. Only runs at fit zoom.
  const didCenterRef = useRef(false);
  useEffect(() => {
    if (didCenterRef.current) return;
    if (zoomRef.current !== 1) return;
    const overflowX = imageDimensions.width - (viewport.width || 0);
    if (overflowX <= 1) return;
    const centerX = overflowX / 2;
    didCenterRef.current = true;
    requestAnimationFrame(() => {
      horizontalRef.current?.scrollTo({ x: centerX, animated: false });
      scrollOffset.current.x = centerX;
    });
  }, [imageDimensions.width, viewport.width]);

  const applyZoom = useCallback((nextZoom: number) => {
    const minZoom = 1;
    const maxZoom = 3;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, nextZoom));
    const oldZoom = zoomRef.current;
    if (Math.abs(newZoom - oldZoom) < 0.0001) return;

    const visibleW = viewport.width;
    const visibleH = Math.max(0, viewport.height - bottomOverlayHeight);

    const contentWNew = imageDimensions.width * newZoom;
    const contentHNew = imageDimensions.height * newZoom;

    // Keep the same visual center point while zooming.
    const centerX = scrollOffset.current.x + visibleW / 2;
    const centerY = scrollOffset.current.y + visibleH / 2;

    const scaleRatio = newZoom / oldZoom;
    let targetX = centerX * scaleRatio - visibleW / 2;
    let targetY = centerY * scaleRatio - visibleH / 2;

    const maxX = Math.max(0, contentWNew - visibleW);
    const maxY = Math.max(0, contentHNew - visibleH);
    targetX = Math.max(0, Math.min(maxX, targetX));
    targetY = Math.max(0, Math.min(maxY, targetY));

    zoomRef.current = newZoom;
    setZoom(newZoom);

    // Scroll after layout recalculates content size.
    requestAnimationFrame(() => {
      horizontalRef.current?.scrollTo({ x: targetX, animated: false });
      verticalRef.current?.scrollTo({ y: targetY, animated: false });
      scrollOffset.current = { x: targetX, y: targetY };
    });
  }, [bottomOverlayHeight, imageDimensions.height, imageDimensions.width, viewport.height, viewport.width]);
  
  // Calculate distance between two touches
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = touch2.pageX - touch1.pageX;
    const dy = touch2.pageY - touch1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        setIsPinching(true);
        pinchState.current = {
          startDistance: getDistance(touches),
          startZoom: zoomRef.current,
          startOffsetX: scrollOffset.current.x,
          startOffsetY: scrollOffset.current.y,
          visibleW: viewport.width,
          visibleH: Math.max(0, viewport.height - bottomOverlayHeight),
        };
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const st = pinchState.current;
        if (!st || !st.startDistance) return;

        const currentDistance = getDistance(touches);
        if (!currentDistance) return;

        const rawZoom = st.startZoom * (currentDistance / st.startDistance);
        const minZoom = 1;
        const maxZoom = 3;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, rawZoom));

        if (Math.abs(newZoom - zoomRef.current) < 0.0005) return;

        // Preserve visual center point while zooming.
        const startCenterX = st.startOffsetX + st.visibleW / 2;
        const startCenterY = st.startOffsetY + st.visibleH / 2;
        const ratio = newZoom / st.startZoom;

        const contentW = imageDimensions.width * newZoom;
        const contentH = imageDimensions.height * newZoom;
        const maxX = Math.max(0, contentW - st.visibleW);
        const maxY = Math.max(0, contentH - st.visibleH);

        let targetX = startCenterX * ratio - st.visibleW / 2;
        let targetY = startCenterY * ratio - st.visibleH / 2;
        targetX = Math.max(0, Math.min(maxX, targetX));
        targetY = Math.max(0, Math.min(maxY, targetY));

        zoomRef.current = newZoom;
        setZoom(newZoom);

        requestAnimationFrame(() => {
          horizontalRef.current?.scrollTo({ x: targetX, animated: false });
          verticalRef.current?.scrollTo({ y: targetY, animated: false });
          scrollOffset.current = { x: targetX, y: targetY };
        });
      },
      onPanResponderRelease: () => {
        pinchState.current = null;
        setIsPinching(false);
      },
      onPanResponderTerminate: () => {
        pinchState.current = null;
        setIsPinching(false);
      },
    })
  ).current;

  // Get visible nodes from adventure map
  const visibleNodes = adventureMap?.nodes.filter(node => visibleNodeIds.has(node.id)) || [];
  // The active mission's colour drives the step-node styling.
  const missionColor = (activeAdventure as any)?.color ?? '#C9943D';

  // The "current" step is the available node with the lowest sequence — it
  // gets a pulsing ring so the kid knows where to go next.
  const currentNodeId = useMemo(() => {
    const available = visibleNodes.filter((n) => n.status === 'available');
    if (available.length === 0) return null;
    return available.reduce((a, b) => (a.sequence <= b.sequence ? a : b)).id;
  }, [visibleNodes]);

  // Looping pulse driver for the current node ring.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Parent mode: the node the kid is actually "at" — pending/rejected first
  // (submitted work is still where they are), else the first available step.
  const hereNode = isParentView
    ? (visibleNodes.find((n) => n.status === 'pending' || n.status === 'rejected') ??
       visibleNodes.find((n) => n.status === 'available') ?? null)
    : null;

  const handleNodePress = (node: AdventureMapNode) => {
    if (!visibleNodeIds.has(node.id)) return;
    setSelectedNode(node);
    // Tapping a node opens its spooky close-up scene when one exists; the
    // overlay links through to the step details (proof/gps). Nodes without
    // scene art open the step detail modal directly (legacy behaviour).
    if (resolveScene(node.title)) {
      setPoiVisible(true);
    } else {
      setModalVisible(true);
    }
  };

  const handleClosePoi = () => {
    setPoiVisible(false);
    setSelectedNode(null);
  };

  const handleOpenDetailsFromPoi = (node: AdventureMapNode) => {
    setPoiVisible(false);
    setSelectedNode(node);
    setModalVisible(true);
  };

  const handleProofSubmitted = async () => {
    // Refresh map state after proof submission
    if (activeAdventure) {
      const refreshedMap = await AdventureActions.refreshMap(activeAdventure.id);
      setAdventureMap(refreshedMap);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedNode(null);
  };

  // Automatic GPS check-in: when the kid physically enters a gps step's
  // radius, the step auto-completes. Surface an "arrived" confirmation,
  // refresh the map, and play any returned transmission. Disabled in
  // parent/read-only mode.
  const handleArrived = useCallback(
    async (node: AdventureMapNode, result: ProofSubmission) => {
      showToast(`You've arrived at ${node.title}!`, 'success');
      if (activeAdventure?.id) {
        try {
          const refreshedMap = await AdventureActions.refreshMap(activeAdventure.id);
          setAdventureMap(refreshedMap);
        } catch {
          // non-critical — keep existing map on a failed refresh
        }
      }
      if (result.transmission) {
        setArrivedTransmission(result.transmission as Transmission);
        setShowArrivedTransmission(true);
      }
    },
    [activeAdventure?.id],
  );

  const { watching: locationActive } = useGeoCheckIn({
    nodes: visibleNodes,
    // Only watch (and prompt for location) when there's actually a GPS stop —
    // avoids a location permission prompt on hunts with no geofenced steps.
    enabled: !isParentView && visibleNodes.some((n) => n.requirementType === 'gps'),
    onArrived: handleArrived,
  });

  const handleDismissArrivedTransmission = () => {
    setShowArrivedTransmission(false);
    if (arrivedTransmission) {
      setArrivedTransmission({ ...arrivedTransmission, acknowledged: true });
    }
  };

  const handleSnackPress = (snack: PathSnack) => {
    setSelectedSnack(snack);
    setSnackModalVisible(true);
  };

  // Tap a restaurant POI → open its close-up scene. SceneOverlay reads the
  // image off node.transmission.payload.url, so we adapt the restaurant into
  // that shape (negative id avoids colliding with real step node ids).
  const handleRestaurantPress = (rest: PathRestaurant) => {
    setRestaurantScene({
      id: -rest.id,
      title: rest.name,
      type: 'restaurant',
      transmission: { payload: { url: rest.sceneUrl } },
    } as unknown as AdventureMapNode);
  };

  const handleCloseSnackModal = () => {
    setSnackModalVisible(false);
    setSelectedSnack(null);
  };

  const handleStartAdventure = async (snack: PathSnack) => {
    if (snack.adventureId == null) {
      showToast('This snack isn’t tied to a mission yet.', 'error');
      return;
    }
    const label = snack.adventureTitle || 'mission';
    try {
      const result = await AdventureActions.startAdventure(snack.adventureId, snack.id);
      // Surface the joined adventure + freshly-fetched map immediately so
      // the rest of HuntMapView re-renders against the kid's real progress
      // state. The /start payload re-uses the same map_nodes shape as /map.
      if (result?.adventure) setActiveAdventure(result.adventure);
      if (result?.map) setAdventureMap(result.map);
      showToast(`Started ${label}!`, 'success');
    } catch (e: any) {
      showToast(e?.message || `Could not start ${label}`, 'error');
    } finally {
      handleCloseSnackModal();
    }
  };

  // Zoom functions
  const handleZoomIn = () => {
    applyZoom(zoomRef.current * 1.25);
  };

  const handleZoomOut = () => {
    applyZoom(zoomRef.current / 1.25);
  };

  const handleFitToView = () => {
    zoomRef.current = 1;
    setZoom(1);
    // At fit zoom the landscape map is wider than the viewport — center it
    // horizontally so "Fit" frames the middle of the map rather than the edge.
    const centerX = Math.max(0, (imageDimensions.width - viewport.width) / 2);
    requestAnimationFrame(() => {
      horizontalRef.current?.scrollTo({ x: centerX, animated: true });
      verticalRef.current?.scrollTo({ y: 0, animated: true });
      scrollOffset.current = { x: centerX, y: 0 };
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#C9943D" />
        <Text style={styles.loadingText}>Loading mission map...</Text>
      </View>
    );
  }

  // Render the map whenever there's an adventure OR admin-placed snacks OR
  // always-on restaurants, so kids can browse the Path of Power even with no
  // active mission.
  if (!adventureMap && pathSnacks.length === 0 && restaurants.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>No active mission found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image 
          source={PATH_OF_POWER_IMAGE} 
          style={styles.titleImage}
          resizeMode="contain"
        />
      </View>

      <View
        style={styles.mapContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            // Avoid setState loops from tiny float diffs.
            if (Math.abs(width - viewport.width) > 0.5 || Math.abs(height - viewport.height) > 0.5) {
              setViewport({ width, height });
            }
          }
        }}
        {...pinchResponder.panHandlers}
      >
        {/* Native 2D scrolling (same feel as Menu tab). Bounds are the background image size. */}
        <ScrollView
          ref={(r) => { horizontalRef.current = r; }}
          horizontal
          scrollEnabled={!isPinching}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={{ flex: 1 }}
          onScroll={(e) => { scrollOffset.current.x = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={16}
          contentContainerStyle={{ width: imageDimensions.width * zoom }}
        >
          <ScrollView
            ref={(r) => { verticalRef.current = r; }}
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            style={{ height: Math.max(0, viewport.height - bottomOverlayHeight) }}
            onScroll={(e) => { scrollOffset.current.y = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            scrollEnabled={!isPinching}
            contentContainerStyle={{ width: imageDimensions.width * zoom, paddingBottom: bottomOverlayHeight }}
          >
            {/* Scaled content: container defines scroll bounds, inner content scales visually */}
            <View style={{ width: imageDimensions.width * zoom, height: imageDimensions.height * zoom }}>
              <View
                style={{
                  width: imageDimensions.width,
                  height: imageDimensions.height,
                  transform: [
                    { translateX: (zoom - 1) * (imageDimensions.width / 2) },
                    { translateY: (zoom - 1) * (imageDimensions.height / 2) },
                    { scale: zoom },
                  ],
                }}
              >
                <ImageBackground
                  source={ARTBOARD_IMAGE}
                  style={[styles.vintageBackground, { width: imageDimensions.width, height: imageDimensions.height }]}
                  resizeMode="contain"
                >
                  <View style={styles.vintageOverlay} />
                </ImageBackground>

                {/* Street-name labels — scale with the map since they live
                    inside the same transformed content View. */}
                {STREETS.map((street) => (
                  <Text
                    key={street.name}
                    style={[
                      styles.streetLabel,
                      {
                        left: (street.x / 100) * imageDimensions.width,
                        top: (street.y / 100) * imageDimensions.height,
                        transform: [
                          { translateX: -60 },
                          { rotate: `${street.rotate}deg` },
                        ],
                      },
                    ]}
                    numberOfLines={1}
                    pointerEvents="none"
                  >
                    {street.name}
                  </Text>
                ))}

                <Svg width={imageDimensions.width} height={imageDimensions.height} style={styles.svg}>
                  {/* No connecting line is drawn between step nodes — the
                      parchment background art already shows the winding path.
                      Only the numbered step nodes are overlaid here. */}
                  {visibleNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isCurrent = node.id === currentNodeId;
                    // Status-driven palette (Path of Power design):
                    //   completed = green, pending = amber, rejected = red,
                    //   available = gold, locked = dark fill with gold outline.
                    const GOLD = missionColor;
                    let fillColor: string;
                    let strokeColor: string;
                    switch (node.status) {
                      case 'completed':
                        fillColor = '#10b981'; strokeColor = '#10b981'; break;
                      case 'pending':
                        fillColor = '#f59e0b'; strokeColor = '#f59e0b'; break;
                      case 'rejected':
                        fillColor = '#ef4444'; strokeColor = '#ef4444'; break;
                      case 'locked':
                        fillColor = '#0a0a0a'; strokeColor = GOLD; break;
                      case 'available':
                      default:
                        fillColor = GOLD; strokeColor = GOLD; break;
                    }
                    // Use percentage coords scaled to actual image dimensions so
                    // nodes land correctly on every device size.
                    const cx = node.xPct * imageDimensions.width;
                    const cy = node.yPct * imageDimensions.height;
                    const r = isSelected ? 18 : 15;
                    const lockedTextOpacity = node.status === 'locked' ? 0.5 : 1;

                    return (
                      <G key={node.id}>
                        {/* Pulsing ring marks the current (next) step. */}
                        {isCurrent && (
                          <AnimatedCircle
                            cx={cx}
                            cy={cy}
                            r={pulse.interpolate({ inputRange: [0, 1], outputRange: [r, r + 16] })}
                            fill="none"
                            stroke={GOLD}
                            strokeWidth={2}
                            opacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] })}
                          />
                        )}
                        <Circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 3 : 2}
                          onPress={() => handleNodePress(node)}
                        />
                        {node.type === 'restaurant' ? (
                          // Restaurants read as food stops: a fork glyph instead of
                          // a number (matches the HTML gold-fork markers).
                          <Path
                            d={`M${cx - 3} ${cy - 6}V${cy - 1}M${cx} ${cy - 6}V${cy - 1}M${cx + 3} ${cy - 6}V${cy - 1}M${cx - 3} ${cy - 1}H${cx + 3}M${cx} ${cy - 1}V${cy + 7}`}
                            stroke="#FFFFFF"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            opacity={lockedTextOpacity}
                            onPress={() => handleNodePress(node)}
                          />
                        ) : (
                          <SvgText
                            x={cx}
                            y={cy}
                            fontSize={13}
                            fontWeight="700"
                            fill="#FFFFFF"
                            opacity={lockedTextOpacity}
                            textAnchor="middle"
                            alignmentBaseline="central"
                            dy={1}
                            onPress={() => handleNodePress(node)}
                          >
                            {node.sequence}
                          </SvgText>
                        )}
                      </G>
                    );
                  })}

                  {/* Always-on restaurant POIs — permanent fixtures, shown for
                      every kid regardless of mission. Gold fork markers; tap
                      opens the restaurant's close-up scene. */}
                  {restaurants.map((rest) => {
                    const cx = rest.xPct * imageDimensions.width;
                    const cy = rest.yPct * imageDimensions.height;
                    return (
                      <G key={`rest-${rest.id}`}>
                        <Circle
                          cx={cx}
                          cy={cy}
                          r={15}
                          fill="#C9943D"
                          stroke="#f0d9a8"
                          strokeWidth={2}
                          onPress={() => handleRestaurantPress(rest)}
                        />
                        <Path
                          d={`M${cx - 3} ${cy - 6}V${cy - 1}M${cx} ${cy - 6}V${cy - 1}M${cx + 3} ${cy - 6}V${cy - 1}M${cx - 3} ${cy - 1}H${cx + 3}M${cx} ${cy - 1}V${cy + 7}`}
                          stroke="#FFFFFF"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          onPress={() => handleRestaurantPress(rest)}
                        />
                      </G>
                    );
                  })}

                  {/* Parent mode: "kid is here" marker on the current step —
                      dashed ring + initials badge floating above the node. */}
                  {hereNode && (() => {
                    const cx = hereNode.xPct * imageDimensions.width;
                    const cy = hereNode.yPct * imageDimensions.height;
                    return (
                      <G>
                        <Circle
                          cx={cx}
                          cy={cy}
                          r={25}
                          fill="none"
                          stroke="#C9943D"
                          strokeWidth={2.5}
                          strokeDasharray="5 4"
                        />
                        <Circle cx={cx} cy={cy - 38} r={12} fill="#C9943D" stroke="#000" strokeWidth={1.5} />
                        <SvgText
                          x={cx}
                          y={cy - 38}
                          fontSize={9}
                          fontWeight="700"
                          fill="#000000"
                          textAnchor="middle"
                          alignmentBaseline="central"
                          dy={1}
                        >
                          {(hereLabel || 'KID').slice(0, 3)}
                        </SvgText>
                      </G>
                    );
                  })()}
                </Svg>
                
                {/* Node titles intentionally not rendered on the map —
                    tapping a node opens StepDetailModal with full context.
                    Keeps the parchment clean and matches the kid-view
                    design system (no floating chips). */}

                {/* Admin-placed snacks (Path to Power) — positioned by the
                    admin in the Path Map editor and shared with every kid. */}
                {pathSnacks.map((snack) => {
                  const left = snack.xPct * imageDimensions.width - SNACK_CARD_WIDTH / 2;
                  const top = snack.yPct * imageDimensions.height - SNACK_CARD_WIDTH / 2;
                  const isActive =
                    snack.adventureId != null && snack.adventureId === activeAdventure?.id;

                  return (
                    <TouchableOpacity
                      key={`snack-${snack.id}`}
                      style={[
                        styles.restaurantCard,
                        isActive && styles.snackHighlight,
                        { position: 'absolute', left, top },
                      ]}
                      onPress={() => handleSnackPress(snack)}
                      activeOpacity={0.85}
                    >
                      {snack.image ? (
                        <Image source={{ uri: snack.image }} style={styles.cardFoodImage} resizeMode="cover" />
                      ) : (
                        <View style={[styles.cardFoodImage, { backgroundColor: '#C9943D', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', fontWeight: '700' }}>IMG</Text>
                        </View>
                      )}
                      {!!snack.label && (
                        <Text style={styles.cardRestaurantName} numberOfLines={2}>
                          {snack.label}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* Location-active indicator — always visible while the foreground
          geofence watcher is running, so it's clear when location is sensed. */}
      {locationActive && (
        <View style={styles.locationChip} pointerEvents="none">
          <View style={styles.locationDot} />
          <Text style={styles.locationChipText}>Location on</Text>
        </View>
      )}

      {/* Zoom Controls */}
      <View style={styles.zoomControls}>
        <TouchableOpacity
          style={styles.zoomButton}
          onPress={handleZoomIn}
          activeOpacity={0.8}
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.zoomButton}
          onPress={handleZoomOut}
          activeOpacity={0.8}
        >
          <Text style={styles.zoomButtonText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomButton, styles.fitToViewButton]}
          onPress={handleFitToView}
          activeOpacity={0.8}
        >
          <Text style={styles.fitToViewText}>Fit</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions — in normal flow directly beneath the map so there's no
          dead gap between the map and the hint bar. */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          {isParentView
            ? 'Dashed ring marks where they are • Tap nodes for details'
            : 'Drag to explore • Pinch to zoom • Tap nodes to view step details'}
        </Text>
      </View>

      {/* Reserve the bottom-nav footprint (incl. the home-indicator inset the nav
          now pads for) so the hint bar sits flush on top of the app-level
          BottomNavigation (which floats absolutely over this). */}
      <View style={[styles.bottomNavSpacer, { height: BOTTOM_NAV_SPACE + Math.max(insets.bottom, 8) }]} pointerEvents="none" />

      {/* Restaurant close-up scene (pan-able full-screen image). */}
      <SceneOverlay node={restaurantScene} onClose={() => setRestaurantScene(null)} />

      {/* Step Detail Modal */}
      <StepDetailModal
        visible={modalVisible}
        node={selectedNode}
        adventureId={activeAdventure?.id}
        onClose={handleCloseModal}
        onProofSubmitted={handleProofSubmitted}
        readOnly={isParentView}
      />

      {/* Snack start-adventure popup */}
      <SnackStartModal
        visible={snackModalVisible}
        snack={selectedSnack}
        isActiveAdventure={
          selectedSnack?.adventureId != null && selectedSnack.adventureId === activeAdventure?.id
        }
        onStart={handleStartAdventure}
        onClose={handleCloseSnackModal}
      />

      {/* Transmission played after an automatic GPS arrival. */}
      <TransmissionOverlay
        transmission={arrivedTransmission}
        visible={showArrivedTransmission}
        onDismiss={handleDismissArrivedTransmission}
      />

      {/* Spooky POI close-up (pan-able scene art). */}
      <PoiZoomOverlay
        visible={poiVisible}
        node={selectedNode}
        onClose={handleClosePoi}
        onOpenDetails={handleOpenDetailsFromPoi}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  header: {
    padding: 2,
    paddingTop: 2,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
  },
  titleImage: {
    width: '80%',
    height: 60,
    maxWidth: SCREEN_WIDTH - 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#C9943D',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  mapContainer: {
    // Fills all the space between the title header and the hint bar. The hint
    // bar + nav spacer below it are in normal flow, so the map ends flush with
    // the hint bar — no magic bottom margin needed.
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    width: '100%',
  },
  mapWrapper: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    position: 'relative',
  },
  vintageBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  vintageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.1,
    zIndex: 1,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
  },
  streetLabel: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    color: 'rgba(231,224,209,0.55)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    zIndex: 1,
  },
  restaurantCard: {
    width: 72,
    backgroundColor: '#C9943D',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
    overflow: 'hidden',
  },
  snackHighlight: {
    borderWidth: 2,
    borderColor: '#C9943D',
    shadowColor: '#C9943D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 12,
  },
  cardContent: {
    padding: 0,
  },
  cardRestaurantName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000',
    padding: 4,
    paddingBottom: 3,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  cardFoodImage: {
    width: '100%',
    height: 50,
    backgroundColor: '#C9943D',
  },
  instructions: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#3f3f46',
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  // Matches the BottomNavigation footprint so the hint bar lands directly on
  // top of the nav rather than leaving a gap above it.
  bottomNavSpacer: {
    height: BOTTOM_NAV_SPACE,
    backgroundColor: '#000000',
  },
  instructionsText: {
    fontSize: 12,
    color: '#a1a1aa',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  locationChip: {
    position: 'absolute',
    left: 16,
    top: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: '#3f3f46',
    zIndex: 100,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C9943D',
  },
  locationChipText: {
    fontSize: 11,
    color: '#C9943D',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    top: 80,
    gap: 8,
    zIndex: 100,
  },
  zoomButton: {
    width: 44,
    height: 44,
    backgroundColor: '#18181b',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  fitToViewButton: {
    marginTop: 4,
  },
  zoomButtonText: {
    fontSize: 24,
    color: '#C9943D',
    fontWeight: '300',
    lineHeight: 28,
  },
  fitToViewText: {
    fontSize: 10,
    color: '#C9943D',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#a1a1aa',
  },
});

