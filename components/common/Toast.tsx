/**
 * Toast — lightweight success/error feedback widget.
 *
 * Mounted once at the app root; `showToast(message, kind)` from anywhere
 * fires a fade-in toast at the bottom-center of the screen. Toasts
 * auto-dismiss after `duration` ms unless the user taps to dismiss.
 *
 * Used by every merchant flow so a senior restaurant owner always gets
 * visible confirmation that their action did (or didn't) work — no more
 * "did saving actually happen?" guesswork.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';

type Kind = 'success' | 'error' | 'info';
type Listener = (msg: string, kind: Kind, duration: number) => void;

let _listener: Listener | null = null;

export function showToast(message: string, kind: Kind = 'success', duration = 3500) {
  _listener?.(message, kind, duration);
}

export default function ToastHost() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<Kind>('success');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    _listener = (msg, k, duration) => {
      setMessage(msg);
      setKind(k);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => dismiss(), duration);
    };
    return () => {
      _listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const dismiss = () => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setVisible(false);
    });
  };

  if (!visible) return null;

  const bg = kind === 'success' ? '#1F6E3B'
           : kind === 'error'   ? '#8B2C2C'
           :                      '#333';

  return (
    <Animated.View pointerEvents="box-none" style={[styles.host, { opacity }]}>
      <TouchableOpacity onPress={dismiss} activeOpacity={0.85} style={[styles.toast, { backgroundColor: bg }]}>
        <Text style={styles.text}>{message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    minHeight: 56,
    minWidth: 240,
    maxWidth: 480,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});
