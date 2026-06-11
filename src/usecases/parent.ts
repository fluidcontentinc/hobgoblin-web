import { Repos } from './repos';
import type { Kid, KidProgress, PendingCompletion, CompletionApproval, CompletionRejection, InviteCode } from '../repositories/ParentRepository';
import type { AdventureMapNode } from '../repositories/AdventureRepository';

/**
 * The step the kid is actually "at" right now: the first node (by sequence)
 * that needs something from the kid or the parent. Pending/rejected outrank
 * available — a submitted-but-unreviewed step is still where the kid is.
 * Returns null when there's no active work (mission done or not started).
 */
export function currentStepOf(nodes: AdventureMapNode[]): AdventureMapNode | null {
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);
  return (
    ordered.find((n) => n.status === 'pending' || n.status === 'rejected') ??
    ordered.find((n) => n.status === 'available') ??
    null
  );
}

/**
 * The step after the current one (usually locked) — "where they might be
 * going". Null when there is no current step or the current step is last.
 */
export function nextStepOf(nodes: AdventureMapNode[]): AdventureMapNode | null {
  const current = currentStepOf(nodes);
  if (!current) return null;
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);
  const idx = ordered.findIndex((n) => n.id === current.id);
  return idx >= 0 && idx + 1 < ordered.length ? ordered[idx + 1] : null;
}

export const ParentActions = {
  /**
   * Load list of kids associated with the parent
   */
  async loadKids(): Promise<Kid[]> {
    return await Repos.parent.getKids();
  },

  /**
   * Load progress for a specific kid
   */
  async loadProgress(kidId: number): Promise<KidProgress> {
    return await Repos.parent.getKidProgress(kidId);
  },

  /**
   * Load all pending step completions across all linked kids
   */
  async loadPendingCompletions(): Promise<PendingCompletion[]> {
    return await Repos.parent.getPendingCompletions();
  },

  /**
   * Approve a completion request
   */
  async approveCompletion(id: number): Promise<CompletionApproval> {
    return await Repos.parent.approveCompletion(id);
  },

  /**
   * Reject a completion request
   */
  async rejectCompletion(id: number, reason?: string): Promise<CompletionRejection> {
    return await Repos.parent.rejectCompletion(id, reason);
  },

  /**
   * Generate a one-time invite code for a kid. The parent reads the code
   * aloud or shows it to the kid, who enters it in the app.
   */
  async generateInviteCode(kidName: string): Promise<InviteCode> {
    return await Repos.parent.generateInviteCode(kidName);
  },

  /**
   * List all active (unexpired, unclaimed) invite codes this parent has
   * generated. Used by the Kids tab "Pending Invites" section.
   */
  async listInviteCodes(): Promise<InviteCode[]> {
    return await Repos.parent.listInviteCodes();
  },

  /**
   * Regenerate a code. If kidId is provided, the new code is bound to that
   * already-linked kid (for new-device claim). The backend revokes any
   * prior active code for the same kid before issuing the new one.
   */
  async regenerateInviteCode(opts: { kidId?: number; kidName?: string }): Promise<InviteCode> {
    return await Repos.parent.regenerateInviteCode(opts);
  },

  /**
   * Revoke a code immediately (e.g. parent shared it with the wrong person).
   */
  async revokeInviteCode(code: string): Promise<void> {
    return await Repos.parent.revokeInviteCode(code);
  },
};
