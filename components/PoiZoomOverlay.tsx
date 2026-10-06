import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import type { AdventureMapNode } from '../src/repositories/AdventureRepository';
import { resolveScene } from './poiScenes';

interface PoiZoomOverlayProps {
  visible: boolean;
  node: AdventureMapNode | null;
  /** Close the scene. */
  onClose: () => void;
  /** Open the step detail / proof flow for this node. */
  onOpenDetails: (node: AdventureMapNode) => void;
}

/**
 * Full-screen "spooky" close-up for a hunt stop. The scene art is larger than
 * the phone screen, so it's wrapped in nested scroll views (horizontal +
 * vertical) that let the kid drag/pan around it. Rendered as an in-tree
 * absolute overlay (not RN Modal) so the backdrop stays inside HuntMapView's
 * phone frame on web — same rationale as StepDetailModal.
 */
export default function PoiZoomOverlay({ visible, node, onClose, onOpenDetails }: PoiZoomOverlayProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });

  const scene = useMemo(() => resolveScene(node?.title), [node?.title]);

  // Resolve the scene's intrinsic aspect ratio so we can size it to "cover"
  // the viewport and guarantee something to pan in at least one axis.
  const aspect = useMemo(() => {
    if (!scene) return 9 / 16;
    const src = Image.resolveAssetSource(scene as any);
    if (src?.width && src?.height) return src.width / src.height;
    return 9 / 16;
  }, [scene]);

  if (!node || !visible) return null;

  // Cover sizing: fill the viewport, overflow whichever axis is larger.
  let displayW = box.width;
  let displayH = box.width / aspect;
  if (displayH < box.height) {
    displayH = box.height;
    displayW = box.height * aspect;
  }

  return (
    <View style={styles.overlay}>
      <View
        style={styles.sceneArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setBox({ width, height });
        }}
      >
        {scene && box.width > 0 ? (
          <ScrollView
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: Math.max(displayW, box.width) }}
          >
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ height: Math.max(displayH, box.height) }}
            >
              <Image
                source={scene}
                style={{ width: displayW, height: displayH }}
                resizeMode="cover"
              />
            </ScrollView>
          </ScrollView>
        ) : (
          <View style={styles.noScene}>
            <Text style={styles.noSceneText}>No close-up for this stop yet.</Text>
          </View>
        )}

        {/* Vignette + caption for a "spooky" framing. */}
        <View style={styles.topGradient} pointerEvents="none" />
        <View style={styles.bottomGradient} pointerEvents="none" />

        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>

        <View style={styles.caption} pointerEvents="box-none">
          <Text style={styles.captionTitle} numberOfLines={2}>{node.title}</Text>
          {!!node.description && (
            <Text style={styles.captionDesc} numberOfLines={3}>{node.description}</Text>
          )}
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => onOpenDetails(node)}
            activeOpacity={0.85}
          >
            <Text style={styles.detailsButtonText}>View step details</Text>
          </TouchableOpacity>
        </View>

        {scene && (
          <View style={styles.dragHint} pointerEvents="none">
            <Text style={styles.dragHintText}>Drag to look around</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000',
    zIndex: 120,
    // @ts-ignore — RN-Web specific, harmless on native
    elevation: 120,
  },
  sceneArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  noScene: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSceneText: {
    color: '#71717a',
    fontSize: 14,
  },
  topGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 170,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 26,
    color: '#fff',
    lineHeight: 30,
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  captionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#C9943D',
    marginBottom: 6,
  },
  captionDesc: {
    fontSize: 14,
    color: '#e7e0d1',
    lineHeight: 19,
    marginBottom: 12,
  },
  detailsButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#C9943D',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
  },
  detailsButtonText: {
    color: '#070707',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dragHint: {
    position: 'absolute',
    top: 18,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  dragHintText: {
    color: 'rgba(231,224,209,0.8)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
