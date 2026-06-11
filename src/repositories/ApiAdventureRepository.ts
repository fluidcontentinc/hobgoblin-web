import type { AdventureRepository, Adventure, AdventureMap, AdventureMapNode, AdventureStartResult, ProofUploadResult, ProofSubmission, Leaderboard } from './AdventureRepository';
import api from '../api/client';

/**
 * Reference SVG dimensions used by the hardcoded zigzag fallback.
 * The artboard image is 1125×2436 (3× retina) — rendered at this size.
 */
const MAP_REF_WIDTH  = 375;
const MAP_REF_HEIGHT = 812;

/**
 * Hardcoded x/y positions (in 375×812 SVG pixel space) for up to 12 map
 * nodes — used ONLY when an adventure step has no x_pct/y_pct set by the
 * admin in the DB. Admin-placed steps override this completely.
 *
 * Zigzag pattern: bottom-left → bottom-right → ... → top.
 */
const NODE_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 80,  y: 750 }, // seq 1
  { x: 295, y: 680 }, // seq 2
  { x: 80,  y: 610 }, // seq 3
  { x: 295, y: 540 }, // seq 4
  { x: 80,  y: 470 }, // seq 5
  { x: 295, y: 400 }, // seq 6
  { x: 80,  y: 330 }, // seq 7
  { x: 295, y: 260 }, // seq 8
  { x: 80,  y: 190 }, // seq 9
  { x: 295, y: 130 }, // seq 10
  { x: 187, y: 80  }, // seq 11
  { x: 187, y: 30  }, // seq 12
];

/** Wrap a backend transmission row into the shape TransmissionOverlay reads. */
export function transformTransmission(data: any): any {
  if (!data) return null;
  return {
    id: String(data.id ?? Date.now()),
    type: data.type || 'media',
    // Backend returns flat shape: { id, type, title, url, thumbnail_url, ... }
    // TransmissionOverlay reads transmission.payload.url / .title, so wrap it.
    payload: data.payload ?? data,
    timestamp: data.timestamp || new Date().toISOString(),
    acknowledged: data.acknowledged || false,
  };
}

/**
 * Transform one raw backend map node (snake_case, from `map_nodes`) into the
 * frontend AdventureMapNode shape. Shared by the kid map (ApiAdventureRepository)
 * and the parent's kid-progress view (ApiParentRepository) so both render the
 * same map state.
 */
export function transformRawMapNode(node: any): AdventureMapNode {
  // Prefer admin-placed pct coordinates from the DB. Fall back to the
  // hardcoded zigzag by sequence when both are null (legacy adventures
  // and steps the admin hasn't placed on the parchment yet).
  const xPct: number | null = typeof node.x_pct === 'number' ? node.x_pct : null;
  const yPct: number | null = typeof node.y_pct === 'number' ? node.y_pct : null;

  let x: number;
  let y: number;
  if (xPct !== null && yPct !== null) {
    x = xPct * MAP_REF_WIDTH;
    y = yPct * MAP_REF_HEIGHT;
  } else {
    const seqIndex = (node.sequence ?? 1) - 1;
    const pos = NODE_POSITIONS[seqIndex] ?? { x: 187, y: 400 };
    x = pos.x;
    y = pos.y;
  }

  return {
    id: node.id,
    sequence: node.sequence ?? 1,
    type: node.type ?? 'standard',
    x,
    y,
    xPct: xPct ?? x / MAP_REF_WIDTH,
    yPct: yPct ?? y / MAP_REF_HEIGHT,
    title: node.title ?? '',
    description: node.description ?? undefined,
    requirementType: node.requirement_type ?? undefined,
    isOptional: node.is_optional ?? false,
    points: typeof node.points === 'number' ? node.points : 0,
    status: node.status ?? 'locked',
    isVisible: node.is_visible ?? false,
    isCompleted: node.is_completed ?? false,
    isPending: node.is_pending ?? false,
    isRejected: node.is_rejected ?? false,
    transmission: node.transmission ? transformTransmission(node.transmission) : null,
  };
}

