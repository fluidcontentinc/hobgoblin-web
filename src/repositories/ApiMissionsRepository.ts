import type { MissionsRepository } from './MissionsRepository';
import type { Mission, MissionStep, KidStatus, MissionEnrollment } from '../../state';
import api from '../api/client';

/**
 * Kid-facing "Missions" repository.
 *
 * Internally the backend calls these "Adventures" (the underlying model is
 * `Adventure`). Product-side we've unified the two concepts under the name
 * Mission, so the kid Browse → Missions tab shows the same list the admin
 * edits in Admin → Missions (which still calls the `/adventures` endpoint
 * under the hood; the rename is display-only for now).
 *
 * The deprecated standalone `/missions` endpoint (the old `Mission` model)
 * is no longer referenced from the UI but remains in the backend until a
 * separate cleanup pass retires it.
 */
export class ApiMissionsRepository implements MissionsRepository {
  async list(): Promise<Mission[]> {
    try {
      const data = await api.get('/adventures');
      return this.transformAdventures(data);
    } catch (error: any) {
      console.error('Error fetching missions:', error);
      throw error;
    }
  }

  async getById(id: number): Promise<Mission | null> {
    try {
      const data = await api.get(`/adventures/${id}`);
      return this.transformAdventure(data);
    } catch (error: any) {
      console.error(`Error fetching mission ${id}:`, error);
      throw error;
    }
  }

  /**
   * Enrollment lifecycle. Each verb POSTs to /adventures/{id}/{action} and the
   * backend returns { adventure, map_nodes, enrollment } — we read the fresh
   * adventure object (with up-to-date kid_status/points) so the caller can
   * re-render without a second round-trip. `start` is idempotent and the
   * backend enforces the single-active rule server-side (auto-pausing any
   * other active enrollment on start/resume).
   */
  async start(id: number): Promise<Mission> {
    return this.applyLifecycle(id, await api.startAdventure(id, null));
  }

  async pause(id: number): Promise<Mission> {
    return this.applyLifecycle(id, await api.pauseAdventure(id));
  }

  async resume(id: number): Promise<Mission> {
    return this.applyLifecycle(id, await api.resumeAdventure(id));
  }

  async abandon(id: number): Promise<Mission> {
    return this.applyLifecycle(id, await api.abandonAdventure(id));
  }

  /**
   * Turn a lifecycle response into a Mission. The response wraps the fresh
   * adventure under `adventure`; if (for older backends) it's missing the
   * kid fields, fall back to re-fetching the full record so the UI still
   * reflects the new state.
   */
  private async applyLifecycle(id: number, response: any): Promise<Mission> {
    const adventure = response?.adventure ?? response;
    const mission = this.transformAdventure(adventure);
    if (mission && (adventure?.kid_status || adventure?.enrollment)) {
      return mission;
    }
    const refreshed = await this.getById(id);
    if (refreshed) return refreshed;
    if (mission) return mission;
    throw new Error(`Mission ${id} not found`);
  }

  private transformAdventures(data: any): Mission[] {
    if (!Array.isArray(data)) return [];
    // Hide drafts + archives from the kid list — kids only see live missions.
    return data
      .filter((a: any) => a && (a.status === 'active' || a.is_live))
      .map((a: any) => this.transformAdventure(a))
      .filter((m): m is Mission => m !== null);
  }

  /**
   * Adventure → Mission shape adapter.
   *
   * The kid Mission card was designed for the older lightweight model
   * (location string, points integer, optional restaurantId). For Adventures:
   *   - location: synthesised from city + area
   *   - points: summed from steps when present (list payloads may omit steps,
   *     in which case it falls back to 0)
   *   - restaurantId: undefined (adventures aren't restaurant-scoped)
   *   - description / steps: passed through from the detail payload so the
   *     Missions tab can render real content instead of hardcoded placeholders
   */
  private transformAdventure(data: any): Mission | null {
    if (!data) return null;
    const city = data.city ?? '';
    const area = data.area ?? '';
    const location = [city, area].filter(Boolean).join(', ') || 'Hobgoblin City';
    const steps = this.transformSteps(data.steps);

    // Points: prefer the backend-derived totals (which include earned). Fall
    // back to summing steps when the kid fields aren't present (older payloads).
    const stepsSum = steps.reduce((sum, s) => sum + (s.points || 0), 0);
    const pointsTotal = this.num(data.points_total, stepsSum);
    const pointsEarned = this.num(data.points_earned, 0);
    const stepsTotal = this.num(data.steps_total, steps.length);
    const stepsCompleted = this.num(data.steps_completed, 0);
    const progressPct = this.num(
      data.progress_pct,
      stepsTotal > 0 ? Math.round((stepsCompleted / stepsTotal) * 100) : 0,
    );

    return {
      id:             data.id,
      title:          data.title ?? 'Untitled Mission',
      location,
      status:         data.is_live ? 'available' : (data.status === 'active' ? 'available' : 'locked'),
      kidStatus:      this.normalizeKidStatus(data.kid_status),
      points:         pointsTotal,
      pointsTotal,
      pointsEarned,
      stepsTotal,
      stepsCompleted,
      progressPct,
      color:          data.color ?? null,
      enrollment:     this.transformEnrollment(data.enrollment),
      restaurantId:   undefined,
      description:    data.description ?? undefined,
      steps:          steps.length > 0 ? steps : undefined,
    };
  }

  private normalizeKidStatus(raw: any): KidStatus {
    return raw === 'active' || raw === 'paused' || raw === 'completed'
      ? raw
      : 'not_started';
  }

  private transformEnrollment(raw: any): MissionEnrollment | null {
    if (!raw || typeof raw !== 'object') return null;
    const status = raw.status === 'active' || raw.status === 'paused'
      || raw.status === 'completed' || raw.status === 'abandoned'
      ? raw.status
      : 'active';
    return {
      id:          raw.id,
      status,
      startedAt:   raw.started_at ?? null,
      pausedAt:    raw.paused_at ?? null,
      completedAt: raw.completed_at ?? null,
    };
  }

  private num(value: any, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private transformSteps(raw: any): MissionStep[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s: any): MissionStep => ({
        id:               s.id,
        sequence:         s.sequence ?? 0,
        type:             s.type ?? 'clue',
        title:            s.title ?? 'Untitled Step',
        description:      s.description ?? null,
        requirement_type: s.requirement_type ?? 'photo',
        points:           s.points ?? 0,
      }))
      .sort((a, b) => a.sequence - b.sequence);
  }
}
