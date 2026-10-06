import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { AdventureActions } from '../src/usecases/adventure';
import type { AdventureMapNode, ProofSubmission } from '../src/repositories/AdventureRepository';

interface UseGeoCheckInParams {
  /** Current map nodes. Only `gps` + `available` nodes with a geofence are watched. */
  nodes: AdventureMapNode[];
  /** Master switch — false in parent/read-only mode so the watcher never starts. */
  enabled: boolean;
  /** Fired once when the device enters a step's radius and the check-in succeeds. */
  onArrived: (node: AdventureMapNode, result: ProofSubmission) => void;
}

interface UseGeoCheckInResult {
  /** True while the foreground location watcher is active (drives the "Location on" chip). */
  watching: boolean;
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Automatic GPS geofence check-in for `gps` adventure steps.
 *
 * Privacy posture (kid-appropriate):
 *   - Foreground only — the watcher runs while the screen is mounted and the
 *     app is active; it is torn down on unmount/background.
 *   - On-device only — positions are evaluated locally with haversine. A
 *     coordinate leaves the device ONLY at the moment of a successful geofence
 *     entry (the check-in POST). No continuous trail is ever transmitted.
 *   - Permission-gated — denied permission means no watcher and no crash.
 *
 * The hook keeps a fresh ref of the nodes so the watcher subscription doesn't
 * resubscribe on every map poll, and guards against double-firing with
 * in-flight + already-checked-in id sets.
 */
export function useGeoCheckIn({ nodes, enabled, onArrived }: UseGeoCheckInParams): UseGeoCheckInResult {
  const [watching, setWatching] = useState(false);

  // Live refs so the long-lived watcher callback always sees current values
  // without needing to resubscribe.
  const nodesRef = useRef(nodes);
  const onArrivedRef = useRef(onArrived);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { onArrivedRef.current = onArrived; }, [onArrived]);

  // Double-fire guards: a step currently being checked in, and steps already
  // checked in this session.
  const inFlight = useRef<Set<number>>(new Set());
  const checkedIn = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setWatching(false);
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const evaluate = async (coords: Location.LocationObjectCoords) => {
      const candidates = nodesRef.current.filter(
        (n) =>
          n.requirementType === 'gps' &&
          n.status === 'available' &&
          typeof n.lat === 'number' &&
          typeof n.lng === 'number' &&
          typeof n.radiusMeters === 'number' &&
          !inFlight.current.has(n.id) &&
          !checkedIn.current.has(n.id),
      );

      for (const node of candidates) {
        const distance = haversineMeters(
          coords.latitude,
          coords.longitude,
          node.lat as number,
          node.lng as number,
        );
        if (distance > (node.radiusMeters as number)) continue;

        inFlight.current.add(node.id);
        try {
          const result = await AdventureActions.checkIn(
            node.id,
            coords.latitude,
            coords.longitude,
            coords.accuracy ?? undefined,
          );
          checkedIn.current.add(node.id);
          if (!cancelled) onArrivedRef.current(node, result);
        } catch (error) {
          // Out-of-range / not-unlocked / network — drop the guard so a later
          // position can retry. Already-checked-in stays blocked above.
          console.warn(`GPS check-in failed for step ${node.id}:`, error);
        } finally {
          inFlight.current.delete(node.id);
        }
      }
    };

    const start = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) {
          // Denied / web-denied → no auto check-in, but no crash either.
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
          },
          (position) => {
            if (cancelled) return;
            void evaluate(position.coords);
          },
        );

        if (cancelled) {
          subscription?.remove();
          subscription = null;
          return;
        }
        setWatching(true);

        // Immediate check so a kid already standing inside a radius doesn't have
        // to walk ~15m for the watcher's first reading. Runs on initial start
        // AND on each foreground resume (start() is re-invoked by AppState).
        try {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!cancelled) void evaluate(current.coords);
        } catch {
          // No immediate fix → the watcher catches up once the kid moves.
        }
      } catch (error) {
        // expo-location can throw on web / unsupported environments — degrade
        // gracefully to no auto check-in.
        console.warn('Could not start location watcher:', error);
      }
    };

    void start();

    // Pause the watcher when the app is backgrounded; resume on foreground.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && subscription) {
        subscription.remove();
        subscription = null;
        setWatching(false);
      } else if (next === 'active' && !subscription && !cancelled) {
        void start();
      }
    });

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
      appStateSub.remove();
      setWatching(false);
    };
  }, [enabled]);

  return { watching };
}

export default useGeoCheckIn;
