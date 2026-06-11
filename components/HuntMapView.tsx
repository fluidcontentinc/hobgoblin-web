import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text, PanResponder, Image, ImageBackground, ScrollView, ActivityIndicator, AppState } from 'react-native';
// @ts-ignore
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { AdventureActions } from '../src/usecases/adventure';
import type { AdventureMapNode, AdventureMap } from '../src/repositories/AdventureRepository';
import StepDetailModal from './StepDetailModal';
import SnackStartModal from './SnackStartModal';
import type { PathSnack } from '../src/repositories/PathMapRepository';
import { Repos } from '../src/usecases';
import { showToast } from './common/Toast';

// Width of an admin-placed snack card on the map; used to center it on its point.
const SNACK_CARD_WIDTH = 72;

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

const ARTBOARD_IMAGE = require('../assets/artboard-1.png');
const PATH_OF_POWER_IMAGE = require('../assets/path-of-power.png');

// Define node positions - 12 nodes matching reference: zigzag from top-left to bottom-right
// Reference pattern: starts upper-left, alternates left-right, ends with 3 horizontal at bottom
export default function HuntMapView({ onRestaurantPress, parentNodes, hereLabel }: HuntMapViewProps) {
  const isParentView = Array.isArray(parentNodes);
  const [activeAdventure, setActiveAdventure] = useState<any>(null);
  const [adventureMap, setAdventureMap] = useState<AdventureMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<AdventureMapNode | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  // Admin-controlled snack placements (Path to Power). Replaces the old
  // per-restaurant pathStop cards.
  const [pathSnacks, setPathSnacks] = useState<PathSnack[]>([]);
  const [selectedSnack, setSelectedSnack] = useState<PathSnack | null>(null);
  const [snackModalVisible, setSnackModalVisible] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: MAP_WIDTH, height: MAP_HEIGHT });
  // Actual visible viewport for the map area (measured). Using MAP_HEIGHT was causing bad bounds.
  const [viewport, setViewport] = useState({ width: MAP_WIDTH, height: MAP_HEIGHT });
  // Space at the bottom that is visually covered by the instructions bar + bottom nav.
  // This lets the user scroll until content clears those overlays.
  const bottomOverlayHeight = 50;
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
      setLoading(false);
      return;
    }

    const loadAdventureData = async () => {
      try {
        setLoading(true);
        const [adventure, pathMap] = await Promise.all([
          AdventureActions.loadActiveAdventure(),
          Repos.pathMap.get().catch(() => ({ snacks: [], updatedAt: '' })),
        ]);

        setPathSnacks(pathMap.snacks ?? []);

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

    const scaledWidth = containerWidth;
    const scaledHeight = containerWidth / imageAspectRatio;

    setImageDimensions({ width: scaledWidth, height: scaledHeight });
  }, [viewport.width, viewport.height]);

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

  // Parent mode: the node the kid is actually "at" — pending/rejected first
  // (submitted work is still where they are), else the first available step.
  const hereNode = isParentView
    ? (visibleNodes.find((n) => n.status === 'pending' || n.status === 'rejected') ??
       visibleNodes.find((n) => n.status === 'available') ?? null)
    : null;

  const handleNodePress = (node: AdventureMapNode) => {
    if (visibleNodeIds.has(node.id)) {
      setSelectedNode(node);
      setModalVisible(true);
    }
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

  const handleSnackPress = (snack: PathSnack) => {
    setSelectedSnack(snack);
    setSnackModalVisible(true);
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
    requestAnimationFrame(() => {
      horizontalRef.current?.scrollTo({ x: 0, animated: true });
      verticalRef.current?.scrollTo({ y: 0, animated: true });
      scrollOffset.current = { x: 0, y: 0 };
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

  // Render the map whenever there's an adventure OR admin-placed snacks, so kids
  // can browse snacks and start an adventure straight from the Path of Power.
  if (!adventureMap && pathSnacks.length === 0) {
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
          scrollEnabled={!isPinching && zoom > 1.01}
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

                <Svg width={imageDimensions.width} height={imageDimensions.height} style={styles.svg}>
                  {/* No connecting line is drawn between step nodes — the
                      parchment background art already shows the winding path.
                      Only the numbered step nodes are overlaid here. */}
                  {visibleNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isCompleted = node.status === 'completed';
                    const isPending = node.status === 'pending';
                    // Step nodes: numbered circles in the mission's colour. Snacks
                    // (rendered below as food thumbnail chips) stay visually distinct.
                    const fillColor = isCompleted ? '#10b981' : isPending ? '#f59e0b' : isSelected ? missionColor : '#000000';
                    const strokeColor = isCompleted ? '#10b981' : isPending ? '#f59e0b' : missionColor;
                    // Use percentage coords scaled to actual image dimensions so
                    // nodes land correctly on every device size.
                    const cx = node.xPct * imageDimensions.width;
                    const cy = node.yPct * imageDimensions.height;
                    const r = isSelected ? 18 : 15;

                    return (
                      <G key={node.id}>
                        <Circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 3 : 2}
                          onPress={() => handleNodePress(node)}
                        />
                        <SvgText
                          x={cx}
                          y={cy}
                          fontSize={13}
                          fontWeight="700"
                          fill="#FFFFFF"
                          textAnchor="middle"
                          alignmentBaseline="central"
                          dy={1}
                          onPress={() => handleNodePress(node)}
                        >
                          {node.sequence}
                        </SvgText>
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
                        <View style={[styles.cardFoodImage, { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontWeight: '700' }}>IMG</Text>
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

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsText}>
          {isParentView
            ? 'Dashed ring marks where they are • Tap nodes for details'
            : 'Drag to explore • Pinch to zoom • Tap nodes to view step details'}
        </Text>
      </View>

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
    letterSpacing: 3,
    textAlign: 'center',
  },
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    width: '100%',
    height: '100%',
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
  restaurantCard: {
    width: 72,
    backgroundColor: '#000000',
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
    fontWeight: '600',
    color: '#C9943D',
    padding: 4,
    paddingBottom: 3,
    textAlign: 'center',
    backgroundColor: '#000000',
  },
  cardFoodImage: {
    width: '100%',
    height: 50,
    backgroundColor: '#f0f0f0',
  },
  instructions: {
    padding: 12,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#3f3f46',
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
    position: 'absolute',
    // BottomNavigation is position:absolute bottom:6, height ~68px.
    // Add 8px breathing room → 6 + 68 + 8 = 82.
    bottom: 82,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  instructionsText: {
    fontSize: 12,
    color: '#a1a1aa',
    textAlign: 'center',
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

