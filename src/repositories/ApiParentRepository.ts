import type { ParentRepository, Kid, KidProgress, PendingCompletion, CompletionApproval, CompletionRejection, InviteCode } from './ParentRepository';
import { transformRawMapNode } from './ApiAdventureRepository';
import api from '../api/client';

/**
 * Marketplace-engine parent endpoints:
 *   GET    /parent/kids
 *   GET    /parent/kids/{id}/progress  ->  { kid, adventure, map_nodes }
 *   GET    /parent/pending-completions
 *   POST   /parent/completions/{id}/approve
 *   POST   /parent/completions/{id}/reject
 *   GET    /parent/invite-codes
 *   POST   /parent/invite-codes
 *   DELETE /parent/invite-codes/{code}
 */
export class ApiParentRepository implements ParentRepository {
  async getKids(): Promise<Kid[]> {
    try {
      const data: any = await api.getKids();
      const kids: any[] = Array.isArray(data) ? data : (data?.kids ?? []);
      return kids.map((kid: any) => this.transformKid(kid));
    } catch (error: any) {
      console.error('Error fetching kids:', error);
      throw error;
    }
  }

  async getKidProgress(kidId: number): Promise<KidProgress> {
    try {
      const data = await api.getKidProgress(kidId);
      const kid: any = data?.kid ?? {};
      const adventure: any = data?.adventure ?? null;
      const nodes: any[]   = Array.isArray(data?.map_nodes) ? data.map_nodes : [];

      const completedSteps = nodes.filter(n => n.is_completed).length;
      const totalSteps     = nodes.length;
      const progress       = totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);

      return {
        kidId:    kid.id ?? kidId,
        kidEmail: kid.email ?? '',
        kidName:  kid.name,
        activeAdventure: adventure ? {
          id:             adventure.id,
          title:          adventure.title,
          progress,
          completedSteps,
          totalSteps,
        } : null,
        completedAdventures: [],
        // Same transform the kid map uses, so the parent view renders
        // identical node state and placement.
        mapNodes: nodes.map(transformRawMapNode),
      };
    } catch (error: any) {
      console.error(`Error fetching progress for kid ${kidId}:`, error);
      throw error;
    }
  }

  async getPendingCompletions(): Promise<PendingCompletion[]> {
    try {
      const data = await api.getPendingCompletions();
      const rows: any[] = Array.isArray(data) ? data : [];
      return rows.map((r: any): PendingCompletion => ({
        id:           r.id,
        status:       'pending',
        submitted_at: r.submitted_at ?? '',
        proof_url:    r.proof_url ?? null,
        kid:  { id: r.kid?.id, name: r.kid?.name, email: r.kid?.email ?? '' },
        step: { id: r.step?.id, title: r.step?.title },
      }));
    } catch (error: any) {
      console.error('Error fetching pending completions:', error);
      throw error;
    }
  }

  async approveCompletion(id: number): Promise<CompletionApproval> {
    try {
      const result = await api.approveCompletion(id);
      return { id: result.id, status: 'approved', approvedAt: result.approvedAt };
    } catch (error: any) {
      console.error(`Error approving completion ${id}:`, error);
      throw error;
    }
  }

  async rejectCompletion(id: number, reason?: string): Promise<CompletionRejection> {
    try {
      const result = await api.rejectCompletion(id, reason);
      return { id: result.id, status: 'rejected', rejectedAt: result.rejectedAt };
    } catch (error: any) {
      console.error(`Error rejecting completion ${id}:`, error);
      throw error;
    }
  }

  async generateInviteCode(kidName: string): Promise<InviteCode> {
    try {
      const r = await api.generateInviteCode(kidName);
      return this.transformInvite(r);
    } catch (error: any) {
      console.error('Error generating invite code:', error);
      throw error;
    }
  }

  async listInviteCodes(): Promise<InviteCode[]> {
    try {
      const rows = await api.listInviteCodes();
      return rows.map((r: any) => this.transformInvite(r));
    } catch (error: any) {
      console.error('Error listing invite codes:', error);
      throw error;
    }
  }

  async regenerateInviteCode(opts: { kidId?: number; kidName?: string }): Promise<InviteCode> {
    try {
      const r = await api.generateInviteCode(opts.kidName ?? '', opts.kidId);
      return this.transformInvite(r);
    } catch (error: any) {
      console.error('Error regenerating invite code:', error);
      throw error;
    }
  }

  async revokeInviteCode(code: string): Promise<void> {
    try {
      await api.revokeInviteCode(code);
    } catch (error: any) {
      console.error(`Error revoking invite code ${code}:`, error);
      throw error;
    }
  }

  private transformInvite(r: any): InviteCode {
    return {
      code:       r.code,
      kid_name:   r.kid_name ?? '',
      kid_id:     r.kid_id ?? null,
      expires_at: r.expires_at,
      created_at: r.created_at,
    };
  }

  private transformKid(data: any): Kid {
    return {
      id:        data.id,
      email:     data.email,
      name:      data.name,
      createdAt: data.createdAt ?? data.created_at,
    };
  }
}
