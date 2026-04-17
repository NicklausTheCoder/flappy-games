// src/firebase/flappyBirdSimple.ts
import { ref, get, set, push, update } from 'firebase/database';
import { db } from './init';

// Complete user data interface for Flappy Bird
export interface FlappyBirdUserData {
    // Public profile
    username: string;
    displayName: string;
    avatar: string;
    rank: string;
    level: number;
    createdAt: string;

    // Winnings tracking (separate from balance)
    totalWinnings: number;
    winningsCount: number;
    lastWinDate?: string;

    // Flappy Bird specific stats
    highScore: number;
    totalGames: number;
    totalWins: number;
    totalLosses: number;
    winStreak: number;
    bestWinStreak: number;
    totalScore: number;
    averageScore: number;
    totalFlaps: number;
    totalDistance: number;
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

// Leaderboard entry for Flappy Bird
export interface FlappyBirdLeaderboardEntry {
    username: string;
    displayName: string;
    highScore: number;
    rank: string;
    level: number;
    totalWins: number;
    winRate: number;
}

// Score entry interface
export interface FlappyBirdScoreEntry {
    id?: string;
    date: string;
    score: number;
    won: boolean;
    timestamp: number;
    game?: string;
    flaps?: number;
    distance?: number;
}

// =========== DEFAULT USER DATA ===========
function getDefaultFlappyBirdUserData(username: string): FlappyBirdUserData {
    return {
        username: username,
        displayName: username,
        avatar: 'default',
        rank: 'Bronze',
        level: 1,
        createdAt: new Date().toISOString(),

        // Winnings
        totalWinnings: 0,
        winningsCount: 0,

        // Stats
        highScore: 0,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        winStreak: 0,
        bestWinStreak: 0,
        totalScore: 0,
        averageScore: 0,
        totalFlaps: 0,
        totalDistance: 0,
        experience: 0,
        achievements: [],

        // Wallet
        balance: 10.00,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWon: 0,
        totalLost: 0,
        totalBonus: 10.00,

        // Metadata
        lastLogin: new Date().toISOString(),
        isActive: true
    };
}

// =========== GET USER DATA ===========
// =========== GET USER DATA ===========
export async function getFlappyBirdUserData(uid: string): Promise<FlappyBirdUserData | null> {
    try {
        console.log(`📡 Fetching Flappy Bird data for UID: ${uid}`);

        // Get user data directly by UID
        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.log('❌ User data not found for UID:', uid);
            return getDefaultFlappyBirdUserData('Player');
        }

        const userData = userSnapshot.val();
        const username = userData.public?.username || 'Player';

        // Get wallet balance from CORRECT path
        let balance = 0;
        const walletRef = ref(db, `wallets/${uid}/balance`);
        const walletSnapshot = await get(walletRef);

        if (walletSnapshot.exists()) {
            balance = walletSnapshot.val();
            console.log(`💰 Found balance in wallets/: $${balance}`);
        }

        // Get Flappy Bird specific game stats
        const gameStats = userData.games?.['flappy-bird'] || {
            highScore: 0,
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            winStreak: 0,
            bestWinStreak: 0,
            totalScore: 0,
            averageScore: 0,
            totalFlaps: 0,
            totalDistance: 0,
            experience: 0,
            achievements: []
        };

        // Get winnings data
        const winnings = userData.winnings || {
            total: 0,
            count: 0
        };

        return {
            username: username,
            displayName: userData.public?.displayName || username,
            avatar: userData.public?.avatar || 'default',
            rank: userData.public?.globalRank || 'Bronze',
            level: userData.public?.globalLevel || 1,
            createdAt: userData.metadata?.createdAt || new Date().toISOString(),

            // Winnings
            totalWinnings: winnings.total || 0,
            winningsCount: winnings.count || 0,
            lastWinDate: winnings.lastWin,

            // Stats
            highScore: gameStats.highScore || 0,
            totalGames: gameStats.totalGames || 0,
            totalWins: gameStats.totalWins || 0,
            totalLosses: gameStats.totalLosses || 0,
            winStreak: gameStats.winStreak || 0,
            bestWinStreak: gameStats.bestWinStreak || 0,
            totalScore: gameStats.totalScore || 0,
            averageScore: gameStats.averageScore || 0,
            totalFlaps: gameStats.totalFlaps || 0,
            totalDistance: gameStats.totalDistance || 0,
            experience: gameStats.experience || 0,
            achievements: gameStats.achievements || [],

            // Wallet
            balance: balance,
            totalDeposited: userData.wallet?.totalDeposited || 0,
            totalWithdrawn: userData.wallet?.totalWithdrawn || 0,
            totalWon: userData.wallet?.totalWon || 0,
            totalLost: userData.wallet?.totalLost || 0,
            totalBonus: userData.wallet?.totalBonus || 0,

            // Metadata
            lastLogin: userData.private?.lastLogin || new Date().toISOString(),
            isActive: userData.public?.isOnline || false
        };

    } catch (error) {
        console.error('❌ Error fetching Flappy Bird user data:', error);
        return getDefaultFlappyBirdUserData('Player');
    }
}

