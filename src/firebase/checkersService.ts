// src/firebase/checkersService.ts
import { ref, get, set, push, update, runTransaction } from 'firebase/database';
import { db } from './init';

type WalletTransactionType = 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss' | 'game_fee' | 'refund';

// =========== INTERFACES ===========

export interface CheckersUserData {
    username: string;
    displayName: string;
    avatar: string;
    rank: string;
    level: number;
    createdAt: string;
    totalWinnings: number;
    winningsCount: number;
    lastWinDate?: string;
    winnings: {
        checkers: {
            total: number;
            count: number;
            lastWin?: string;
            history?: Array<{ amount: number; date: string; description: string }>;
        };
    };
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
    balance: number;
    totalDeposited: number;
    totalWithdrawn: number;
    totalWon: number;
    totalLost: number;
    totalBonus: number;
    lastLogin: string;
    isActive: boolean;
}

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
        username,
        displayName: username,
        avatar: 'default',
        rank: 'Bronze',
        level: 1,
        createdAt: new Date().toISOString(),
        totalWinnings: 0,
        winningsCount: 0,
        winnings: { checkers: { total: 0, count: 0, history: [] } },
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
        balance: 10.00,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWon: 0,
        totalLost: 0,
        totalBonus: 10.00,
        lastLogin: new Date().toISOString(),
        isActive: true
    };
}

// =========== WALLET SHAPE NORMALISER ===========
//
// Firebase can give us three different shapes at wallets/{uid}:
//
//   A) Object  { balance: 5, totalDeposited: 0, ... }  ← normal
//   B) Number  5                                        ← legacy / bad write
//   C) null                                             ← new user
//
// runTransaction receives raw DB data so we MUST handle all three
// before ever touching .balance — this is what caused the "$0 balance" bug.

function normaliseWallet(raw: any): Record<string, any> & { balance: number } {
    if (typeof raw === 'number') {
        // Entire node was stored as a bare number
        return {
            balance: raw,
            totalDeposited: 0,
            totalWithdrawn: 0,
            totalWon: 0,
            totalLost: 0,
            totalBonus: raw,
            totalGameFees: 0,
            totalRefunds: 0,
            currency: 'USD',
            isActive: true
        };
    }

    if (!raw || typeof raw !== 'object') {
        // null / undefined → brand new wallet
        return {
            balance: 0,
            totalDeposited: 0,
            totalWithdrawn: 0,
            totalWon: 0,
            totalLost: 0,
            totalBonus: 0,
            totalGameFees: 0,
            totalRefunds: 0,
            currency: 'USD',
            isActive: true
        };
    }

    // Normal object — fill in any missing fields, preserve everything else
    return {
        ...raw,
        balance:         typeof raw.balance === 'number' ? raw.balance : 0,
        totalDeposited:  raw.totalDeposited  ?? 0,
        totalWithdrawn:  raw.totalWithdrawn  ?? 0,
        totalWon:        raw.totalWon        ?? 0,
        totalLost:       raw.totalLost       ?? 0,
        totalBonus:      raw.totalBonus      ?? 0,
        totalGameFees:   raw.totalGameFees   ?? 0,
        totalRefunds:    raw.totalRefunds    ?? 0,
        currency:        raw.currency        ?? 'USD',
        isActive:        raw.isActive        ?? true
    };
}

// =========== GET BALANCE ===========

export async function getCheckersBalance(uid: string): Promise<number> {
    try {
        const snapshot = await get(ref(db, `wallets/${uid}`));
        if (!snapshot.exists()) return 0;
        const wallet = normaliseWallet(snapshot.val());
        console.log(`💰 Balance for ${uid}: $${wallet.balance}`);
        return wallet.balance;
    } catch (error) {
        console.error('Error getting balance:', error);
        return 0;
    }
}

// =========== UPDATE WALLET BALANCE (fully atomic) ===========

