// src/services/firebase/skyShooterQueries.ts
import { multiGameQueries } from './firebase.queries';

// Simple wrapper for Sky Shooter specific queries
export const skyShooterQueries = {
  // Get user data
  getUserData: async (username: string) => {
    // This would need to be implemented - for now, use the same approach
    // as in the StartScene
    return null;
  },
  
  // Get leaderboard
  getLeaderboard: async (limit: number = 10) => {
    return multiGameQueries.getGameLeaderboard('space-invaders', limit);
  },
  
  // Get player rank
  getPlayerRank: async (uid: string) => {
    const rankInfo = await multiGameQueries.getUserGameRank(uid, 'space-invaders');
    return rankInfo.rank;
  },
  
  // Update wallet
  updateWalletBalance: async (uid: string, amount: number, type: string, description: string) => {
    return multiGameQueries.updateWalletBalance(uid, amount, type, description);
  }
};