// =========== PROFILE STATS FUNCTIONS ===========

/**
 * Update game stats after a match
 */
export async function updateFlappyBirdProfileStats(
    uid: string,
    score: number,
    won: boolean,
    duration: number,
    flaps?: number,
    distance?: number
): Promise<void> {
    try {
        console.log(`📊 Updating Flappy Bird profile stats for UID: ${uid}`);

        const userRef = ref(db, `users/${uid}`);
        const profileRef = ref(db, `user_profiles/${uid}`);

        // Get current data from both locations
        const [userSnapshot, profileSnapshot] = await Promise.all([
            get(userRef),
            get(profileRef)
        ]);

        let currentStats: any = {};

        if (userSnapshot.exists()) {
            currentStats = userSnapshot.val().games?.['flappy-bird'] || {};
        }

        if (profileSnapshot.exists()) {
            const profileData = profileSnapshot.val();
            currentStats = {
                ...currentStats,
                highScore: profileData.highScore || 0,
                totalGames: profileData.totalGames || 0,
                totalWins: profileData.totalWins || 0,
                totalLosses: profileData.totalLosses || 0,
                winStreak: profileData.winStreak || 0,
                bestWinStreak: profileData.bestWinStreak || 0,
                displayName: profileData.displayName,
                avatar: profileData.avatar
            };
        }

        // Calculate new stats
        const newTotalGames = (currentStats.totalGames || 0) + 1;
        const newTotalScore = (currentStats.totalScore || 0) + score;
        const newAverageScore = Math.floor(newTotalScore / newTotalGames);
        const newHighScore = Math.max(currentStats.highScore || 0, score);
        const newTotalFlaps = (currentStats.totalFlaps || 0) + (flaps || 0);
        const newTotalDistance = (currentStats.totalDistance || 0) + (distance || 0);

        let newTotalWins = currentStats.totalWins || 0;
        let newTotalLosses = currentStats.totalLosses || 0;
        let newWinStreak = currentStats.winStreak || 0;
        let newBestWinStreak = currentStats.bestWinStreak || 0;

        if (won) {
            newTotalWins++;
            newWinStreak++;
            newBestWinStreak = Math.max(newBestWinStreak, newWinStreak);
        } else {
            newTotalLosses++;
            newWinStreak = 0;
        }

        // Calculate rank based on performance
        const winRate = newTotalGames > 0 ? Math.round((newTotalWins / newTotalGames) * 100) : 0;
        let newRank = 'Bronze';

        if (newHighScore >= 100 || newTotalWins >= 50) newRank = 'Diamond';
        else if (newHighScore >= 75 || newTotalWins >= 25) newRank = 'Platinum';
        else if (newHighScore >= 50 || newTotalWins >= 10) newRank = 'Gold';
        else if (newHighScore >= 25 || newTotalWins >= 5) newRank = 'Silver';

        // Level based on games played
        const newLevel = Math.floor(1 + newTotalGames / 10);

        const updates = {
            highScore: newHighScore,
            totalGames: newTotalGames,
            totalWins: newTotalWins,
            totalLosses: newTotalLosses,
            winStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            totalScore: newTotalScore,
            averageScore: newAverageScore,
            totalFlaps: newTotalFlaps,
            totalDistance: newTotalDistance,
            rank: newRank,
            level: newLevel,
            winRate: winRate,
            lastPlayed: new Date().toISOString()
        };

        // Update in users/games path
        await update(ref(db, `users/${uid}/games/flappy-bird`), updates);

        // Get user public data for profile
        const publicData = userSnapshot.exists() ? userSnapshot.val().public : {};

        // Update in user_profiles
        await set(ref(db, `user_profiles/${uid}`), {
            uid: uid,
            username: publicData.username || 'unknown',
            displayName: publicData.displayName || 'Player',
            avatar: publicData.avatar || 'default',
            highScore: newHighScore,
            totalGames: newTotalGames,
            totalWins: newTotalWins,
            totalLosses: newTotalLosses,
            winStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            rank: newRank,
            level: newLevel,
            winRate: winRate,
            lastUpdated: new Date().toISOString()
        });

        console.log(`✅ Flappy Bird profile stats updated:`, updates);

    } catch (error) {
        console.error('❌ Error updating Flappy Bird profile stats:', error);
    }
}