export async function updateCheckersWalletBalance(
    uid: string,
    amount: number,
    type: WalletTransactionType,
    description: string
): Promise<boolean> {
    if (!uid) {
        console.error('❌ updateCheckersWalletBalance: uid is required');
        return false;
    }

    const deductionTypes: WalletTransactionType[] = ['game_fee', 'loss', 'withdrawal'];
    const isDeduction  = deductionTypes.includes(type);
    const magnitude    = Math.abs(amount);
    const signedAmount = isDeduction ? -magnitude : magnitude;

    console.log(`💰 Wallet txn — uid=${uid} type=${type} signedAmount=${signedAmount}`);

    // Try both possible wallet locations
    const walletPaths = [`wallets/${uid}`, `users/${uid}/wallet`];
    
    for (const walletPath of walletPaths) {
        const walletRef = ref(db, walletPath);
        
        // First, check if the path exists and has balance
        const checkSnapshot = await get(walletRef);
        if (!checkSnapshot.exists()) {
            console.log(`   Path ${walletPath} doesn't exist, trying next...`);
            continue;
        }
        
        const currentBalance = normaliseWallet(checkSnapshot.val()).balance;
        if (isDeduction && currentBalance < magnitude) {
            console.log(`❌ Insufficient funds at ${walletPath}: have $${currentBalance}, need $${magnitude}`);
            return false;
        }
        
        // Now attempt the transaction
        let insufficientFunds = false;
        let finalBalance = 0;

        try {
            const result = await runTransaction(walletRef, (rawData) => {
                insufficientFunds = false;
                
                const wallet = normaliseWallet(rawData);
                const currentBalance = wallet.balance;

                console.log(`   [txn at ${walletPath}] currentBalance=${currentBalance}, needed=${magnitude}`);

                if (rawData === null) {
                    console.log(`   [txn] rawData is null at ${walletPath}, but we verified it exists!`);
                    // If we verified existence but get null, return the current value
                    return wallet;
                }

                if (isDeduction && currentBalance < magnitude) {
                    insufficientFunds = true;
                    return undefined;
                }

                const newBalance = currentBalance + signedAmount;
                if (newBalance < 0) {
                    insufficientFunds = true;
                    return undefined;
                }

                // Update running totals
                switch (type) {
                    case 'win':        wallet.totalWon       = (wallet.totalWon       ?? 0) + magnitude; break;
                    case 'loss':       wallet.totalLost      = (wallet.totalLost      ?? 0) + magnitude; break;
                    case 'deposit':    wallet.totalDeposited = (wallet.totalDeposited ?? 0) + magnitude; break;
                    case 'withdrawal': wallet.totalWithdrawn = (wallet.totalWithdrawn ?? 0) + magnitude; break;
                    case 'bonus':      wallet.totalBonus     = (wallet.totalBonus     ?? 0) + magnitude; break;
                    case 'game_fee':   wallet.totalGameFees  = (wallet.totalGameFees  ?? 0) + magnitude; break;
                    case 'refund':     wallet.totalRefunds   = (wallet.totalRefunds   ?? 0) + magnitude; break;
                }

                wallet.balance = newBalance;
                wallet.lastUpdated = new Date().toISOString();
                finalBalance = newBalance;

                return wallet;
            });

            if (insufficientFunds) {
                console.log(`❌ Txn aborted: insufficient funds at ${walletPath}`);
                continue;
            }

            if (!result.committed && !insufficientFunds) {
                console.error(`❌ Wallet transaction failed to commit at ${walletPath}`);
                continue;
            }

            console.log(`✅ Wallet committed at ${walletPath} — new balance: $${finalBalance.toFixed(2)}`);

            // Update the other wallet location to stay in sync
            const otherPath = walletPath === `wallets/${uid}` ? `users/${uid}/wallet` : `wallets/${uid}`;
            try {
                await set(ref(db, otherPath), {
                    balance: finalBalance,
                    lastUpdated: new Date().toISOString()
                });
                console.log(`   Synced balance to ${otherPath}`);
            } catch (syncError) {
                console.warn(`   Could not sync to ${otherPath}:`, syncError);
            }

            // Log transaction
            try {
                await set(push(ref(db, `transactions/${uid}`)), {
                    type,
                    amount: signedAmount,
                    balanceAfter: finalBalance,
                    description,
                    timestamp: new Date().toISOString()
                });
            } catch (logError) {
                console.warn('⚠️ Transaction log write failed:', logError);
            }

            return true;
            
        } catch (error) {
            console.error(`❌ Wallet transaction threw at ${walletPath}:`, error);
            continue;
        }
    }
    
    console.error(`❌ All wallet paths failed for uid ${uid}`);
    return false;
}
// =========== GET USER DATA ===========

