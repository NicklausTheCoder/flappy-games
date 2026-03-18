// src/firebase/checkersService.ts
import { ref, get, set, push, update } from 'firebase/database';
import { db } from './init';

// Complete user data interface for Checkers
export interface CheckersUserData {
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

    winnings: {
        checkers: {
            total: number;
            count: number;
            lastWin?: string;
            history?: Array<{
                amount: number;
                date: string;
                description: string;
            }>;
        }
    };

    // Checkers specific stats
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    winStreak: number;
    bestWinStreak: number;
    piecesCaptured: number;
    kingsMade: number;
    averageMoves: number;
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

// Leaderboard entry for Checkers
export interface CheckersLeaderboardEntry {
    username: string;
    displayName: string;
    gamesWon: number;
    winRate: number;
    rank: string;
    level: number;
    piecesCaptured: number;
}

// Game result interface
export interface CheckersGameResult {
    id?: string;
    date: string;
    winner: 'red' | 'black';
    playerRed: string;
    playerBlack: string;
    moves: number;
    piecesCaptured: number;
    timestamp: number;
}

// =========== DEFAULT USER DATA ===========
function getDefaultCheckersUserData(username: string): CheckersUserData {
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
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        winStreak: 0,
        bestWinStreak: 0,
        piecesCaptured: 0,
        kingsMade: 0,
        averageMoves: 0,
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
// Add these to your checkersService.ts file

// Leaderboard entry for Checkers
export interface CheckersLeaderboardEntry {
    username: string;
    displayName: string;
    gamesWon: number;
    gamesPlayed: number;
    winRate: number;
    rank: string;
    level: number;
    piecesCaptured: number;
    kingsMade: number;
}

// =========== GET LEADERBOARD ===========

// Fallback function using user_profiles
async function getCheckersLeaderboardFallback(limit: number): Promise<CheckersLeaderboardEntry[]> {
    try {
        const profilesRef = ref(db, 'user_profiles');
        const snapshot = await get(profilesRef);

        if (!snapshot.exists()) return [];

        const leaderboard: CheckersLeaderboardEntry[] = [];

        snapshot.forEach((child) => {
            const data = child.val();
            // Only include if they've played Checkers (have gamesWon > 0)
            if (data.gamesWon && data.gamesWon > 0) {
                leaderboard.push({
                    username: data.username || 'unknown',
                    displayName: data.displayName || 'Unknown',
                    gamesWon: data.gamesWon || 0,
                    gamesPlayed: data.gamesPlayed || 0,
                    winRate: data.winRate || 0,
                    rank: data.rank || 'Bronze',
                    level: data.level || 1,
                    piecesCaptured: data.piecesCaptured || 0,
                    kingsMade: data.kingsMade || 0
                });
            }
        });

        // Sort by games won
        return leaderboard
            .sort((a, b) => b.gamesWon - a.gamesWon)
            .slice(0, limit);
    } catch (error) {
        console.error('❌ Fallback leaderboard also failed:', error);
        return [];
    }
}

// =========== UPDATE LEADERBOARD ===========
export async function updateCheckersLeaderboard(uid: string, userData: any): Promise<void> {
    try {
        const publicData = userData.public || {};
        const checkersStats = userData.games?.checkers || {};

        // Calculate win rate
        const gamesPlayed = checkersStats.gamesPlayed || 0;
        const gamesWon = checkersStats.gamesWon || 0;
        let winRate = 0;

        if (gamesPlayed > 0) {
            winRate = Math.round((gamesWon / gamesPlayed) * 100);
        }

        // Save to dedicated Checkers leaderboard path
        const leaderboardRef = ref(db, `leaderboards/checkers/${uid}`);

        const leaderboardData = {
            uid: uid,
            username: publicData.username || 'unknown',
            displayName: publicData.displayName || 'Unknown',
            avatar: publicData.avatar || 'default',
            gamesWon: gamesWon || 0,
            gamesPlayed: gamesPlayed || 0,
            winRate: winRate,
            rank: checkersStats.rank || 'Bronze',
            level: checkersStats.level || 1,
            piecesCaptured: checkersStats.piecesCaptured || 0,
            kingsMade: checkersStats.kingsMade || 0,
            lastUpdated: new Date().toISOString()
        };

        console.log('📊 Updating Checkers leaderboard:', leaderboardData);

        await set(leaderboardRef, leaderboardData);

        console.log(`✅ Updated Checkers leaderboard for ${uid}`);
    } catch (error) {
        console.error('❌ Error updating Checkers leaderboard:', error);
    }
}
// =========== GET USER DATA ===========
export async function getCheckersUserData(uid: string): Promise<CheckersUserData | null> {
    try {
        console.log(`📡 Fetching Checkers data for UID: ${uid}`);

        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.log('❌ User data not found for UID:', uid);
            return getDefaultCheckersUserData('Player');
        }

        const userData = userSnapshot.val();

        // Get wallet balance
        let balance = 0;
        const walletRef = ref(db, `wallets/${uid}/balance`);
        const walletSnapshot = await get(walletRef);

        if (walletSnapshot.exists()) {
            balance = walletSnapshot.val();
        }

        // Get Checkers specific game stats
        const gameStats = userData.games?.checkers || {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            winStreak: 0,
            bestWinStreak: 0,
            piecesCaptured: 0,
            kingsMade: 0,
            averageMoves: 0,
            experience: 0,
            achievements: []
        };

        // Get Checkers-specific winnings
        const checkersWinnings = userData.winnings?.checkers || {
            total: 0,
            count: 0
        };

        return {
            username: userData.public?.username || 'Player',
            displayName: userData.public?.displayName || 'Player',
            avatar: userData.public?.avatar || 'default',
            rank: userData.public?.globalRank || 'Bronze',
            level: userData.public?.globalLevel || 1,
            createdAt: userData.metadata?.createdAt || new Date().toISOString(),

            // Game-specific winnings
            winnings: {
                checkers: {
                    total: checkersWinnings.total || 0,
                    count: checkersWinnings.count || 0,
                    lastWin: checkersWinnings.lastWin,
                    history: checkersWinnings.history || []
                }
            },

            // Stats
            gamesPlayed: gameStats.gamesPlayed || 0,
            gamesWon: gameStats.gamesWon || 0,
            gamesLost: gameStats.gamesLost || 0,
            winStreak: gameStats.winStreak || 0,
            bestWinStreak: gameStats.bestWinStreak || 0,
            piecesCaptured: gameStats.piecesCaptured || 0,
            kingsMade: gameStats.kingsMade || 0,
            averageMoves: gameStats.averageMoves || 0,
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
        console.error('❌ Error fetching Checkers user data:', error);
        return getDefaultCheckersUserData('Player');
    }
}

// =========== UPDATE GAME STATS ===========
// In updateCheckersStats function, add this at the end:
export async function updateCheckersStats(
    uid: string,
    won: boolean,
    piecesCaptured: number,
    kingsMade: number,
    moves: number
): Promise<void> {
    try {
        console.log(`📊 Updating Checkers stats for UID: ${uid}`);

        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.error('❌ User not found');
            return;
        }

        const userData = userSnapshot.val();
        const currentStats = userData.games?.checkers || {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            winStreak: 0,
            bestWinStreak: 0,
            piecesCaptured: 0,
            kingsMade: 0,
            totalMoves: 0,
            averageMoves: 0,
            experience: 0,
            achievements: []
        };

        // Calculate new stats
        const newGamesPlayed = (currentStats.gamesPlayed || 0) + 1;
        const newPiecesCaptured = (currentStats.piecesCaptured || 0) + piecesCaptured;
        const newKingsMade = (currentStats.kingsMade || 0) + kingsMade;
        const newTotalMoves = (currentStats.totalMoves || 0) + moves;
        const newAverageMoves = Math.floor(newTotalMoves / newGamesPlayed);

        let newGamesWon = currentStats.gamesWon || 0;
        let newGamesLost = currentStats.gamesLost || 0;
        let newWinStreak = currentStats.winStreak || 0;
        let newBestWinStreak = currentStats.bestWinStreak || 0;

        if (won) {
            newGamesWon++;
            newWinStreak++;
            newBestWinStreak = Math.max(newBestWinStreak, newWinStreak);
        } else {
            newGamesLost++;
            newWinStreak = 0;
        }

        // Calculate win rate
        const winRate = newGamesPlayed > 0 ? Math.round((newGamesWon / newGamesPlayed) * 100) : 0;

        // Calculate rank based on performance
        let newRank = 'Bronze';
        if (newGamesWon >= 50 || newPiecesCaptured >= 500) newRank = 'Diamond';
        else if (newGamesWon >= 25 || newPiecesCaptured >= 250) newRank = 'Platinum';
        else if (newGamesWon >= 10 || newPiecesCaptured >= 100) newRank = 'Gold';
        else if (newGamesWon >= 5 || newPiecesCaptured >= 50) newRank = 'Silver';

        // Level based on games played
        const newLevel = Math.floor(1 + newGamesPlayed / 10);

        // Experience points
        const newExperience = (currentStats.experience || 0) +
            (won ? 100 : 10) +
            (piecesCaptured * 5) +
            (kingsMade * 20);

        const updates = {
            gamesPlayed: newGamesPlayed,
            gamesWon: newGamesWon,
            gamesLost: newGamesLost,
            winStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            piecesCaptured: newPiecesCaptured,
            kingsMade: newKingsMade,
            totalMoves: newTotalMoves,
            averageMoves: newAverageMoves,
            experience: newExperience,
            winRate: winRate,
            rank: newRank,
            level: newLevel,
            lastPlayed: new Date().toISOString()
        };

        // Update in users/games path
        await update(ref(db, `users/${uid}/games/checkers`), updates);

        // Update user_profiles
        await update(ref(db, `user_profiles/${uid}`), {
            gamesPlayed: newGamesPlayed,
            gamesWon: newGamesWon,
            gamesLost: newGamesLost,
            winStreak: newWinStreak,
            bestWinStreak: newBestWinStreak,
            rank: newRank,
            level: newLevel,
            winRate: winRate,
            piecesCaptured: newPiecesCaptured,
            kingsMade: newKingsMade,
            lastUpdated: new Date().toISOString()
        });

        // IMPORTANT: Update the dedicated leaderboard
        const freshUserSnapshot = await get(userRef);
        const freshUserData = freshUserSnapshot.val();
        await updateCheckersLeaderboard(uid, freshUserData);

        console.log(`✅ Checkers stats updated:`, updates);

    } catch (error) {
        console.error('❌ Error updating Checkers stats:', error);
    }
}
// =========== ADD WINNINGS ===========
export async function addCheckersWinnings(
    uid: string,
    amount: number,
    description: string
): Promise<boolean> {
    try {
        console.log(`💰 Adding Checkers winnings for UID: ${uid}, amount: ${amount}`);

        const userRef = ref(db, `users/${uid}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            console.error('❌ User not found');
            return false;
        }

        const userData = userSnapshot.val();

        // Get current Checkers-specific winnings
        const currentWinnings = userData.winnings?.checkers?.total || 0;
        const currentCount = userData.winnings?.checkers?.count || 0;

        // Update winnings - store under 'checkers' key
        const updates: any = {
            [`winnings/checkers/total`]: currentWinnings + amount,
            [`winnings/checkers/count`]: currentCount + 1,
            [`winnings/checkers/lastWin`]: new Date().toISOString()
        };

        // Add to history
        const historyEntry = {
            amount,
            date: new Date().toISOString(),
            description,
            game: 'checkers'
        };

        // Get existing history or create new array
        const existingHistory = userData.winnings?.checkers?.history || [];
        updates[`winnings/checkers/history`] = [historyEntry, ...existingHistory].slice(0, 10);

        // Update user data
        await update(ref(db, `users/${uid}`), updates);

        // Also update the game-specific winnings collection
        await set(ref(db, `winnings/checkers/${uid}/total`), currentWinnings + amount);
        await set(ref(db, `winnings/checkers/${uid}/count`), currentCount + 1);
        await set(ref(db, `winnings/checkers/${uid}/lastWin`), new Date().toISOString());

        // Create transaction record in game-specific path
        const transactionsRef = ref(db, `winnings_transactions/checkers/${uid}`);
        const newTransactionRef = push(transactionsRef);
        await set(newTransactionRef, {
            amount,
            balance: currentWinnings + amount,
            description,
            timestamp: new Date().toISOString(),
            type: 'win',
            game: 'checkers'
        });

        console.log(`✅ Checkers winnings updated. New total: $${(currentWinnings + amount).toFixed(2)}`);
        return true;

    } catch (error) {
        console.error('❌ Error adding Checkers winnings:', error);
        return false;
    }
}
export async function getCheckersWinnings(uid: string): Promise<number> {
    try {
        const winningsRef = ref(db, `users/${uid}/winnings/checkers/total`);
        const snapshot = await get(winningsRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        // Try alternative path
        const altRef = ref(db, `winnings/checkers/${uid}/total`);
        const altSnapshot = await get(altRef);

        if (altSnapshot.exists()) {
            return altSnapshot.val();
        }

        return 0;

    } catch (error) {
        console.error('Error getting Checkers winnings:', error);
        return 0;
    }
}
// =========== SAVE GAME HISTORY ===========
export async function saveCheckersGame(
    gameResult: CheckersGameResult
): Promise<boolean> {
    try {
        console.log(`💾 Saving Checkers game result`);

        const gamesRef = ref(db, 'checkers_games');
        const newGameRef = push(gamesRef);

        await set(newGameRef, {
            ...gameResult,
            timestamp: Date.now(),
            id: newGameRef.key
        });

        console.log('✅ Checkers game saved with ID:', newGameRef.key);
        return true;

    } catch (error) {
        console.error('❌ Error saving Checkers game:', error);
        return false;
    }
}

// =========== GET LEADERBOARD ===========
export async function getCheckersLeaderboard(limit: number = 10): Promise<CheckersLeaderboardEntry[]> {
    try {
        console.log('📡 Fetching Checkers leaderboard from dedicated path...');

        // First try to get from dedicated leaderboard path
        const leaderboardRef = ref(db, 'leaderboards/checkers');
        const snapshot = await get(leaderboardRef);

        if (snapshot.exists()) {
            const leaderboard: CheckersLeaderboardEntry[] = [];

            snapshot.forEach((child) => {
                const data = child.val();
                leaderboard.push({
                    username: data.username || 'unknown',
                    displayName: data.displayName || 'Unknown',
                    gamesWon: data.gamesWon || 0,
                    gamesPlayed: data.gamesPlayed || 0,
                    winRate: data.winRate || 0,
                    rank: data.rank || 'Bronze',
                    level: data.level || 1,
                    piecesCaptured: data.piecesCaptured || 0,
                    kingsMade: data.kingsMade || 0
                });
            });

            // Sort by games won (descending)
            const sorted = leaderboard.sort((a, b) => b.gamesWon - a.gamesWon);

            console.log(`✅ Found ${sorted.length} Checkers leaderboard entries`);

            // Log top players for debugging
            sorted.slice(0, 5).forEach((entry, index) => {
                console.log(`  #${index + 1}: ${entry.displayName} - ${entry.gamesWon} wins`);
            });

            return sorted.slice(0, limit);
        }