/**
 * Get user profile stats
 */
export async function getFlappyBirdProfileStats(uid: string): Promise<any> {
    try {
        const profileRef = ref(db, `user_profiles/${uid}`);
        const snapshot = await get(profileRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        // Fallback to games path
        const gamesRef = ref(db, `users/${uid}/games/flappy-bird`);
        const gamesSnapshot = await get(gamesRef);

        if (gamesSnapshot.exists()) {
            return gamesSnapshot.val();
        }

        return null;

    } catch (error) {
        console.error('Error getting Flappy Bird profile stats:', error);
        return null;
    }
}

/**
 * Get leaderboard based on profile stats
 */
// In flappyBirdSimple.ts
// In flappyBirdSimple.ts - Replace your existing getFlappyBirdLeaderboard
// In flappyBirdSimple.ts - Update getFlappyBirdLeaderboard
export async function getFlappyBirdLeaderboard(limit: number = 10): Promise<FlappyBirdLeaderboardEntry[]> {
    try {
        console.log('📡 Fetching Flappy Bird leaderboard from dedicated path...');
        
        // Read from dedicated Flappy Bird leaderboard path
        const leaderboardRef = ref(db, 'leaderboards/flappy-bird');
        const snapshot = await get(leaderboardRef);

        if (!snapshot.exists()) {
            console.log('No Flappy Bird leaderboard data yet');
            return [];
        }

        const leaderboard: FlappyBirdLeaderboardEntry[] = [];

        snapshot.forEach((child) => {
            const data = child.val();
            
            // Only include valid entries with scores > 0
            if (data.highScore && data.highScore > 0) {
                leaderboard.push({
                    username: data.username || 'unknown',
                    displayName: data.displayName || 'Unknown',
                    highScore: data.highScore || 0,
                    rank: data.rank || 'Bronze',
                    level: data.level || 1,
                    totalWins: data.totalWins || 0,
                    winRate: data.winRate || 0
                });
            }
        });

        // Sort by high score (descending)
        const sorted = leaderboard.sort((a, b) => b.highScore - a.highScore);
        
        console.log(`✅ Found ${sorted.length} Flappy Bird leaderboard entries`);
        
        // Log top scores for debugging
        sorted.slice(0, 5).forEach((entry, index) => {
            console.log(`  #${index + 1}: ${entry.displayName} - ${entry.highScore}`);
        });
        
        return sorted.slice(0, limit);

    } catch (error) {
        console.error('❌ Error getting Flappy Bird leaderboard:', error);
        
        // Fallback to user_profiles if dedicated path fails
        console.log('⚠️ Falling back to user_profiles...');
        return getFlappyBirdLeaderboardFallback(limit);
    }
}

// Add this fallback function for backward compatibility
async function getFlappyBirdLeaderboardFallback(limit: number): Promise<FlappyBirdLeaderboardEntry[]> {
    try {
        const profilesRef = ref(db, 'user_profiles');
        const snapshot = await get(profilesRef);

        if (!snapshot.exists()) return [];

        const leaderboard: FlappyBirdLeaderboardEntry[] = [];

        snapshot.forEach((child) => {
            const data = child.val();
            if (data.highScore && data.highScore > 0) {
                leaderboard.push({
                    username: data.username || 'unknown',
                    displayName: data.displayName || 'Unknown',
                    highScore: data.highScore || 0,
                    rank: data.rank || 'Bronze',
                    level: data.level || 1,
                    totalWins: data.totalWins || 0,
                    winRate: data.winRate || 0
                });
            }
        });

        return leaderboard
            .sort((a, b) => b.highScore - a.highScore)
            .slice(0, limit);
    } catch (error) {
        console.error('❌ Fallback leaderboard also failed:', error);
        return [];
    }
}

// Fallback function for backward compatibility
async function getLegacyFlappyBirdLeaderboard(limit: number): Promise<FlappyBirdLeaderboardEntry[]> {
    try {
        const profilesRef = ref(db, 'user_profiles');
        const snapshot = await get(profilesRef);

        if (!snapshot.exists()) return [];

        const leaderboard: FlappyBirdLeaderboardEntry[] = [];

        snapshot.forEach((child) => {
            const data = child.val();
            // Only include if they've played Flappy Bird
            if (data.highScore && data.highScore > 0) {
                leaderboard.push({
                    username: data.username || 'unknown',
                    displayName: data.displayName || 'Unknown',
                    highScore: data.highScore || 0,
                    rank: data.rank || 'Bronze',
                    level: data.level || 1,
                    totalWins: data.totalWins || 0,
                    winRate: data.winRate || 0
                });
            }
        });

        return leaderboard
            .sort((a, b) => b.highScore - a.highScore)
            .slice(0, limit);
    } catch (error) {
        console.error('Error getting legacy leaderboard:', error);
        return [];
    }
}

// =========== WINNINGS FUNCTIONS ===========

/**
 * Add winnings to user's separate winnings account (not spendable)
 */

/**
 * Get user's winnings total
 */

// In flappyBirdSimple.ts - Fix the updateFlappyBirdLeaderboard function
async function updateFlappyBirdLeaderboard(uid: string, score: number, userData: any) {
    try {
        const publicData = userData.public || {};
        const flappyBirdStats = userData.games?.['flappy-bird'] || {};
        
        // Get current high score from leaderboard
        const leaderboardRef = ref(db, `leaderboards/flappy-bird/${uid}`);
        const currentSnapshot = await get(leaderboardRef);
        
        let currentHighScore = 0;
        if (currentSnapshot.exists()) {
            currentHighScore = currentSnapshot.val().highScore || 0;
        }
        
        // Only update if new score is higher
        const newHighScore = Math.max(score, currentHighScore, flappyBirdStats.highScore || 0);
        
        // SAFELY calculate winRate - prevent NaN
        const totalGames = flappyBirdStats.totalGames || 0;
        const totalWins = flappyBirdStats.totalWins || 0;
        let winRate = 0;
        
        if (totalGames > 0) {
            winRate = Math.round((totalWins / totalGames) * 100);
        }
        
        // Ensure all numeric values are valid numbers
        const leaderboardData = {
            uid: uid,
            username: publicData.username || 'unknown',
            displayName: publicData.displayName || 'Unknown',
            avatar: publicData.avatar || 'default',
            highScore: newHighScore || 0,  // Ensure number
            totalGames: totalGames || 0,    // Ensure number
            totalWins: totalWins || 0,      // Ensure number
            rank: flappyBirdStats.rank || 'Bronze',
            level: flappyBirdStats.level || 1,
            winRate: winRate,  // Now safe - never NaN
            lastUpdated: new Date().toISOString()
        };
        
        // Validate data before saving
        console.log('📊 Saving to leaderboard:', leaderboardData);
        
        // Save to dedicated Flappy Bird leaderboard path
        await set(leaderboardRef, leaderboardData);
        
        console.log(`✅ Updated Flappy Bird leaderboard for ${uid} with score: ${newHighScore}`);
    } catch (error) {
        console.error('❌ Error updating Flappy Bird leaderboard:', error);
        // Don't throw - we don't want to break the game if leaderboard update fails
    }
}
/**
 * Get user's win count
 */
export async function getFlappyBirdWinCount(uid: string): Promise<number> {
    try {
        const countRef = ref(db, `users/${uid}/winnings/count`);
        const snapshot = await get(countRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        return 0;

    } catch (error) {
        console.error('Error getting Flappy Bird win count:', error);
        return 0;
    }
}

// =========== UPDATE WALLET BALANCE ===========
export async function deductFlappyBirdWalletBalance(
    uid: string,
    amount: number,
    description: string
): Promise<boolean> {
    try {
        console.log(`💰 Deducting ${amount} from Flappy Bird wallet for UID: ${uid}`);

        const walletRef = ref(db, `wallets/${uid}`);
        const walletSnapshot = await get(walletRef);

        if (!walletSnapshot.exists()) {
            console.log('❌ Wallet not found');
            return false;
        }

        const currentWalletData = walletSnapshot.val();
        const currentBalance = currentWalletData.balance || 0;

        // Check insufficient funds
        if (currentBalance < amount) {
            console.log('❌ Insufficient funds');
            return false;
        }

        const newBalance = currentBalance - amount;
        const newTotalLost = (currentWalletData.totalLost || 0) + amount;

        // Update wallet
        await set(ref(db, `wallets/${uid}`), {
            ...currentWalletData,
            balance: newBalance,
            totalLost: newTotalLost,
            lastUpdated: new Date().toISOString()
        });

        // Update old location for compatibility
        await set(ref(db, `users/${uid}/wallet/balance`), newBalance);

        // Create transaction record
        const transactionsRef = ref(db, `transactions/${uid}`);
        const newTransactionRef = push(transactionsRef);
        await set(newTransactionRef, {
            type: 'loss',
            amount,
            balance: newBalance,
            description,
            timestamp: new Date().toISOString()
        });

        console.log('✅ Deduction successful:', { amount, newBalance });
        return true;

    } catch (error) {
        console.error('❌ Error deducting from Flappy Bird wallet:', error);
        return false;
    }
}

// =========== SAVE GAME SCORE ===========

// src/firebase/flappyBirdSimple.ts
// In flappyBirdSimple.ts - Update your existing saveFlappyBirdScore function
// In flappyBirdSimple.ts - Update saveFlappyBirdScore
export async function saveFlappyBirdScore(
    uid: string,
    score: number,
    won: boolean,
    flaps?: number,
    distance?: number
): Promise<boolean> {
    try {
        console.log(`💾 Saving Flappy Bird score for UID: ${uid}, score: ${score}`);

        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);
        
        if (!userSnapshot.exists()) {
            console.error(`❌ User not found for UID: ${uid}`);
            return false;
        }

        const userData = userSnapshot.val();
        const timestamp = Date.now();
        const date = new Date(timestamp).toISOString();

        const scoreEntry: any = {
            gameId: 'flappy-bird',
            game: 'flappy-bird',
            score: score,
            won: won,
            timestamp: timestamp,
            date: date,
            metadata: {
                game: 'flappy-bird',
                version: '1.0.0'
            }
        };

        if (flaps !== undefined) scoreEntry.flaps = flaps;
        if (distance !== undefined) scoreEntry.distance = distance;

        // Save score under user's scores
        const scoresRef = ref(db, `users/${uid}/scores`);
        const newScoreRef = push(scoresRef);
        await set(newScoreRef, scoreEntry);

        // Update the stats FIRST so flappyBirdStats is up to date
        await updateFlappyBirdStats(uid, score, won, flaps, distance);
        
        // Get fresh user data after stats update
        const freshUserSnapshot = await get(userRef);
        const freshUserData = freshUserSnapshot.val();
        
        // THEN update the dedicated leaderboard with fresh data
        await updateFlappyBirdLeaderboard(uid, score, freshUserData);

        console.log('✅ Flappy Bird score saved with ID:', newScoreRef.key);
        return true;

    } catch (error) {
        console.error('❌ Error saving Flappy Bird score:', error);
        return false;
    }
}

// New function to save to game-specific leaderboard
async function saveToFlappyBirdLeaderboard(uid: string, score: number, userData: any) {
    try {
        const leaderboardRef = ref(db, `leaderboards/flappy-bird/${uid}`);
        const publicData = userData.public || {};
        const gameStats = userData.games?.['flappy-bird'] || {};
        
        await set(leaderboardRef, {
            uid: uid,
            username: publicData.username || 'Unknown',
            displayName: publicData.displayName || 'Unknown',
            avatar: publicData.avatar || 'default',
            highScore: Math.max(score, gameStats.highScore || 0),
            totalGames: (gameStats.totalGames || 0) + 1,
            totalWins: gameStats.totalWins || 0,
            lastPlayed: new Date().toISOString(),
            rank: gameStats.rank || 'Bronze',
            level: gameStats.level || 1
        });

        console.log('✅ Updated Flappy Bird leaderboard for:', uid);
    } catch (error) {
        console.error('❌ Error updating Flappy Bird leaderboard:', error);
    }
}
// =========== UPDATE FLAPPY BIRD STATS ===========
// =========== UPDATE FLAPPY BIRD STATS ===========
export async function updateFlappyBirdStats(
    uid: string,  // Changed from username to uid
    score: number,
    won: boolean,
    flaps?: number,
    distance?: number
): Promise<void> {
    try {
        console.log(`📊 Updating Flappy Bird stats for UID: ${uid}: score=${score}, won=${won}`);

        // No lookup needed - use UID directly
        const statsRef = ref(db, `users/${uid}/games/flappy-bird`);
        const statsSnapshot = await get(statsRef);

        let currentStats = statsSnapshot.exists() ? statsSnapshot.val() : {
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
            averageScore: 0,
            totalScore: 0,
            totalFlaps: 0,
            totalDistance: 0,
            gamesWon: 0,
            gamesLost: 0
        };

        // Calculate new values
        const newTotalGames = (currentStats.totalGames || 0) + 1;
        const newTotalScore = (currentStats.totalScore || 0) + score;
        const newAverageScore = Math.floor(newTotalScore / newTotalGames);
        const newHighScore = Math.max(currentStats.highScore || 0, score);
        const newTotalFlaps = (currentStats.totalFlaps || 0) + (flaps || 0);
        const newTotalDistance = (currentStats.totalDistance || 0) + (distance || 0);
        const newWinStreak = won ? (currentStats.winStreak || 0) + 1 : 0;
        const newBestWinStreak = Math.max(currentStats.bestWinStreak || 0, newWinStreak);
        const newExperience = (currentStats.experience || 0) + (won ? 100 : 10) + (score * 2);
        const newLevel = Math.floor(1 + newExperience / 100);

        // Determine rank based on level
        let newRank = 'Rookie';
        if (newLevel >= 50) newRank = 'Diamond';
        else if (newLevel >= 40) newRank = 'Platinum';
        else if (newLevel >= 30) newRank = 'Gold';
        else if (newLevel >= 20) newRank = 'Silver';
        else if (newLevel >= 10) newRank = 'Bronze';

        const updates: any = {
            highScore: newHighScore,
            totalGames: newTotalGames,
            totalScore: newTotalScore,
            averageScore: newAverageScore,
            totalFlaps: newTotalFlaps,
            totalDistance: newTotalDistance,
            winStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            experience: newExperience,
            level: newLevel,
            rank: newRank,
            lastPlayed: new Date().toISOString()
        };

        if (won) {
            updates.totalWins = (currentStats.totalWins || 0) + 1;
            updates.gamesWon = (currentStats.gamesWon || 0) + 1;
        } else {
            updates.totalLosses = (currentStats.totalLosses || 0) + 1;
            updates.gamesLost = (currentStats.gamesLost || 0) + 1;
        }

        // Update Flappy Bird stats
        await set(ref(db, `users/${uid}/games/flappy-bird`), updates);

        // Update global metadata
        await update(ref(db, `users/${uid}/metadata`), {
            lastGamePlayed: 'flappy-bird',
            totalPlayTime: (await get(ref(db, `users/${uid}/metadata/totalPlayTime`))).val() + 1 || 1,
            updatedAt: new Date().toISOString()
        });

        console.log('✅ Flappy Bird stats updated successfully');

    } catch (error) {
        console.error('❌ Error updating Flappy Bird stats:', error);
    }
}

// =========== GET PLAYER RANK IN FLAPPY BIRD ===========
export async function getFlappyBirdPlayerRank(username: string): Promise<number> {
    try {
        const leaderboard = await getFlappyBirdLeaderboard(100);
        const index = leaderboard.findIndex(entry => entry.username === username);
        return index + 1;
    } catch (error) {
        console.error('❌ Error getting Flappy Bird player rank:', error);
        return 999;
    }
}

// =========== GET USER SCORES ===========
// Update getFlappyBirdUserScores to filter by game
export async function getFlappyBirdUserScores(
    uid: string,
    limit: number = 10
): Promise<FlappyBirdScoreEntry[]> {
    try {
        console.log(`📊 Fetching Flappy Bird scores for UID: ${uid}`);

        const scoresRef = ref(db, `users/${uid}/scores`);
        const scoresSnapshot = await get(scoresRef);

        if (scoresSnapshot.exists()) {
            const scoresData = scoresSnapshot.val();

            // Convert object to array and filter for Flappy Bird
            const scores: FlappyBirdScoreEntry[] = Object.entries(scoresData)
                .map(([id, data]: [string, any]) => {
                    const date = new Date(data.timestamp);
                    const formattedDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
                    
                    return {
                        id: id,
                        date: formattedDate,
                        score: data.score,
                        won: data.won,
                        timestamp: data.timestamp,
                        game: data.game || data.gameId || 'flappy-bird', // Check both fields
                        flaps: data.flaps,
                        distance: data.distance
                    };
                })
                .filter(entry => entry.game === 'flappy-bird') // Strict filter for Flappy Bird
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);

            console.log(`✅ Found ${scores.length} Flappy Bird scores for UID: ${uid}`);
            return scores;
        }

        console.log('📝 No Flappy Bird scores found for user');
        return [];

    } catch (error) {
        console.error('❌ Error fetching Flappy Bird scores:', error);
        return [];
    }
}

