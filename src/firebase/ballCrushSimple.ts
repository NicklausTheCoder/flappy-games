// src/firebase/ballCrushSimple.ts
import { ref, get, set, push, update } from 'firebase/database';
import { db } from './init';

// Complete user data interface for Ball Crush
export interface BallCrushUserData {
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

    // Ball Crush specific stats
    highScore: number;
    totalGames: number;
    totalWins: number;
    totalLosses: number;
    winStreak: number;
    bestWinStreak: number;
    totalScore: number;
    averageScore: number;
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

// Leaderboard entry for Ball Crush
export interface BallCrushLeaderboardEntry {
    username: string;
    displayName: string;
    highScore: number;
    rank: string;
    level: number;
    totalWins: number;
    winRate: number;
}

// Score entry interface
export interface BallCrushScoreEntry {
    id?: string;
    date: string;
    score: number;
    won: boolean;
    timestamp: number;
    game?: string;
}

// =========== DEFAULT USER DATA ===========
function getDefaultBallCrushUserData(username: string): BallCrushUserData {
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
export async function getBallCrushUserData(username: string): Promise<BallCrushUserData | null> {
    try {
        console.log(`📡 Fetching Ball Crush data for user: ${username}`);

        // Get user UID from lookup
        const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
        const lookupSnapshot = await get(lookupRef);

        if (!lookupSnapshot.exists()) {
            console.log('❌ Username not found in lookup:', username);
            return getDefaultBallCrushUserData(username);
        }

        const uid = lookupSnapshot.val();
        console.log('✅ Found UID:', uid);

        // Get user data
        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.log('❌ User data not found for UID:', uid);
            return getDefaultBallCrushUserData(username);
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

        // Get Ball Crush specific game stats
        const gameStats = userData.games?.['ball-crush'] || {
            highScore: 0,
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            winStreak: 0,
            bestWinStreak: 0,
            totalScore: 0,
            averageScore: 0,
            experience: 0,
            achievements: []
        };

        // Get winnings data
        const winnings = userData.winnings || {
            total: 0,
            count: 0
        };

        return {
            username: userData.public?.username || username,
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
        console.error('❌ Error fetching Ball Crush user data:', error);
        return getDefaultBallCrushUserData(username);
    }
}

// =========== PROFILE STATS FUNCTIONS ===========

/**
 * Update game stats after a match
 */
export async function updateBallCrushProfileStats(
    uid: string,
    score: number,
    won: boolean,
    duration: number
): Promise<void> {
    try {
        console.log(`📊 Updating profile stats for UID: ${uid}`);

        const userRef = ref(db, `users/${uid}`);
        const profileRef = ref(db, `user_profiles/${uid}`);

        // Get current data from both locations
        const [userSnapshot, profileSnapshot] = await Promise.all([
            get(userRef),
            get(profileRef)
        ]);

        let currentStats: any = {};

        if (userSnapshot.exists()) {
            currentStats = userSnapshot.val().games?.ballCrush || {};
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

        if (newHighScore >= 1000 || newTotalWins >= 50) newRank = 'Diamond';
        else if (newHighScore >= 500 || newTotalWins >= 25) newRank = 'Platinum';
        else if (newHighScore >= 250 || newTotalWins >= 10) newRank = 'Gold';
        else if (newHighScore >= 100 || newTotalWins >= 5) newRank = 'Silver';

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
            rank: newRank,
            level: newLevel,
            winRate: winRate,
            lastPlayed: new Date().toISOString()
        };

        // Update in users/games path
        await update(ref(db, `users/${uid}/games/ball-crush`), updates);

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

        console.log(`✅ Profile stats updated:`, updates);

    } catch (error) {
        console.error('❌ Error updating profile stats:', error);
    }
}

/**
 * Get user profile stats
 */
export async function getBallCrushProfileStats(uid: string): Promise<any> {
    try {
        const profileRef = ref(db, `user_profiles/${uid}`);
        const snapshot = await get(profileRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        // Fallback to games path
        const gamesRef = ref(db, `users/${uid}/games/ball-crush`);
        const gamesSnapshot = await get(gamesRef);

        if (gamesSnapshot.exists()) {
            return gamesSnapshot.val();
        }

        return null;

    } catch (error) {
        console.error('Error getting profile stats:', error);
        return null;
    }
}

/**
 * Get leaderboard based on profile stats
 */
export async function getBallCrushLeaderboard(limit: number = 10): Promise<BallCrushLeaderboardEntry[]> {
    try {
        const profilesRef = ref(db, 'user_profiles');
        const snapshot = await get(profilesRef);

        if (!snapshot.exists()) return [];

        const leaderboard: BallCrushLeaderboardEntry[] = [];

        snapshot.forEach((child) => {
            const data = child.val();
            leaderboard.push({
                username: data.username || 'unknown',
                displayName: data.displayName || 'Unknown',
                highScore: data.highScore || 0,
                rank: data.rank || 'Bronze',
                level: data.level || 1,
                totalWins: data.totalWins || 0,
                winRate: data.winRate || 0
            });
        });

        // Sort by high score
        return leaderboard
            .sort((a, b) => b.highScore - a.highScore)
            .slice(0, limit);

    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}


export async function getBallCrushWinnings(uid: string): Promise<number> {
    try {
        const winningsRef = ref(db, `users/${uid}/winnings/total`);
        const snapshot = await get(winningsRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        // Try alternative path
        const altRef = ref(db, `winnings/${uid}/total`);
        const altSnapshot = await get(altRef);

        if (altSnapshot.exists()) {
            return altSnapshot.val();
        }

        return 0;

    } catch (error) {
        console.error('Error getting winnings:', error);
        return 0;
    }
}

/**
 * Get user's win count
 */
export async function getBallCrushWinCount(uid: string): Promise<number> {
    try {
        const countRef = ref(db, `users/${uid}/winnings/count`);
        const snapshot = await get(countRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        return 0;

    } catch (error) {
        console.error('Error getting win count:', error);
        return 0;
    }
}

export async function deductBallCrushWalletBalance(
    uid: string,
    amount: number,
    description: string
): Promise<boolean> {
    try {
        console.log(`💰 Deducting ${amount} from Ball Crush wallet for UID: ${uid}`);

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
        console.error('❌ Error deducting from Ball Crush wallet:', error);
        return false;
    }
}
// =========== SAVE GAME SCORE ===========
export async function saveBallCrushScore(
    username: string,
    score: number,
    won: boolean
): Promise<boolean> {
    try {
        console.log(`💾 Saving Ball Crush score for ${username}: ${score}`);

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
            date: date,
            game: 'ball-crush'
        };

        const scoresRef = ref(db, `users/${uid}/scores`);
        const newScoreRef = push(scoresRef);
        await set(newScoreRef, scoreEntry);

        console.log('✅ Ball Crush score saved with ID:', newScoreRef.key);
        return true;

    } catch (error) {
        console.error('❌ Error saving Ball Crush score:', error);
        return false;
    }
}

// =========== UPDATE BALL CRUSH STATS ===========
export async function updateBallCrushStats(
    username: string,
    score: number,
    won: boolean
): Promise<void> {
    try {
        console.log(`📊 Updating Ball Crush stats for ${username}: score=${score}, won=${won}`);

        const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
        const lookupSnapshot = await get(lookupRef);

        if (!lookupSnapshot.exists()) {
            console.error('❌ User not found');
            return;
        }

        const uid = lookupSnapshot.val();

        // Get current Ball Crush stats
        const statsRef = ref(db, `users/${uid}/games/ball-crush`);
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
            gamesWon: 0,
            gamesLost: 0
        };

        // Calculate new values
        const newTotalGames = (currentStats.totalGames || 0) + 1;
        const newTotalScore = (currentStats.totalScore || 0) + score;
        const newAverageScore = Math.floor(newTotalScore / newTotalGames);
        const newHighScore = Math.max(currentStats.highScore || 0, score);
        const newWinStreak = won ? (currentStats.winStreak || 0) + 1 : 0;
        const newBestWinStreak = Math.max(currentStats.bestWinStreak || 0, newWinStreak);
        const newExperience = (currentStats.experience || 0) + (won ? 100 : 10);
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

        // Update Ball Crush stats
        await set(ref(db, `users/${uid}/games/ball-crush`), updates);

        // Update global metadata
        await update(ref(db, `users/${uid}/metadata`), {
            lastGamePlayed: 'ball-crush',
            totalPlayTime: (await get(ref(db, `users/${uid}/metadata/totalPlayTime`))).val() + 1 || 1,
            updatedAt: new Date().toISOString()
        });

        console.log('✅ Ball Crush stats updated successfully');

    } catch (error) {
        console.error('❌ Error updating Ball Crush stats:', error);
    }
}

// =========== GET PLAYER RANK IN BALL CRUSH ===========
export async function getBallCrushPlayerRank(username: string): Promise<number> {
    try {
        const leaderboard = await getBallCrushLeaderboard(100);
        const index = leaderboard.findIndex(entry => entry.username === username);
        return index + 1;
    } catch (error) {
        console.error('❌ Error getting Ball Crush player rank:', error);
        return 999;
    }
}

// =========== GET USER SCORES ===========
export async function getBallCrushUserScores(username: string, limit: number = 10): Promise<BallCrushScoreEntry[]> {
    try {
        console.log(`📊 Fetching Ball Crush scores for: ${username}`);

        const lookupRef = ref(db, `lookups/byUsername/${username.toLowerCase()}`);
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
            const scores: BallCrushScoreEntry[] = Object.entries(scoresData)
                .map(([id, data]: [string, any]) => ({
                    id: id,
                    date: new Date(data.timestamp).toLocaleDateString(),
                    score: data.score,
                    won: data.won,
                    timestamp: data.timestamp
                }))
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);

            console.log(`✅ Found ${scores.length} Ball Crush scores for ${username}`);
            return scores;
        }

        console.log('📝 No Ball Crush scores found for user');
        return [];

    } catch (error) {
        console.error('❌ Error fetching Ball Crush scores:', error);
        return [];
    }
}

// =========== GET BALANCE ===========
export async function getBallCrushBalance(uid: string): Promise<number> {
    try {
        console.log(`💰 Getting Ball Crush balance for UID: ${uid}`);

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
        console.error('Error getting Ball Crush balance:', error);
        return 0.00;
    }
}