export async function getCheckersUserData(uid: string): Promise<CheckersUserData | null> {
    try {
        console.log(`📡 Fetching Checkers data for UID: ${uid}`);

        const userSnapshot = await get(ref(db, `users/${uid}`));

        if (!userSnapshot.exists()) {
            console.log('❌ User data not found for UID:', uid);
            return getDefaultCheckersUserData('Player');
        }

        const userData = userSnapshot.val();
        const balance  = await getCheckersBalance(uid);

        const gameStats = userData.games?.checkers || {
            gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
            winStreak: 0, bestWinStreak: 0, piecesCaptured: 0,
            kingsMade: 0, averageMoves: 0, experience: 0, achievements: []
        };

        const checkersWinnings = userData.winnings?.checkers || { total: 0, count: 0 };

        return {
            username:      userData.public?.username    || 'Player',
            displayName:   userData.public?.displayName || 'Player',
            avatar:        userData.public?.avatar      || 'default',
            rank:          userData.public?.globalRank  || 'Bronze',
            level:         userData.public?.globalLevel || 1,
            createdAt:     userData.metadata?.createdAt || new Date().toISOString(),
            totalWinnings: checkersWinnings.total || 0,
            winningsCount: checkersWinnings.count || 0,
            winnings: {
                checkers: {
                    total:   checkersWinnings.total   || 0,
                    count:   checkersWinnings.count   || 0,
                    lastWin: checkersWinnings.lastWin,
                    history: checkersWinnings.history || []
                }
            },
            gamesPlayed:    gameStats.gamesPlayed    || 0,
            gamesWon:       gameStats.gamesWon       || 0,
            gamesLost:      gameStats.gamesLost      || 0,
            winStreak:      gameStats.winStreak      || 0,
            bestWinStreak:  gameStats.bestWinStreak  || 0,
            piecesCaptured: gameStats.piecesCaptured || 0,
            kingsMade:      gameStats.kingsMade      || 0,
            averageMoves:   gameStats.averageMoves   || 0,
            experience:     gameStats.experience     || 0,
            achievements:   gameStats.achievements   || [],
            balance,
            totalDeposited: userData.wallet?.totalDeposited || 0,
            totalWithdrawn: userData.wallet?.totalWithdrawn || 0,
            totalWon:       userData.wallet?.totalWon       || 0,
            totalLost:      userData.wallet?.totalLost      || 0,
            totalBonus:     userData.wallet?.totalBonus     || 0,
            lastLogin:      userData.private?.lastLogin     || new Date().toISOString(),
            isActive:       userData.public?.isOnline       || false
        };

    } catch (error) {
        console.error('❌ Error fetching Checkers user data:', error);
        return getDefaultCheckersUserData('Player');
    }
}

// =========== UPDATE GAME STATS ===========

