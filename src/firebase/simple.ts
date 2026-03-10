// src/firebase/simple.ts
import { ref, get , set, push, update } from 'firebase/database';
import { db } from './init';

// Complete user data interface
export interface CompleteUserData {
  // Public profile
  username: string;
  displayName: string;
  avatar: string;
  rank: string;
  level: number;
  createdAt: string;
  
  // Stats
  highScore: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  experience: number;
  achievements: string[];
  
  // Wallet
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalWon: number;
  totalLost: number;
  totalBonus: number;
  
  // Metadata
  lastLogin: string;
  isActive: boolean;
}

// Leaderboard entry
export interface LeaderboardEntry {
  username: string;
  displayName: string;
  highScore: number;
  rank: string;
  level: number;
}

// =========== GET USER DATA ===========
/**
 * Update user stats after game
 */
export async function updateUserStats(
  username: string,
  newScore: number,
  won: boolean
): Promise<void> {
  try {
    console.log(`📊 Updating stats for ${username}: score=${newScore}, won=${won}`);
    
    // Get user UID from lookup
    const lookupRef = ref(db, `lookups/byDisplayName/${username}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.error('❌ User not found');
      return;
    }
    
    const uid = lookupSnapshot.val();
    
    // Get current stats
    const statsRef = ref(db, `users/${uid}/stats`);
    const statsSnapshot = await get(statsRef);
    
    if (statsSnapshot.exists()) {
      const currentStats = statsSnapshot.val();
      
      // Calculate new values
      const newHighScore = Math.max(currentStats.highScore || 0, newScore);
      const newTotalGames = (currentStats.totalGames || 0) + 1;
      const newTotalWins = (currentStats.totalWins || 0) + (won ? 1 : 0);
      const newTotalLosses = (currentStats.totalLosses || 0) + (won ? 0 : 1);
      const newWinStreak = won ? (currentStats.winStreak || 0) + 1 : 0;
      const newExperience = (currentStats.experience || 0) + (won ? 100 : 10);
      
      // Update stats
      await update(ref(db, `users/${uid}/stats`), {
        highScore: newHighScore,
        totalGames: newTotalGames,
        totalWins: newTotalWins,
        totalLosses: newTotalLosses,
        winStreak: newWinStreak,
        experience: newExperience,
        lastUpdated: new Date().toISOString()
      });
      
      console.log('✅ Stats updated successfully');
    }
    
  } catch (error) {
    console.error('❌ Error updating stats:', error);
  }
}
/**
 * Get ALL user data by username
 */
// src/firebase/simple.ts

export async function getUserData(username: string): Promise<CompleteUserData | null> {
  try {
    console.log(`📡 Fetching data for user: ${username}`);
    
    // Try to get user by username (key)
    const userRef = ref(db, `users/${username}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log('✅ User found by username key:', data);
      
      return {
        // Public
        username: username,
        displayName: data.public?.displayName || username,
        avatar: data.public?.avatar || 'default',
        rank: data.public?.rank || 'Bronze',
        level: data.public?.level || 1,
        createdAt: data.public?.createdAt || new Date().toISOString(),
        
        // Stats - THIS IS WHERE THE HIGH SCORE IS
        highScore: data.stats?.highScore || 0,  // Should get 150
        totalGames: data.stats?.totalGames || 0,
        totalWins: data.stats?.totalWins || 0,
        totalLosses: data.stats?.totalLosses || 0,
        winStreak: data.stats?.winStreak || 0,
        experience: data.stats?.experience || 0,
        achievements: data.stats?.achievements || [],
        
        // Wallet
        balance: data.wallet?.balance || 0,
        totalDeposited: data.wallet?.totalDeposited || 0,
        totalWithdrawn: data.wallet?.totalWithdrawn || 0,
        totalWon: data.wallet?.totalWon || 0,
        totalLost: data.wallet?.totalLost || 0,
        totalBonus: data.wallet?.totalBonus || 0,
        
        // Metadata
        lastLogin: data.private?.lastLogin || new Date().toISOString(),
        isActive: data.public?.isOnline || false
      };
    } else {
      console.log('❌ User not found by username key, trying to find by displayName...');
      
      // If not found by username key, try to search all users
      const usersRef = ref(db, 'users');
      const allUsersSnapshot = await get(usersRef);
      
      if (allUsersSnapshot.exists()) {
        const users = allUsersSnapshot.val();
        
        // Look for user with matching displayName or username in public data
        for (const [uid, userData] of Object.entries(users)) {
          const publicData = (userData as any).public;
          if (publicData?.displayName === username || publicData?.username === username) {
            console.log('✅ User found by searching:', uid, userData);
            
            const data = userData as any;
            return {
              username: username,
              displayName: publicData.displayName || username,
              avatar: publicData.avatar || 'default',
              rank: publicData.rank || 'Bronze',
              level: publicData.level || 1,
              createdAt: publicData.createdAt || new Date().toISOString(),
              highScore: data.stats?.highScore || 0,
              totalGames: data.stats?.totalGames || 0,
              totalWins: data.stats?.totalWins || 0,
              totalLosses: data.stats?.totalLosses || 0,
              winStreak: data.stats?.winStreak || 0,
              experience: data.stats?.experience || 0,
              achievements: data.stats?.achievements || [],
              balance: data.wallet?.balance || 0,
              totalDeposited: data.wallet?.totalDeposited || 0,
              totalWithdrawn: data.wallet?.totalWithdrawn || 0,
              totalWon: data.wallet?.totalWon || 0,
              totalLost: data.wallet?.totalLost || 0,
              totalBonus: data.wallet?.totalBonus || 0,
              lastLogin: data.private?.lastLogin || new Date().toISOString(),
              isActive: publicData.isOnline || false
            };
          }
        }
      }
      
      console.log('📝 No user found, returning defaults');
      return getDefaultUserData(username);
    }
    
  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    return getDefaultUserData(username);
  }
}
/**
 * Get default user data for new/guest users
 */

