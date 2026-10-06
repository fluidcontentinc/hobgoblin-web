import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import api from '../src/api/client';

// Shield frames, in the kid's exact upload order: shield-1 = fully exposed
// (0 candies) … shield-10 = shield complete. Frame index = locked segments.
const FRAMES = [
  require('../assets/home-world/shield-1.png'),
  require('../assets/home-world/shield-2.png'),
  require('../assets/home-world/Shield-3.png'),
  require('../assets/home-world/shield-4.png'),
  require('../assets/home-world/Shield-5.png'),
  require('../assets/home-world/Shield-6.png'),
  require('../assets/home-world/shield-7.png'),
  require('../assets/home-world/shield-8.png'),
  require('../assets/home-world/shield-9.png'),
  require('../assets/home-world/Shield-10.png'),
];

interface HomeWorld {
  candies: number;
  level: number;     // 1 = shield complete, frames = exposed
  frames: number;
  next_at: number | null;
  complete: boolean;
}

export default function HomeWorldView() {
  const [data, setData] = useState<HomeWorld | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/home-world');
        const d = (res?.data ?? res) as HomeWorld;
        if (!cancelled) setData(d);
      } catch {
        // leave data null → friendly error state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#C9943D" /></View>;
  }
  if (!data) {
    return <View style={s.center}><Text style={s.dim}>Couldn’t load your world.</Text></View>;
  }

  const segments = data.frames - data.level;          // 0 (exposed) … frames-1 (complete)
  // Frame index follows segments: 0 candies → shield-1, full shield → shield-10.
  const idx = Math.min(FRAMES.length - 1, Math.max(0, segments));
  const remaining = data.next_at != null ? Math.max(0, data.next_at - data.candies) : 0;

  return (
    <View style={s.root}>
      {/* Full-bleed background. Explicit window dimensions + absolute fill so
          `cover` reliably fills and centers on both web and native — relying on
          ImageBackground/flex alone left the planet cropped off-screen. */}
      <Image
        source={FRAMES[idx]}
        style={s.bg}
        resizeMode="cover"
        fadeDuration={0}
      />

      <Text style={s.title}>YOUR HOME WORLD</Text>

      <View style={s.bottom} pointerEvents="none">
        {data.complete ? (
          <Text style={s.statusGood}>Shield complete — your world is safe ✦</Text>
        ) : (
          <>
            <Text style={s.status}>Shield {segments} / {data.frames - 1}</Text>
            <Text style={s.sub}>
              {remaining} more {remaining === 1 ? 'candy' : 'candies'} to lock the next piece
            </Text>
          </>
        )}
        <View style={s.candyRow}>
          <Image source={require('../assets/Candy symbol.png')} style={s.candyIcon} resizeMode="contain" />
          <Text style={s.candies}>{data.candies} candies collected</Text>
        </View>
      </View>
    </View>
  );
}

const SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.9)' as const,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 7,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06060d', overflow: 'hidden' },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  center: { flex: 1, backgroundColor: '#06060d', alignItems: 'center', justifyContent: 'center' },
  title: {
    position: 'absolute', top: 20, left: 0, right: 0, textAlign: 'center',
    color: '#C9943D', fontSize: 12, letterSpacing: 2, fontWeight: '700', ...SHADOW,
  },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 100, alignItems: 'center', paddingHorizontal: 24,
  },
  status: { color: '#f5ecd8', fontFamily: 'Georgia', fontSize: 26, ...SHADOW },
  statusGood: { color: '#34d399', fontFamily: 'Georgia', fontSize: 22, textAlign: 'center', ...SHADOW },
  sub: { color: '#e0d8ec', fontSize: 14, marginTop: 6, textAlign: 'center', ...SHADOW },
  candyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  candyIcon: { width: 18, height: 18, marginRight: 6 },
  candies: { color: '#ecdcbf', fontSize: 13, letterSpacing: 0.5, ...SHADOW },
  dim: { color: '#71717a', fontSize: 15 },
});