        // Fallback to user_profiles
        console.log('⚠️ Falling back to user_profiles for Checkers leaderboard...');
        return getCheckersLeaderboardFallback(limit);

    } catch (error) {
        console.error('❌ Error getting Checkers leaderboard:', error);

        // Fallback to user_profiles if dedicated path fails
        console.log('⚠️ Falling back to user_profiles...');
        return getCheckersLeaderboardFallback(limit);
    }
}


// =========== GET USER STATS ===========
export async function getCheckersUserStats(uid: string): Promise<any> {
    try {
        const statsRef = ref(db, `users/${uid}/games/checkers`);
        const snapshot = await get(statsRef);

        if (snapshot.exists()) {
            return snapshot.val();
        }

        return null;

    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}
// Add this to your checkersService.ts file (around line 350-360)

// =========== GET BALANCE ===========
export async function getCheckersBalance(uid: string): Promise<number> {
    try {
        console.log(`💰 Getting Checkers balance for UID: ${uid}`);

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
        console.error('Error getting Checkers balance:', error);
        return 0.00;
    }
}

// Also add this wallet update function (if not already there)
export async function updateCheckersWalletBalance(
    uid: string,
    amount: number,
    type: 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss',
    description: string
): Promise<boolean> {
    try {
        console.log(`💰 Updating Checkers wallet for UID: ${uid}, amount: ${amount}`);

        const walletRef = ref(db, `wallets/${uid}`);
        const walletSnapshot = await get(walletRef);

        let currentBalance = 0;
        let currentWalletData: any = {};

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

        // Calculate new values based on transaction type
        let newBalance = currentBalance;
        let newTotalWon = currentWalletData.totalWon || 0;
        let newTotalLost = currentWalletData.totalLost || 0;
        let newTotalDeposited = currentWalletData.totalDeposited || 0;
        let newTotalWithdrawn = currentWalletData.totalWithdrawn || 0;
        let newTotalBonus = currentWalletData.totalBonus || 0;

        switch (type) {
            case 'win':
                newTotalWon += amount;
                break;

            case 'loss':
                if (currentBalance < Math.abs(amount)) {
                    console.log('❌ Insufficient funds');
                    return false;
                }
                newBalance = currentBalance + amount; // amount is negative for loss
                newTotalLost += Math.abs(amount);
                break;

            case 'deposit':
                newBalance = currentBalance + amount;
                newTotalDeposited += amount;
                break;

            case 'bonus':
                newBalance = currentBalance + amount;
                newTotalBonus += amount;
                break;

            case 'withdrawal':
                if (currentBalance < amount) {
                    console.log('❌ Insufficient funds');
                    return false;
                }
                newBalance = currentBalance - amount;
                newTotalWithdrawn += amount;
                break;
        }

        await set(ref(db, `wallets/${uid}`), {
            ...currentWalletData,
            balance: newBalance,
            totalWon: newTotalWon,
            totalLost: newTotalLost,
            totalDeposited: newTotalDeposited,
            totalWithdrawn: newTotalWithdrawn,
            totalBonus: newTotalBonus,
            lastUpdated: new Date().toISOString()
        });

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

        console.log('✅ Checkers wallet updated.');
        return true;

    } catch (error) {
        console.error('❌ Error updating Checkers wallet:', error);
        return false;
    }
}
// Export the service
export const checkersService = {
    getUserData: getCheckersUserData,
    updateStats: updateCheckersStats,
    addWinnings: addCheckersWinnings,
    saveGame: saveCheckersGame,
    getLeaderboard: getCheckersLeaderboard,
    getUserStats: getCheckersUserStats,
    getBalance: getCheckersBalance,  // Add this
    updateWalletBalance: updateCheckersWalletBalance  // Add this
};