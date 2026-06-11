import type { KidStatus } from '../state';

export interface KidStatusBadge {
  label: string;
  /** Badge background colour. */
  bg: string;
  /** Badge text colour. */
  fg: string;
}

/**
 * Map a mission's kid_status to its badge label + colours. This is the single
 * source of truth for the Missions list and the detail header — the admin
 * lifecycle `status` is never surfaced on the kid side.
 */
export function kidStatusBadge(status: KidStatus): KidStatusBadge {
  switch (status) {
    case 'active':
      return { label: 'ACTIVE', bg: '#C9943D', fg: '#000000' };
    case 'paused':
      return { label: 'PAUSED', bg: '#3f3f46', fg: '#FFFFFF' };
    case 'completed':
      return { label: 'COMPLETED', bg: '#2563EB', fg: '#FFFFFF' };
    case 'not_started':
    default:
      return { label: 'AVAILABLE', bg: '#233C15', fg: '#FFFFFF' };
  }
}

/** Formats earned / total points, e.g. "30 / 70 pts". */
export function formatPoints(earned: number, total: number): string {
  return `${earned} / ${total} pts`;
}
