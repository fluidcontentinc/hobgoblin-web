import { useAppStateVersion, getEventsForUser, createEvent } from '../../state';
import type { Event } from '../../state';

export function useUserEvents(limit: number = 10): Event[] {
  useAppStateVersion();
  return getEventsForUser(limit);
}

export const EventActions = {
  createEvent,
};


