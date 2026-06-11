export interface Adventure {
  id: number;
  title: string;
  description?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string | null;
  /** Hex colour for this mission's step nodes on the Path of Power map. */
  color?: string | null;
}

export interface AdventureMapNode {
  id: number;
  sequence: number;
  type: string;
  /** Pixel position in the 375x812 reference SVG space (legacy callers use this). */
  x: number;
  y: number;
  /** Resolution-independent position (0..1). Preferred by new callers. */
  xPct: number;
  yPct: number;
  title: string;
  description?: string;
  requirementType?: string;
  isOptional?: boolean;
  /** Points awarded for completing this step. */
  points?: number;
  /** Backend-derived status for this step */
  status: 'completed' | 'pending' | 'rejected' | 'available' | 'locked';
  isVisible: boolean;
  isCompleted: boolean;
  isPending: boolean;
  isRejected: boolean;
  /** Transmission that fires when this step is available/completed (if any) */
  transmission?: any | null;
}

export interface AdventureMapEdge {
  from: number;
  to: number;
}

export interface AdventureMap {
  id: number;
  adventureId: number;
  nodes: AdventureMapNode[];
  edges: AdventureMapEdge[];
}

/** Result of uploading a proof asset; matches the engine's `{asset_id, url}` shape. */
export interface ProofUploadResult {
  asset_id: number;
  url: string;
}

/** Result of submitting proof for a step. */
export interface ProofSubmission {
  id: number;
  stepId: number;
  assetId: number;
  status: string;
  submittedAt: string;
  transmission?: any | null;
}

export interface AdventureEnrollment {
  id: number;
  startedAt: string;
  snackId?: string | null;
}

export interface AdventureStartResult {
  adventure: Adventure | null;
  map?: AdventureMap | null;
  enrollment?: AdventureEnrollment | null;
  snackId?: string | null;
}

export interface LeaderboardEntry {
  userId: number;
  rank: number;
  completedSteps: number;
  score: number;
  /** Optional display name override. */
  kidName?: string;
}

export interface Leaderboard {
  adventureId: number;
  adventureTitle?: string;
  entries: LeaderboardEntry[];
}

export interface AdventureRepository {
  getActiveAdventure(): Promise<AdventureStartResult | Adventure | null>;
  getAdventureMap(adventureId: number): Promise<AdventureMap | null>;
  uploadProof(file: File | Blob): Promise<ProofUploadResult>;
  submitProof(stepId: number, assetId: number): Promise<ProofSubmission>;
  startAdventure?(adventureId: number, snackId?: string | null): Promise<AdventureStartResult>;
  getLeaderboard?(adventureId: number): Promise<Leaderboard>;
}