// =========== GET BALANCE ===========
export async function getFlappyBirdBalance(uid: string): Promise<number> {
    try {
        console.log(`💰 Getting Flappy Bird balance for UID: ${uid}`);

        // Use UID directly instead of looking up by username
        const balanceRef = ref(db, `wallets/${uid}/balance`);
        const snapshot = await get(balanceRef);

        if (snapshot.exists()) {
            const balance = snapshot.val();
            console.log(`💰 Found balance in wallets/: $${balance}`);
            return balance;
        }

        console.log('⚠️ No balance found, returning default 0');
        return 0.00;

    } catch (error) {
        console.error('Error getting Flappy Bird balance:', error);
        return 0.00;
    }
}

// =========== GET USER BY UID (HELPER) ===========
export async function getFlappyBirdUserByUid(uid: string): Promise<FlappyBirdUserData | null> {
    try {
        console.log(`📡 Fetching Flappy Bird data for UID: ${uid}`);

        // Get user data directly by UID
        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.log('❌ User data not found for UID:', uid);
            return null;
        }

        const userData = userSnapshot.val();
        const username = userData.public?.username || 'Player';

        // Get wallet balance
        let balance = 0;
        const walletRef = ref(db, `wallets/${uid}/balance`);
        const walletSnapshot = await get(walletRef);

        if (walletSnapshot.exists()) {
            balance = walletSnapshot.val();
        }

        // Get Flappy Bird specific game stats
        const gameStats = userData.games?.['flappy-bird'] || {
            highScore: 0,
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            winStreak: 0,
            bestWinStreak: 0,
            totalScore: 0,
            averageScore: 0,
            totalFlaps: 0,
            totalDistance: 0,
            experience: 0,
            achievements: []
        };

        // Get winnings data
        const winnings = userData.winnings || {
            total: 0,
            count: 0
        };

        return {
            username: username,
            displayName: userData.public?.displayName || username,
            avatar: userData.public?.avatar || 'default',
            rank: userData.public?.globalRank || 'Bronze',
            level: userData.public?.globalLevel || 1,
            createdAt: userData.metadata?.createdAt || new Date().toISOString(),

            // Winnings
            totalWinnings: winnings.total || 0,
            winningsCount: winnings.count || 0,
            lastWinDate: winnings.lastWin,

            // Stats
            highScore: gameStats.highScore || 0,
            totalGames: gameStats.totalGames || 0,
            totalWins: gameStats.totalWins || 0,
            totalLosses: gameStats.totalLosses || 0,
            winStreak: gameStats.winStreak || 0,
            bestWinStreak: gameStats.bestWinStreak || 0,
            totalScore: gameStats.totalScore || 0,
            averageScore: gameStats.averageScore || 0,
            totalFlaps: gameStats.totalFlaps || 0,
            totalDistance: gameStats.totalDistance || 0,
            experience: gameStats.experience || 0,
            achievements: gameStats.achievements || [],

            // Wallet
            balance: balance,
            totalDeposited: userData.wallet?.totalDeposited || 0,
            totalWithdrawn: userData.wallet?.totalWithdrawn || 0,
            totalWon: userData.wallet?.totalWon || 0,
            totalLost: userData.wallet?.totalLost || 0,
            totalBonus: userData.wallet?.totalBonus || 0,

            // Metadata
            lastLogin: userData.private?.lastLogin || new Date().toISOString(),
            isActive: userData.public?.isOnline || false
        };

    } catch (error) {
        console.error('❌ Error fetching Flappy Bird user by UID:', error);
        return null;
    }
}