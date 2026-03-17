import {
  ref,
  get,
  set,
  update,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  limitToFirst,
  onValue,
  off,
  remove,
  push
} from 'firebase/database';
import { db } from './init';

// =========== GAME TYPES ===========
export type GameId = 'flappy-bird' | 'space-shooter' | 'ball-crush';

export interface GameInfo {
  id: GameId;
  name: string;
  icon: string;
  description: string;
  category: 'arcade' | 'puzzle' | 'action' | 'sports';
  enabled: boolean;
  order: number;
}

// =========== GLOBAL USER INTERFACES (Shared across games) ===========

export interface UserPublic {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  globalRank: string;        // Overall rank across all games
  globalLevel: number;       // Overall level across all games
  createdAt: string;
  isOnline: boolean;
}

export interface UserPrivate {
  email: string;
  lastLogin: string;
  isActive: boolean;
  role: 'player' | 'admin' | 'moderator';
  referredBy: string | null;
}

export interface UserWallet {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalWon: number;
  totalLost: number;
  totalBonus: number;
  currency: string;
  lastUpdated: string;
}

export interface UserMetadata {
  createdAt: string;
  updatedAt: string;
  lastGamePlayed: GameId | null;
  totalPlayTime: number;     // Minutes across all games
  favoriteGame: GameId | null;
}

// =========== GAME-SPECIFIC INTERFACES ===========

export interface GameStats {
  highScore: number;         // Game-specific high score
  totalGames: number;        // Games played for this specific game
  totalWins: number;
  totalLosses: number;
  winStreak: number;         // Current win streak for this game
  bestWinStreak: number;     // Best win streak for this game
  experience: number;        // Game-specific XP
  level: number;             // Game-specific level
  rank: string;              // Game-specific rank (Bronze/Silver/Gold etc)
  achievements: string[];    // Game-specific achievements
  lastPlayed: string;
  averageScore: number;      // Average score for this game
  totalScore: number;        // Sum of all scores for this game
  gamesWon: number;          // Number of games won
  gamesLost: number;         // Number of games lost
}

export interface GameHistoryEntry {
  id: string;
  gameId: GameId;
  score: number;
  won: boolean;
  duration: number;          // Seconds played
  timestamp: string;
  rewards: {
    experience: number;
    coins: number;
  };
}

// =========== COMPLETE USER STRUCTURE ===========

export interface CompleteUser {
  uid: string;
  public: UserPublic;
  private: UserPrivate;
  wallet: UserWallet;
  metadata: UserMetadata;
  games: {
    [K in GameId]?: GameStats;  // Game-specific stats
  };
}

// =========== LEADERBOARD ENTRIES ===========

export interface GlobalLeaderboardEntry {
  uid: string;
  username: string;
  displayName: string;
  globalLevel: number;
  globalRank: string;
  avatar: string;
  totalGames: number;        // Total across all games
  totalWins: number;         // Total across all games
  winRate: number;           // Percentage
  favoriteGame: GameId | null;
}

export interface GameLeaderboardEntry {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  highScore: number;
  level: number;
  rank: string;
  totalGames: number;
  winStreak: number;
  winRate: number;
}

// =========== MULTI-GAME QUERY SERVICE ===========

class MultiGameQueryService {

  // =========== GAME INFORMATION ===========

  private games: Record<GameId, GameInfo> = {
    'flappy-bird': {
      id: 'flappy-bird',
      name: 'Flappy Bird',
      icon: '🐦',
      description: 'Navigate through pipes',
      category: 'arcade',
      enabled: true,
      order: 1
    },
    'space-shooter': {
      id: 'space-shooter',
      name: 'Space Shooter',
      icon: '🚀',
      description: '1v1 space battle game',
      category: 'action',
      enabled: true,
      order: 2
    },
    'ball-crush': {
      id: 'ball-crush',
      name: 'Ball Crush',
      icon: '⚽',
      description: 'Crush balls and score points',
      category: 'arcade',
      enabled: true,
      order: 3
    }
  };

  getGameInfo(gameId: GameId): GameInfo {
    return this.games[gameId];
  }

  getAllGames(): GameInfo[] {
    return Object.values(this.games).filter(game => game.enabled);
  }

  // =========== USER RETRIEVAL (Global) ===========