export async function updateCheckersStats(
    uid: string,
    won: boolean,
    piecesCaptured: number,
    kingsMade: number,
    moves: number
): Promise<void> {
    try {
        console.log(`📊 Updating Checkers stats for UID: ${uid}`);

        const userSnapshot = await get(ref(db, `users/${uid}`));
        if (!userSnapshot.exists()) { console.error('❌ User not found'); return; }

        const userData     = userSnapshot.val();
        const currentStats = userData.games?.checkers || {
            gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
            winStreak: 0, bestWinStreak: 0, piecesCaptured: 0,
            kingsMade: 0, totalMoves: 0, averageMoves: 0,
            experience: 0, achievements: []
        };

        const newGamesPlayed    = (currentStats.gamesPlayed    || 0) + 1;
        const newPiecesCaptured = (currentStats.piecesCaptured || 0) + piecesCaptured;
        const newKingsMade      = (currentStats.kingsMade      || 0) + kingsMade;
        const newTotalMoves     = (currentStats.totalMoves     || 0) + moves;
        const newAverageMoves   = Math.floor(newTotalMoves / newGamesPlayed);

        let newGamesWon     = currentStats.gamesWon     || 0;
        let newGamesLost    = currentStats.gamesLost    || 0;
        let newWinStreak    = currentStats.winStreak    || 0;
        let newBestWinStreak = currentStats.bestWinStreak || 0;

        if (won) {
            newGamesWon++;
            newWinStreak++;
            newBestWinStreak = Math.max(newBestWinStreak, newWinStreak);
        } else {
            newGamesLost++;
            newWinStreak = 0;
        }

        const winRate  = newGamesPlayed > 0 ? Math.round((newGamesWon / newGamesPlayed) * 100) : 0;
        const newLevel = Math.floor(1 + newGamesPlayed / 10);

        let newRank = 'Bronze';
        if      (newGamesWon >= 50 || newPiecesCaptured >= 500) newRank = 'Diamond';
        else if (newGamesWon >= 25 || newPiecesCaptured >= 250) newRank = 'Platinum';
        else if (newGamesWon >= 10 || newPiecesCaptured >= 100) newRank = 'Gold';
        else if (newGamesWon >= 5  || newPiecesCaptured >= 50)  newRank = 'Silver';

        const newExperience = (currentStats.experience || 0)
            + (won ? 100 : 10)
            + (piecesCaptured * 5)
            + (kingsMade * 20);

        const updates = {
            gamesPlayed: newGamesPlayed, gamesWon: newGamesWon, gamesLost: newGamesLost,
            winStreak: newWinStreak, bestWinStreak: newBestWinStreak,
            piecesCaptured: newPiecesCaptured, kingsMade: newKingsMade,
            totalMoves: newTotalMoves, averageMoves: newAverageMoves,
            experience: newExperience, winRate, rank: newRank, level: newLevel,
            lastPlayed: new Date().toISOString()
        };

        await update(ref(db, `users/${uid}/games/checkers`), updates);
        await update(ref(db, `user_profiles/${uid}`), {
            gamesPlayed: newGamesPlayed, gamesWon: newGamesWon, gamesLost: newGamesLost,
            winStreak: newWinStreak, bestWinStreak: newBestWinStreak,
            rank: newRank, level: newLevel, winRate, piecesCaptured: newPiecesCaptured,
            kingsMade: newKingsMade, lastUpdated: new Date().toISOString()
        });

        const freshSnapshot = await get(ref(db, `users/${uid}`));
        await updateCheckersLeaderboard(uid, freshSnapshot.val());

        console.log(`✅ Checkers stats updated`);
    } catch (error) {
        console.error('❌ Error updating Checkers stats:', error);
    }
}

// =========== UPDATE LEADERBOARD ===========

export async function updateCheckersLeaderboard(uid: string, userData: any): Promise<void> {
    try {
        const publicData     = userData.public         || {};
        const checkersStats  = userData.games?.checkers || {};
        const gamesPlayed    = checkersStats.gamesPlayed || 0;
        const gamesWon       = checkersStats.gamesWon   || 0;
        const winRate        = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

        await set(ref(db, `leaderboards/checkers/${uid}`), {
            uid,
            username:    publicData.username    || 'unknown',
            displayName: publicData.displayName || 'Unknown',
            avatar:      publicData.avatar      || 'default',
            gamesWon,
            gamesPlayed,
            winRate,
            rank:            checkersStats.rank            || 'Bronze',
            level:           checkersStats.level           || 1,
            piecesCaptured:  checkersStats.piecesCaptured  || 0,
            kingsMade:       checkersStats.kingsMade       || 0,
            lastUpdated:     new Date().toISOString()
        });

        console.log(`✅ Updated Checkers leaderboard for ${uid}`);
    } catch (error) {
        console.error('❌ Error updating Checkers leaderboard:', error);
    }
}

// =========== GET LEADERBOARD ===========

export async function getCheckersLeaderboard(limit: number = 10): Promise<CheckersLeaderboardEntry[]> {
    try {
        console.log('📡 Fetching Checkers leaderboard...');

        const snapshot = await get(ref(db, 'leaderboards/checkers'));

        if (snapshot.exists()) {
            const leaderboard: CheckersLeaderboardEntry[] = [];
            snapshot.forEach((child) => {
                const d = child.val();
                leaderboard.push({
                    username:       d.username       || 'unknown',
                    displayName:    d.displayName    || 'Unknown',
                    gamesWon:       d.gamesWon       || 0,
                    gamesPlayed:    d.gamesPlayed    || 0,
                    winRate:        d.winRate        || 0,
                    rank:           d.rank           || 'Bronze',
                    level:          d.level          || 1,
                    piecesCaptured: d.piecesCaptured || 0,
                    kingsMade:      d.kingsMade      || 0
                });
            });

            const sorted = leaderboard.sort((a, b) => b.gamesWon - a.gamesWon);
            console.log(`✅ Found ${sorted.length} leaderboard entries`);
            sorted.slice(0, 5).forEach((e, i) => console.log(`  #${i + 1}: ${e.displayName} — ${e.gamesWon} wins`));
            return sorted.slice(0, limit);
        }

        console.log('⚠️ Falling back to user_profiles...');
        return getCheckersLeaderboardFallback(limit);

    } catch (error) {
        console.error('❌ Error getting leaderboard:', error);
        return getCheckersLeaderboardFallback(limit);
    }
}

