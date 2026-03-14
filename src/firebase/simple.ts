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

// src/firebase/simple.ts

// src/firebase/simple.ts

// src/firebase/simple.ts

// =========== GET USER DATA ===========
export async function getUserData(username: string): Promise<CompleteUserData | null> {
  try {
    console.log(`📡 Fetching data for user: ${username}`);
    
    // FIXED: Use byUsername, not byDisplayName
    const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.log('❌ Username not found in lookup:', username);
      return getDefaultUserData(username);
    }
    
    const uid = lookupSnapshot.val();
    console.log('✅ Found UID:', uid);
    
    // Rest of your code...
    const userRef = ref(db, `users/${uid}`);
    const userSnapshot = await get(userRef);
    
    if (!userSnapshot.exists()) {
      console.log('❌ User data not found for UID:', uid);
      return getDefaultUserData(username);
    }
    
    const userData = userSnapshot.val();
    
    // Get wallet balance from CORRECT path
    let balance = 0;
    const walletRef = ref(db, `wallets/${uid}/balance`);
    const walletSnapshot = await get(walletRef);
    
    if (walletSnapshot.exists()) {
      balance = walletSnapshot.val();
      console.log(`💰 Found balance in wallets/: $${balance}`);
    }
    
    // Get game stats (any game)
    const gameStats = userData.games?.['flappy-bird'] || {
      highScore: 0,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      winStreak: 0,
      experience: 0,
      achievements: []
    };
    
    return {
      username: userData.public?.username || username,
      displayName: userData.public?.displayName || username,
      avatar: userData.public?.avatar || 'default',
      rank: userData.public?.globalRank || 'Bronze',
      level: userData.public?.globalLevel || 1,
      createdAt: userData.metadata?.createdAt || new Date().toISOString(),
      highScore: gameStats.highScore || 0,
      totalGames: gameStats.totalGames || 0,
      totalWins: gameStats.totalWins || 0,
      totalLosses: gameStats.totalLosses || 0,
      winStreak: gameStats.winStreak || 0,
      experience: gameStats.experience || 0,
      achievements: gameStats.achievements || [],
      balance: balance,  // This will now be 1945
      totalDeposited: userData.wallet?.totalDeposited || 0,
      totalWithdrawn: userData.wallet?.totalWithdrawn || 0,
      totalWon: userData.wallet?.totalWon || 0,
      totalLost: userData.wallet?.totalLost || 0,
      totalBonus: userData.wallet?.totalBonus || 0,
      lastLogin: userData.private?.lastLogin || new Date().toISOString(),
      isActive: userData.public?.isOnline || false
    };
    
  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    return getDefaultUserData(username);
  }
}

// Also fix updateWalletBalance and any other functions that use lookup
export async function updateWalletBalance(
  username: string, 
  amount: number, 
  type: 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss',
  description: string
): Promise<boolean> {
  try {
    console.log(`💰 Updating wallet for ${username}: ${amount}`);
    
    // FIXED: Use byUsername, not byDisplayName
    const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.error('❌ User not found in lookup');
      return false;
    }
    
    const uid = lookupSnapshot.val();
    
    // Update the CORRECT wallet path
    const walletRef = ref(db, `wallets/${uid}`);
    const walletSnapshot = await get(walletRef);
    
    let currentBalance = 0;
    let currentWalletData = {};
    
    if (walletSnapshot.exists()) {
      currentWalletData = walletSnapshot.val();
      currentBalance = currentWalletData.balance || 0;
    } else {
      currentWalletData = {
        balance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWon: 0,
        totalLost: 0,
        totalBonus: 0,
        currency: 'USD',
        isActive: true
      };
    }
    
    const newBalance = currentBalance + amount;
    
    if (newBalance < 0) {
      console.log('❌ Insufficient funds');
      return false;
    }
    
    await set(ref(db, `wallets/${uid}`), {
      ...currentWalletData,
      balance: newBalance,
      lastUpdated: new Date().toISOString()
    });
    
    // Also update old location
    await set(ref(db, `users/${uid}/wallet/balance`), newBalance);
    
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
    
    console.log('✅ Wallet updated successfully. New balance:', newBalance);
    return true;
    
  } catch (error) {
    console.error('❌ Error updating wallet:', error);
    return false;
  }
}

// Fix saveGameScore too
export async function saveGameScore(
  username: string,
  score: number,
  won: boolean
): Promise<boolean> {
  try {
    console.log(`💾 Saving score for ${username}: ${score}`);
    
    // FIXED: Use byUsername
    const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.error('❌ User not found in lookup');
      return false;
    }
    
    const uid = lookupSnapshot.val();
    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString();
    
    const scoreEntry = {
      score: score,
      won: won,
      timestamp: timestamp,
      date: date
    };
    
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
// =========== WALLET FUNCTIONS (FIXED) ===========

/**
 * Get just wallet balance - FIXED to use wallets/ path
 */
export async function getUserBalance(username: string): Promise<number> {
  try {
    console.log(`💰 Getting balance for: ${username}`);
    
    // First get the user's UID from lookup
    const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
    const lookupSnapshot = await get(lookupRef);
    
    if (!lookupSnapshot.exists()) {
      console.log('❌ User not found in lookup');
      return 10.00; // Default fallback
    }
    
    const uid = lookupSnapshot.val();
    
    // ✅ FIXED: Use wallets/ path which has the correct balance
    const balanceRef = ref(db, `wallets/${uid}/balance`);
    const snapshot = await get(balanceRef);
    
    if (snapshot.exists()) {
      const balance = snapshot.val();
      console.log(`💰 Found balance in wallets/: $${balance}`);
      return balance;
    }
    
    // Fallback to old location
    const oldBalanceRef = ref(db, `users/${uid}/wallet/balance`);
    const oldSnapshot = await get(oldBalanceRef);
    
    if (oldSnapshot.exists()) {
      console.log('⚠️ Using fallback balance from users path');
      return oldSnapshot.val();
    }
    
    return 10.00;
    
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