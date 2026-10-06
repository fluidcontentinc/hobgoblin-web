import { Repos } from './repos';
import type { Adventure, AdventureMap, AdventureStartResult, ProofUploadResult, ProofSubmission } from '../repositories/AdventureRepository';

export const AdventureActions = {
  /**
   * Load the active adventure for the current user
   */
  async loadActiveAdventure(): Promise<Adventure | null> {
    return await Repos.adventure.getActiveAdventure();
  },

  /**
   * Load map data for an adventure
   */
  async loadMap(adventureId: number): Promise<AdventureMap | null> {
    return await Repos.adventure.getAdventureMap(adventureId);
  },

  /**
   * Submit proof for a step
   */
  async submitProof(stepId: number, assetId: number): Promise<ProofSubmission> {
    return await Repos.adventure.submitProof(stepId, assetId);
  },

  /**
   * Automatic GPS geofence check-in for a `gps` step. The geofence is the
   * proof, so the backend auto-approves — no photo upload, no parent review.
   */
  async checkIn(stepId: number, lat: number, lng: number, accuracy?: number): Promise<ProofSubmission> {
    return await Repos.adventure.checkIn(stepId, lat, lng, accuracy);
  },

  /**
   * Refresh map data for an adventure (reloads the map)
   */
  async refreshMap(adventureId: number): Promise<AdventureMap | null> {
    return await Repos.adventure.getAdventureMap(adventureId);
  },

  /**
   * Upload a proof file
   */
  async uploadProof(file: File | Blob): Promise<ProofUploadResult> {
    return await Repos.adventure.uploadProof(file);
  },

  /**
   * Kid starts an adventure (from a Path to Power snack). Idempotent —
   * the backend enrolment is firstOrCreate, so subsequent calls just
   * return the existing enrollment + current map state.
   */
  async startAdventure(adventureId: number, snackId?: string | null): Promise<AdventureStartResult> {
    return await Repos.adventure.startAdventure(adventureId, snackId);
  },
};


