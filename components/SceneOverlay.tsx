import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Animated, PanResponder, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { resolveAssetUrl } from '../src/api/config';
import type { AdventureMapNode } from '../src/repositories/AdventureRepository';

const { width: SW, height: SH } = Dimensions.get('window');

// The app-level BottomNavigation floats absolutely at the bottom of every kid
// screen. Stop short of it so the close-up image + panel don't slide under the
// footer (keeps the nav tappable and visible).
const BOTTOM_NAV_SPACE = 72;

interface Props {
  node: AdventureMapNode | null;
  onClose: () => void;
  /** Continue to the step detail (clue / proof flow). */
  onContinue?: (node: AdventureMapNode) => void;
}

/**
 * Full-screen, drag-to-explore "scene" close-up for a map node — the RN port of
 * the HTML prototype's tap-to-zoom. The image is data-driven: it comes from the
 * node's narrative-asset (transmission) image, so stock stops ship with art and
 * admin-added stops show whatever image the admin uploads. No image → a dark
 * panel with the title/clue.
 */
export default function SceneOverlay({ node, onClose, onContinue }: Props) {
  const payload: any = node?.transmission?.payload ?? null;
  const imgUri = resolveAssetUrl(payload?.url || payload?.thumbnail_url);

  const [disp, setDisp] = useState<{ w: number; h: number }>({ w: SW, h: SH });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const last = useRef({ x: 0, y: 0 });
  const bounds = useRef({ x: 0, y: 0 });

  // Resolve the image's natural size → scale it to COVER the screen, then the
  // pan bounds are how far it overflows in each axis.
  useEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    last.current = { x: 0, y: 0 };
    bounds.current = { x: 0, y: 0 };
    setDisp({ w: SW, h: SH });
    if (!imgUri) return;
    Image.getSize(
      imgUri,
      (iw, ih) => {
        const scale = Math.max(SW / iw, SH / ih);
        const w = iw * scale, h = ih * scale;
        setDisp({ w, h });
        bounds.current = { x: Math.max(0, (w - SW) / 2), y: Math.max(0, (h - SH) / 2) };
      },
      () => { /* keep full-screen fallback */ },
    );
  }, [imgUri]);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderMove: (_e, g) => {
        const bx = bounds.current.x, by = bounds.current.y;
        pan.setValue({
          x: Math.max(-bx, Math.min(bx, last.current.x + g.dx)),
          y: Math.max(-by, Math.min(by, last.current.y + g.dy)),
        });
      },
      onPanResponderRelease: (_e, g) => {
        const bx = bounds.current.x, by = bounds.current.y;
        last.current = {
          x: Math.max(-bx, Math.min(bx, last.current.x + g.dx)),
          y: Math.max(-by, Math.min(by, last.current.y + g.dy)),
        };
      },
    }),
  ).current;

  if (!node) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.imgWrap} {...responder.panHandlers}>
        {imgUri ? (
          <Animated.Image
            source={{ uri: imgUri }}
            style={{ width: disp.w, height: disp.h, transform: pan.getTranslateTransform() }}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.noImg} />
        )}
      </View>

      {/* top scrim + back */}
      <View pointerEvents="box-none" style={styles.topRow}>
        <TouchableOpacity style={styles.back} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.backText}>‹  Map</Text>
        </TouchableOpacity>
      </View>

      {/* bottom panel */}
      <View pointerEvents="box-none" style={styles.bottom}>
        <View style={styles.bottomScrim} />
        <View style={styles.panel}>
          <Text style={styles.kicker}>
            {node.type === 'restaurant' ? 'FOOD EVIDENCE' : 'CLUE LOCATION'}
          </Text>
          <Text style={styles.title} numberOfLines={2}>{node.title}</Text>
          {!!node.description && (
            <Text style={styles.desc} numberOfLines={3}>{node.description}</Text>
          )}
          {!!onContinue && (
            <TouchableOpacity style={styles.cta} activeOpacity={0.88} onPress={() => onContinue(node)}>
              <Text style={styles.ctaText}>Open clue</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: BOTTOM_NAV_SPACE, backgroundColor: '#06050d', zIndex: 60 },
  imgWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  noImg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b0b16' },
  topRow: { position: 'absolute', top: 16, left: 14, right: 14, flexDirection: 'row' },
  back: {
    backgroundColor: 'rgba(8,6,16,0.6)', borderColor: 'rgba(201,148,61,0.3)', borderWidth: 1,
    paddingVertical: 9, paddingHorizontal: 15, borderRadius: 30,
  },
  backText: { color: '#f0e6d2', fontSize: 13, fontWeight: '600' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 240, backgroundColor: 'transparent' },
  panel: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 34, backgroundColor: 'rgba(6,5,13,0.82)' },
  kicker: { color: '#C9943D', fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  title: { color: '#f5ecd8', fontFamily: 'Georgia', fontSize: 26, marginTop: 5, marginBottom: 8 },
  desc: { color: '#cdc4d6', fontSize: 14, lineHeight: 21, maxWidth: '92%' },
  cta: {
    marginTop: 16, alignSelf: 'flex-start', backgroundColor: '#C9943D',
    paddingVertical: 13, paddingHorizontal: 22, borderRadius: 13,
  },
  ctaText: { color: '#160f04', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});