  async getUserByUid(uid: string): Promise<CompleteUser | null> {
    try {
      console.log(`🔍 Getting user by UID: ${uid}`);
      const userRef = ref(db, `users/${uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const userData = snapshot.val();

        // CRITICAL FIX: Get the correct balance from wallets/ path
        const walletRef = ref(db, `wallets/${uid}`);
        const walletSnapshot = await get(walletRef);

        let correctBalance = userData.wallet?.balance || 0;

        if (walletSnapshot.exists()) {
          const walletData = walletSnapshot.val();
          correctBalance = walletData.balance || correctBalance;
        }

        // Create the complete user object with correct balance
        const completeUser: CompleteUser = {
          uid,
          ...userData
        };

        // Override the wallet balance with the correct one
        if (completeUser.wallet) {
          completeUser.wallet.balance = correctBalance;
        }

        return completeUser;
      }
      return null;
    } catch (error) {
      console.error('Error in getUserByUid:', error);
      return null;
    }
  }

  // =========== GAME-SPECIFIC STATS ===========

  /**
   * Get game-specific stats for a user
   */
  async getGameStats(uid: string, gameId: GameId): Promise<GameStats | null> {
    try {
      const statsRef = ref(db, `users/${uid}/games/${gameId}`);
      const snapshot = await get(statsRef);

      if (snapshot.exists()) {
        return snapshot.val() as GameStats;
      }

      // Return default stats if none exist
      return {
        highScore: 0,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        winStreak: 0,
        bestWinStreak: 0,
        experience: 0,
        level: 1,
        rank: 'Rookie',
        achievements: [],
        lastPlayed: new Date().toISOString(),
        averageScore: 0,
        totalScore: 0,
        gamesWon: 0,
        gamesLost: 0
      };
    } catch (error) {
      console.error('Error in getGameStats:', error);
      return null;
    }
  }

  /**
   * Update game stats after playing
   */
  async updateGameStats(
    uid: string,
    gameId: GameId,
    score: number,
    won: boolean,
    duration: number
  ): Promise<void> {
    try {
      const gameStatsRef = ref(db, `users/${uid}/games/${gameId}`);
      const snapshot = await get(gameStatsRef);

      let currentStats: GameStats;
      const now = new Date().toISOString();

      if (snapshot.exists()) {
        currentStats = snapshot.val() as GameStats;
      } else {
        // Initialize new game stats
        currentStats = {
          highScore: 0,
          totalGames: 0,
          totalWins: 0,
          totalLosses: 0,
          winStreak: 0,
          bestWinStreak: 0,
          experience: 0,
          level: 1,
          rank: 'Rookie',
          achievements: [],
          lastPlayed: now,
          averageScore: 0,
          totalScore: 0,
          gamesWon: 0,
          gamesLost: 0
        };
      }

      // Calculate new stats
      const newTotalGames = currentStats.totalGames + 1;
      const newTotalScore = currentStats.totalScore + score;
      const newAverageScore = Math.floor(newTotalScore / newTotalGames);

      const updates: Partial<GameStats> = {
        totalGames: newTotalGames,
        totalScore: newTotalScore,
        averageScore: newAverageScore,
        highScore: Math.max(currentStats.highScore, score),
        lastPlayed: now,
        experience: currentStats.experience + (won ? 100 : 10)
      };

      if (won) {
        updates.totalWins = (currentStats.totalWins || 0) + 1;
        updates.winStreak = (currentStats.winStreak || 0) + 1;
        updates.bestWinStreak = Math.max(
          currentStats.bestWinStreak || 0,
          (currentStats.winStreak || 0) + 1
        );
        updates.gamesWon = (currentStats.gamesWon || 0) + 1;
      } else {
        updates.totalLosses = (currentStats.totalLosses || 0) + 1;
        updates.winStreak = 0;
        updates.gamesLost = (currentStats.gamesLost || 0) + 1;
      }

      // Calculate level based on experience
      updates.level = this.calculateLevel(updates.experience || currentStats.experience);

      // Calculate rank based on level
      updates.rank = this.calculateRank(updates.level || currentStats.level);

      // Update game stats
      await update(ref(db, `users/${uid}/games/${gameId}`), updates);

      // Update global metadata
      await update(ref(db, `users/${uid}/metadata`), {
        lastGamePlayed: gameId,
        totalPlayTime: (await this.getUserByUid(uid))?.metadata.totalPlayTime + duration || duration,
        updatedAt: now
      });

      // Award coins for playing
      const coinReward = won ? 10 : 2;
      await this.updateWalletBalance(uid, coinReward, 'win', `Played ${gameId} - Score: ${score}`);

      // Create history entry
      await this.addGameHistory(uid, {
        gameId,
        score,
        won,
        duration,
        timestamp: now,
        rewards: {
          experience: won ? 100 : 10,
          coins: coinReward
        }
      });

      // Check for achievements
      await this.checkGameAchievements(uid, gameId, score);

    } catch (error) {
      console.error('Error in updateGameStats:', error);
    }
  }

  // =========== GAME HISTORY ===========

  /**
   * Add game history entry
   */
  async addGameHistory(uid: string, entry: Omit<GameHistoryEntry, 'id'>): Promise<void> {
    try {
      const historyRef = ref(db, `history/${uid}`);
      const newEntryRef = push(historyRef);
      await set(newEntryRef, entry);
    } catch (error) {
      console.error('Error in addGameHistory:', error);
    }
  }

  /**
   * Get user's game history
   */
  async getGameHistory(uid: string, gameId?: GameId, limit: number = 20): Promise<GameHistoryEntry[]> {
    try {
      const historyRef = ref(db, `history/${uid}`);
      const historyQuery = query(historyRef, limitToLast(limit));
      const snapshot = await get(historyQuery);

      if (snapshot.exists()) {
        const history: GameHistoryEntry[] = [];
        snapshot.forEach((child) => {
          const entry = child.val() as GameHistoryEntry;
          entry.id = child.key!;

          // Filter by game if specified
          if (!gameId || entry.gameId === gameId) {
            history.push(entry);
          }
        });
        return history.reverse(); // Most recent first
      }
      return [];
    } catch (error) {
      console.error('Error in getGameHistory:', error);
      return [];
    }
  }

  // =========== LEADERBOARDS ===========

  /**
   * Get global leaderboard (all games combined)
   */
  async getGlobalLeaderboard(limit: number = 10): Promise<GlobalLeaderboardEntry[]> {
    try {
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) return [];

      const leaderboard: GlobalLeaderboardEntry[] = [];
      const users = snapshot.val();

      Object.entries(users).forEach(([uid, userData]: [string, any]) => {
        // Calculate total games and wins across all games
        let totalGames = 0;
        let totalWins = 0;

        if (userData.games) {
          Object.values(userData.games).forEach((gameStats: any) => {
            totalGames += gameStats.totalGames || 0;
            totalWins += gameStats.totalWins || 0;
          });
        }

        leaderboard.push({
          uid,
          username: userData.public?.username || 'unknown',
          displayName: userData.public?.displayName || 'Unknown',
          globalLevel: userData.public?.globalLevel || 1,
          globalRank: userData.public?.globalRank || 'Bronze',
          avatar: userData.public?.avatar || 'default',
          totalGames,
          totalWins,
          winRate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0,
          favoriteGame: userData.metadata?.favoriteGame || null
        });
      });

      // Sort by total games played (or could sort by level, wins, etc)
      return leaderboard
        .sort((a, b) => b.totalGames - a.totalGames)
        .slice(0, limit);

    } catch (error) {
      console.error('Error in getGlobalLeaderboard:', error);
      return [];
    }
  }

  /**
   * Get game-specific leaderboard
   */
  async getGameLeaderboard(gameId: GameId, limit: number = 10): Promise<GameLeaderboardEntry[]> {
    try {
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) return [];

      const leaderboard: GameLeaderboardEntry[] = [];
      const users = snapshot.val();

      Object.entries(users).forEach(([uid, userData]: [string, any]) => {
        const gameStats = userData.games?.[gameId];

        if (gameStats) {
          leaderboard.push({
            uid,
            username: userData.public?.username,
            displayName: userData.public?.displayName,
            avatar: userData.public?.avatar,
            highScore: gameStats.highScore || 0,
            level: gameStats.level || 1,
            rank: gameStats.rank || 'Rookie',
            totalGames: gameStats.totalGames || 0,
            winStreak: gameStats.winStreak || 0,
            winRate: gameStats.totalGames > 0
              ? Math.round((gameStats.totalWins / gameStats.totalGames) * 100)
              : 0
          });
        }
      });

      // Sort by high score
      return leaderboard
        .sort((a, b) => b.highScore - a.highScore)
        .slice(0, limit);

    } catch (error) {
      console.error('Error in getGameLeaderboard:', error);
      return [];
    }
  }

  /**
   * Get user's rank in a specific game
   */
  async getUserGameRank(uid: string, gameId: GameId): Promise<{ rank: number; total: number }> {
    try {
      const leaderboard = await this.getGameLeaderboard(gameId, 1000);
      const userIndex = leaderboard.findIndex(entry => entry.uid === uid);

      return {
        rank: userIndex + 1,
        total: leaderboard.length
      };
    } catch (error) {
      console.error('Error in getUserGameRank:', error);
      return { rank: 0, total: 0 };
    }
  }

  // =========== ACHIEVEMENTS ===========

  /**
   * Check game-specific achievements
   */
  async checkGameAchievements(uid: string, gameId: GameId, newScore: number): Promise<string[]> {
    try {
      const gameStats = await this.getGameStats(uid, gameId);
      if (!gameStats) return [];

      const unlocked: string[] = [];
      const currentAchievements = gameStats.achievements || [];

      // Game-specific achievements
      const achievements = [
        { id: `first_${gameId}`, condition: gameStats.totalGames >= 1, name: `First ${gameId} Game` },
        { id: `first_win_${gameId}`, condition: gameStats.totalWins >= 1, name: `First ${gameId} Victory` },
        { id: `${gameId}_score_50`, condition: newScore >= 50, name: `${gameId} 50 Points` },
        { id: `${gameId}_score_100`, condition: newScore >= 100, name: `${gameId} Century` },
        { id: `${gameId}_score_200`, condition: newScore >= 200, name: `${gameId} Double Century` },
        { id: `${gameId}_win_streak_3`, condition: gameStats.winStreak >= 3, name: `${gameId} Hat Trick` },
        { id: `${gameId}_win_streak_5`, condition: gameStats.winStreak >= 5, name: `${gameId} On Fire` },
        { id: `${gameId}_veteran`, condition: gameStats.totalGames >= 10, name: `${gameId} Veteran` },
        { id: `${gameId}_legend`, condition: gameStats.totalGames >= 50, name: `${gameId} Legend` }
      ];

      achievements.forEach(achievement => {
        if (achievement.condition && !currentAchievements.includes(achievement.id)) {
          currentAchievements.push(achievement.id);
          unlocked.push(achievement.name);
        }
      });

      if (unlocked.length > 0) {
        await update(ref(db, `users/${uid}/games/${gameId}`), {
          achievements: currentAchievements
        });

        // Award bonus coins for achievement
        await this.updateWalletBalance(uid, 5.00, 'bonus', `${gameId} Achievement: ${unlocked.join(', ')}`);
      }

      return unlocked;

    } catch (error) {
      console.error('Error in checkGameAchievements:', error);
      return [];
    }
  }

  // =========== WALLET METHODS (Global) ===========

  async getWalletBalance(uid: string): Promise<number> {
    try {
      // Use the wallets/ path which has the correct balance
      const balanceRef = ref(db, `wallets/${uid}/balance`);
      const snapshot = await get(balanceRef);
      return snapshot.exists() ? snapshot.val() : 0;
    } catch (error) {
      console.error('Error in getWalletBalance:', error);
      return 0;
    }
  }

  async updateWalletBalance(uid: string, amount: number, type: string, description: string): Promise<boolean> {
    try {
      // Update the wallets/ path
      const walletRef = ref(db, `wallets/${uid}`);
      const snapshot = await get(walletRef);

      if (snapshot.exists()) {
        const wallet = snapshot.val();
        const newBalance = (wallet.balance || 0) + amount;

        if (newBalance < 0) return false;

        await update(ref(db, `wallets/${uid}`), {
          balance: newBalance,
          lastUpdated: new Date().toISOString()
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error('Error in updateWalletBalance:', error);
      return false;
    }
  }

  // =========== UTILITY METHODS ===========

  private calculateLevel(experience: number): number {
    return Math.floor(1 + experience / 100);
  }

  private calculateRank(level: number): string {
    if (level >= 50) return 'Diamond';
    if (level >= 40) return 'Platinum';
    if (level >= 30) return 'Gold';
    if (level >= 20) return 'Silver';
    if (level >= 10) return 'Bronze';
    return 'Rookie';
  }

  /**
   * Get user's favorite game (most played)
   */
  async getFavoriteGame(uid: string): Promise<GameId | null> {
    try {
      const user = await this.getUserByUid(uid);
      if (!user || !user.games) return null;

      let maxGames = 0;
      let favorite: GameId | null = null;

      Object.entries(user.games).forEach(([gameId, stats]: [string, any]) => {
        if (stats.totalGames > maxGames) {
          maxGames = stats.totalGames;
          favorite = gameId as GameId;
        }
      });

      return favorite;
    } catch (error) {
      console.error('Error in getFavoriteGame:', error);
      return null;
    }
  }
}

// Export singleton instance
export const multiGameQueries = new MultiGameQueryService();