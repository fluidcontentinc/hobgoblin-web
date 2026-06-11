import type { Mission } from '../../state';

export interface MissionsRepository {
  list(): Promise<Mission[]>;
  getById(id: number): Promise<Mission | null>;
  /** not_started/paused → active (enroll / resume start). Idempotent. */
  start(id: number): Promise<Mission>;
  /** active → paused. */
  pause(id: number): Promise<Mission>;
  /** paused → active (auto-pauses any other active enrollment). */
  resume(id: number): Promise<Mission>;
  /** → abandoned (mission shows as Available again). */
  abandon(id: number): Promise<Mission>;
}
