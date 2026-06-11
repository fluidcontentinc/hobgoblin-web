import type { AdventureMapNode } from './AdventureRepository';

export interface Kid {
  id: number;
  email: string;
  name?: string;
  createdAt: string;
}

export interface KidAdventure {
  id: number;
  title: string;
  progress: number;
  completedSteps: number;
  totalSteps: number;
}

export interface CompletedAdventure {
  id: number;
  title: string;
  completedAt: string;
  score: number;
}

export interface KidProgress {
  kidId: number;
  kidEmail: string;
  kidName?: string;
  activeAdventure?: KidAdventure | null;
  completedAdventures: CompletedAdventure[];
  /**
   * Full per-step map state for the kid's active adventure — same shape the
   * kid's hunt map renders. Empty when there is no active adventure.
   */
  mapNodes: AdventureMapNode[];
}

export interface PendingCompletion {
  id: number;
  status: 'pending';
  submitted_at: string;
  proof_url: string | null;
  kid: { id: number; name?: string; email: string };
  step: { id: number; title?: string };
}

export interface CompletionApproval {
  id: number;
  status: 'approved';
  approvedAt: string;
}

export interface CompletionRejection {
  id: number;
  status: 'rejected';
  rejectedAt: string;
}

export interface InviteCode {
  code: string;
  kid_name: string;
  kid_id?: number | null;
  expires_at: string;
  created_at?: string;
}

export interface ParentRepository {
  getKids(): Promise<Kid[]>;
  getKidProgress(kidId: number): Promise<KidProgress>;
  getPendingCompletions(): Promise<PendingCompletion[]>;
  approveCompletion(id: number): Promise<CompletionApproval>;
  rejectCompletion(id: number, reason?: string): Promise<CompletionRejection>;
  generateInviteCode(kidName: string): Promise<InviteCode>;
  listInviteCodes(): Promise<InviteCode[]>;
  regenerateInviteCode(opts: { kidId?: number; kidName?: string }): Promise<InviteCode>;
  revokeInviteCode(code: string): Promise<void>;
}