async function getCheckersLeaderboardFallback(limit: number): Promise<CheckersLeaderboardEntry[]> {
    try {
        const snapshot = await get(ref(db, 'user_profiles'));
        if (!snapshot.exists()) return [];

        const leaderboard: CheckersLeaderboardEntry[] = [];
        snapshot.forEach((child) => {
            const d = child.val();
            if (d.gamesWon && d.gamesWon > 0) {
                leaderboard.push({
                    username:       d.username       || 'unknown',
                    displayName:    d.displayName    || 'Unknown',
                    gamesWon:       d.gamesWon       || 0,
                    gamesPlayed:    d.gamesPlayed    || 0,
                    winRate:        d.winRate        || 0,
                    rank:           d.rank           || 'Bronze',
                    level:          d.level          || 1,
                    piecesCaptured: d.piecesCaptured || 0,
                    kingsMade:      d.kingsMade      || 0
                });
            }
        });

        return leaderboard.sort((a, b) => b.gamesWon - a.gamesWon).slice(0, limit);
    } catch (error) {
        console.error('❌ Fallback leaderboard failed:', error);
        return [];
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

        const userSnapshot = await get(ref(db, `users/${uid}`));
        if (!userSnapshot.exists()) { console.error('❌ User not found'); return false; }

        const userData        = userSnapshot.val();
        const currentWinnings = userData.winnings?.checkers?.total || 0;
        const currentCount    = userData.winnings?.checkers?.count || 0;

        const historyEntry = { amount, date: new Date().toISOString(), description, game: 'checkers' };
        const existingHistory = userData.winnings?.checkers?.history || [];

        await update(ref(db, `users/${uid}`), {
            'winnings/checkers/total':   currentWinnings + amount,
            'winnings/checkers/count':   currentCount + 1,
            'winnings/checkers/lastWin': new Date().toISOString(),
            'winnings/checkers/history': [historyEntry, ...existingHistory].slice(0, 10)
        });

        await set(ref(db, `winnings/checkers/${uid}/total`),   currentWinnings + amount);
        await set(ref(db, `winnings/checkers/${uid}/count`),   currentCount + 1);
        await set(ref(db, `winnings/checkers/${uid}/lastWin`), new Date().toISOString());

        await set(push(ref(db, `winnings_transactions/checkers/${uid}`)), {
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
        const snapshot = await get(ref(db, `users/${uid}/winnings/checkers/total`));
        if (snapshot.exists()) return snapshot.val();

        const altSnapshot = await get(ref(db, `winnings/checkers/${uid}/total`));
        if (altSnapshot.exists()) return altSnapshot.val();

        return 0;
    } catch (error) {
        console.error('Error getting Checkers winnings:', error);
        return 0;
    }
}

// =========== SAVE GAME HISTORY ===========

export async function saveCheckersGame(gameResult: CheckersGameResult): Promise<boolean> {
    try {
        const newRef = push(ref(db, 'checkers_games'));
        await set(newRef, { ...gameResult, timestamp: Date.now(), id: newRef.key });
        console.log('✅ Checkers game saved:', newRef.key);
        return true;
    } catch (error) {
        console.error('❌ Error saving Checkers game:', error);
        return false;
    }
}

// =========== GET USER STATS ===========

export async function getCheckersUserStats(uid: string): Promise<any> {
    try {
        const snapshot = await get(ref(db, `users/${uid}/games/checkers`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

// =========== SERVICE EXPORT ===========

export const checkersService = {
    getUserData:          getCheckersUserData,
    updateStats:          updateCheckersStats,
    addWinnings:          addCheckersWinnings,
    saveGame:             saveCheckersGame,
    getLeaderboard:       getCheckersLeaderboard,
    getUserStats:         getCheckersUserStats,
    getBalance:           getCheckersBalance,
    updateWalletBalance:  updateCheckersWalletBalance
};