// src/firebase/simple.ts
/**
 * Update wallet balance
 */
// Add to src/firebase/simple.ts

export interface ScoreEntry {
  id?: string;
  date: string;
  score: number;
  won: boolean;
  timestamp: number;
}

/**
 * Save a game score to the database
 */
export async function saveGameScore(
  username: string,
  score: number,
  won: boolean
): Promise<boolean> {
  try {
    console.log(`💾 Saving score for ${username}: ${score}`);
    
    // Get user UID from lookup
    const lookupRef = ref(db, `lookups/byDisplayName/${username}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.error('❌ User not found in lookup');
      return false;
    }
    
    const uid = lookupSnapshot.val();
    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString();
    
    // Create score entry
    const scoreEntry = {
      score: score,
      won: won,
      timestamp: timestamp,
      date: date
    };
    
    // Save to user's scores list
    const scoresRef = ref(db, `users/${uid}/scores`);
    const newScoreRef = push(scoresRef);
    await set(newScoreRef, scoreEntry);
    
    console.log('✅ Score saved with ID:', newScoreRef.key);
    return true;
    
  } catch (error) {
    console.error('❌ Error saving score:', error);
    return false;
  }
}

/**
 * Get user's game history/scores
 */
export async function getUserScores(username: string, limit: number = 10): Promise<ScoreEntry[]> {
  try {
    console.log(`📊 Fetching scores for: ${username}`);
    
    // Get user UID from lookup
    const lookupRef = ref(db, `lookups/byDisplayName/${username}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.log('❌ User not found in lookup');
      return [];
    }
    
    const uid = lookupSnapshot.val();
    
    // Get scores from user's scores list
    const scoresRef = ref(db, `users/${uid}/scores`);
    const scoresSnapshot = await get(scoresRef);
    
    if (scoresSnapshot.exists()) {
      const scoresData = scoresSnapshot.val();
      
      // Convert object to array and sort by timestamp (newest first)
      const scores: ScoreEntry[] = Object.entries(scoresData)
        .map(([id, data]: [string, any]) => ({
          id: id,
          date: new Date(data.timestamp).toLocaleDateString(),
          score: data.score,
          won: data.won,
          timestamp: data.timestamp
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
      
      console.log(`✅ Found ${scores.length} scores for ${username}`);
      return scores;
    }
    
    console.log('📝 No scores found for user');
    return [];
    
  } catch (error) {
    console.error('❌ Error fetching scores:', error);
    return [];
  }
}
export async function updateWalletBalance(
  username: string, 
  amount: number, 
  type: 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss',
  description: string
): Promise<boolean> {
  try {
    console.log(`💰 Updating wallet for ${username}: ${amount}`);
    
    // First get the user's UID from lookup
    const lookupRef = ref(db, `lookups/byDisplayName/${username}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.error('❌ User not found in lookup');
      return false;
    }
    
    const uid = lookupSnapshot.val();
    const walletRef = ref(db, `users/${uid}/wallet/balance`);
    const walletSnapshot = await get(walletRef);
    
    if (!walletSnapshot.exists()) {
      console.error('❌ Wallet not found');
      return false;
    }
    
    const currentBalance = walletSnapshot.val();
    const newBalance = currentBalance + amount;
    
    if (newBalance < 0) {
      console.log('❌ Insufficient funds');
      return false;
    }
    
    // Update balance
    await set(walletRef, newBalance);
    
    // Update lastUpdated
    await set(ref(db, `users/${uid}/wallet/lastUpdated`), new Date().toISOString());
    
    // Create transaction record
    const transactionsRef = ref(db, `transactions/${uid}`);
    const newTransactionRef = push(transactionsRef);
    await set(newTransactionRef, {
      type,
      amount,
      balance: newBalance,
      description,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Wallet updated successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Error updating wallet:', error);
    return false;
  }
}
function getDefaultUserData(username: string): CompleteUserData {
  return {
    username: username,
    displayName: username,
    avatar: 'default',
    rank: 'Bronze',
    level: 1,
    createdAt: new Date().toISOString(),
    highScore: 0,
    totalGames: 0,
    totalWins: 0,
    totalLosses: 0,
    winStreak: 0,
    experience: 0,
    achievements: [],
    balance: 10.00, // Welcome bonus
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalWon: 0,
    totalLost: 0,
    totalBonus: 10.00,
    lastLogin: new Date().toISOString(),
    isActive: true
  };
}

// =========== GET SPECIFIC DATA ===========

/**
 * Get just wallet balance
 */
export async function getUserBalance(username: string): Promise<number> {
  try {
    const balanceRef = ref(db, `users/${username}/wallet/balance`);
    const snapshot = await get(balanceRef);
    return snapshot.exists() ? snapshot.val() : 10.00;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 10.00;
  }
}

/**
 * Get just high score
 */
export async function getUserHighScore(username: string): Promise<number> {
  try {
    const scoreRef = ref(db, `users/${username}/stats/highScore`);
    const snapshot = await get(scoreRef);
    return snapshot.exists() ? snapshot.val() : 0;
  } catch (error) {
    console.error('Error getting high score:', error);
    return 0;
  }
}

// =========== LEADERBOARD ===========

/**
 * Get top players by high score
 */
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  try {
    console.log('📡 Fetching leaderboard...');
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) {
      console.log('❌ No users found');
      return [];
    }
    
    const leaderboard: LeaderboardEntry[] = [];
    const users = snapshot.val();
    
    // Loop through all users
    Object.entries(users).forEach(([username, data]: [string, any]) => {
      console.log('👤 Checking user:', username, data);
      
      // Make sure we have stats
      if (data && data.stats) {
        leaderboard.push({
          username: username,
          displayName: data.public?.displayName || username,
          highScore: data.stats.highScore || 0,
          rank: data.public?.rank || 'Bronze',
          level: data.public?.level || 1
        });
      }
    });
    
    // Sort by high score descending
    const sorted = leaderboard.sort((a, b) => b.highScore - a.highScore);
    
    // Take only the top 'limit'
    const topPlayers = sorted.slice(0, limit);
    
    console.log('✅ Leaderboard fetched:', topPlayers.length, 'players');
    return topPlayers;
    
  } catch (error) {
    console.error('❌ Error getting leaderboard:', error);
    return [];
  }
}

/**
 * Get player's rank
 */
export async function getPlayerRank(username: string): Promise<number> {
  try {
    const leaderboard = await getLeaderboard(100);
    const index = leaderboard.findIndex(entry => entry.username === username);
    return index + 1; // +1 because array is 0-based
  } catch (error) {
    console.error('❌ Error getting player rank:', error);
    return 999;
  }
}

// =========== REFRESH FUNCTIONS ===========

/**
 * Refresh all user data
 */
export async function refreshAllUserData(username: string): Promise<CompleteUserData | null> {
  return await getUserData(username);
}

/**
 * Refresh just balance and high score (for quick updates)
 */
export async function refreshBalanceAndScore(username: string): Promise<{ balance: number; highScore: number }> {
  const [balance, highScore] = await Promise.all([
    getUserBalance(username),
    getUserHighScore(username)
  ]);
  
  return { balance, highScore };
}