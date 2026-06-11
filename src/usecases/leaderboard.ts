import { Repos } from './repos';
import type { Leaderboard } from '../repositories/AdventureRepository';

export const LeaderboardActions = {
  /**
   * Load leaderboard for an adventure
   */
  async loadLeaderboard(adventureId: number): Promise<Leaderboard> {
    return await Repos.adventure.getLeaderboard(adventureId);
  },
};