export class ApiAdventureRepository implements AdventureRepository {
  async getActiveAdventure(): Promise<Adventure | null> {
    try {
      const data = await api.getActiveAdventure();
      return this.transformAdventure(data);
    } catch (error: any) {
      console.error('Error fetching active adventure:', error);
      // Return null if no active adventure (404 or similar)
      if (error.type === 'NOT_FOUND' || error.status === 404) {
        return null;
      }
      if (error.type) {
        throw error;
      }
      throw error;
    }
  }

  async getAdventureMap(adventureId: number): Promise<AdventureMap | null> {
    try {
      const data = await api.getAdventureMap(adventureId);
      return this.transformAdventureMap(data);
    } catch (error: any) {
      console.error(`Error fetching adventure map ${adventureId}:`, error);
      if (error.type === 'NOT_FOUND' || error.status === 404) {
        return null;
      }
      if (error.type) {
        throw error;
      }
      throw error;
    }
  }

  async uploadProof(file: File | Blob): Promise<ProofUploadResult> {
    try {
      const data = await api.uploadProof(file);
      return {
        asset_id: data.asset_id,
        url: data.url,
      };
    } catch (error: any) {
      console.error('Error uploading proof:', error);
      if (error.type) {
        throw error;
      }
      throw error;
    }
  }

  async submitProof(stepId: number, assetId: number): Promise<ProofSubmission> {
    try {
      const data = await api.submitProof(stepId, assetId);
      return {
        id: data.id,
        stepId: data.stepId,
        assetId: data.assetId,
        status: data.status,
        submittedAt: data.submittedAt,
        transmission: data.transmission ? this.transformTransmission(data.transmission) : null,
      };
    } catch (error: any) {
      console.error(`Error submitting proof for step ${stepId}:`, error);
      if (error.type) {
        throw error;
      }
      throw error;
    }
  }

  private transformTransmission(data: any): any {
    return transformTransmission(data);
  }

  async startAdventure(adventureId: number, snackId?: string | null): Promise<AdventureStartResult> {
    const data = await api.startAdventure(adventureId, snackId ?? null);
    // Backend returns { adventure, map_nodes, enrollment }. We re-use the
    // same transform as getAdventureMap so the kid map renders identically
    // whether it came from /map or /start.
    const map = this.transformAdventureMap(data);
    const adventure = this.transformAdventure(data?.adventure ?? null);
    const enrollmentRaw = data?.enrollment ?? null;
    return {
      adventure,
      map,
      enrollment: enrollmentRaw
        ? {
            id: enrollmentRaw.id,
            startedAt: enrollmentRaw.started_at ?? '',
            snackId: enrollmentRaw.snack_id ?? null,
          }
        : null,
    };
  }

  async getLeaderboard(adventureId: number): Promise<Leaderboard> {
    try {
      const data = await api.getLeaderboard(adventureId);
      return {
        adventureId: data.adventureId,
        entries: data.entries.map((entry: any) => ({
          rank: entry.rank,
          userId: entry.userId,
          userName: entry.userName,
          userEmail: entry.userEmail,
          score: entry.score,
          completedSteps: entry.completedSteps,
          completedAt: entry.completedAt || null,
        })),
      };
    } catch (error: any) {
      console.error(`Error fetching leaderboard for adventure ${adventureId}:`, error);
      if (error.type) {
        throw error;
      }
      throw error;
    }
  }

  private transformAdventure(data: any): Adventure | null {
    if (!data) return null;
    
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      status: data.status,
      color: data.color ?? null,
      startedAt: data.startedAt || data.started_at,
      completedAt: data.completedAt || data.completed_at || null,
    };
  }

  private transformAdventureMap(data: any): AdventureMap | null {
    if (!data) return null;

    // Backend returns { adventure: {...}, map_nodes: [...] }
    const adventure = data.adventure ?? data;
    const rawNodes: any[] = data.map_nodes ?? data.nodes ?? [];

    return {
      id: adventure.id ?? 0,
      adventureId: adventure.id ?? 0,
      nodes: rawNodes.map(transformRawMapNode),
      edges: [],
    };
  }
}
