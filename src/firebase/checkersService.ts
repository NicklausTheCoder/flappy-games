// src/firebase/checkersService.ts
//
// Zero Firebase SDK on the client.
// Every read AND write goes through the game server REST API via api.ts.
// All exported function signatures are IDENTICAL to the original —
// no game scene files need to change.

import { api } from './api';

// ── Types (unchanged) ──────────────────────────────────────────────────────────

export interface CheckersUserData {
    username: string; displayName: string; avatar: string;
    rank: string; level: number; createdAt: string;
    totalWinnings: number; winningsCount: number; lastWinDate?: string;
    winnings: { checkers: { total: number; count: number; lastWin?: string; history?: any[] } };
    gamesPlayed: number; gamesWon: number; gamesLost: number;
    winStreak: number; bestWinStreak: number;
    piecesCaptured: number; kingsMade: number; averageMoves: number;
    experience: number; achievements: string[];
    balance: number; totalDeposited: number; totalWithdrawn: number;
    totalWon: number; totalLost: number; totalBonus: number;
    lastLogin: string; isActive: boolean;
}

export interface CheckersLeaderboardEntry {
    username: string; displayName: string;
    gamesWon: number; gamesPlayed: number; winRate: number;
    rank: string; level: number; piecesCaptured: number; kingsMade: number;
}
export interface CheckersGameResult {
    id?: string; date: string; winner: 'red' | 'black';
    playerRed: string; playerBlack: string;
    moves: number; piecesCaptured: number; timestamp: number;
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getCheckersBalance(uid: string): Promise<number> {
    try {
        const res = await api.getBalance(uid);
        console.log(`💰 Balance for ${uid}: $${res.balance}`);
        return res.balance ?? 0;
    } catch { return 0; }
}

// ── Wallet transaction ────────────────────────────────────────────────────────

export async function updateCheckersWalletBalance(
    uid: string,
    amount: number,
    type: 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss' | 'game_fee' | 'refund',
    description: string
): Promise<boolean> {
    try {
        const res = await api.transact(uid, amount, type, description);
        if (res.success) console.log(`✅ Wallet committed — new balance: $${res.balance?.toFixed(2)}`);
        else             console.warn(`❌ Wallet txn failed: ${res.error}`);
        return res.success;
    } catch (err) {
        console.error('❌ updateCheckersWalletBalance:', err);
        return false;
    }
}

// ── Get user data ─────────────────────────────────────────────────────────────

export async function getCheckersUserData(uid: string): Promise<CheckersUserData | null> {


    
    try {
        console.log(`📡 Fetching Checkers data for UID: ${uid}`);
        const res = await api.getUser(uid);
        if (!res.success || !res.user) return _default('Player');

        const u         = res.user;
        const pub       = u.public       || {};
        const gameStats = u.games?.checkers || {};
        const winData   = u.winnings?.checkers || { total: 0, count: 0 };
        const wallet    = u.wallet || {};

        return {
            username:      pub.username    || 'Player',
            displayName:   pub.displayName || 'Player',
            avatar:        pub.avatar      || 'default',
            rank:          pub.globalRank  || 'Bronze',
            level:         pub.globalLevel || 1,
            createdAt:     u.metadata?.createdAt || new Date().toISOString(),
            totalWinnings: winData.total || 0,
            winningsCount: winData.count || 0,
            winnings: { checkers: { total: winData.total || 0, count: winData.count || 0, lastWin: winData.lastWin, history: winData.history || [] } },
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
            balance:        wallet.balance           || 0,
            totalDeposited: wallet.totalDeposited    || 0,
            totalWithdrawn: wallet.totalWithdrawn    || 0,
            totalWon:       wallet.totalWon          || 0,
            totalLost:      wallet.totalLost         || 0,
            totalBonus:     wallet.totalBonus        || 0,
            lastLogin:      u.private?.lastLogin     || new Date().toISOString(),
            isActive:       pub.isOnline             || false,
        };
    } catch (err) {
        console.error('❌ getCheckersUserData:', err);
        return _default('Player');
    }
}

// ── Update stats ──────────────────────────────────────────────────────────────

export async function updateCheckersStats(
    uid: string, won: boolean,
    piecesCaptured: number, kingsMade: number, moves: number
): Promise<void> {
    try {
        console.log(`📊 Updating Checkers stats for UID: ${uid}`);
        const res = await api.updateCheckersStats(uid, { won, piecesCaptured, kingsMade, moves });
        if (res.success) console.log('✅ Checkers stats updated');
        else             console.error('❌ Stats update failed:', res.error);
    } catch (err) { console.error('❌ updateCheckersStats:', err); }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getCheckersLeaderboard(limit = 10): Promise<CheckersLeaderboardEntry[]> {
    try {
        const res = await api.getLeaderboard('checkers', limit);
        if (!res.success) return [];
        return (res.leaderboard || []).map((d: any) => ({
            username:       d.username       || 'unknown',
            displayName:    d.displayName    || 'Unknown',
            gamesWon:       d.gamesWon       || 0,
            gamesPlayed:    d.gamesPlayed    || 0,
            winRate:        d.winRate        || 0,
            rank:           d.rank           || 'Bronze',
            level:          d.level          || 1,
            piecesCaptured: d.piecesCaptured || 0,
            kingsMade:      d.kingsMade      || 0,
        }));
    } catch (err) {
        console.error('❌ getCheckersLeaderboard:', err);
        return [];
    }
}

// ── Winnings ──────────────────────────────────────────────────────────────────

export async function addCheckersWinnings(uid: string, amount: number, description: string): Promise<boolean> {
    try {
        const res = await api.addWinnings(uid, amount, description, 'checkers');
        if (res.success) console.log(`✅ Winnings added. Total: $${res.total?.toFixed(2)}`);
        return res.success;
    } catch (err) { console.error('❌ addCheckersWinnings:', err); return false; }
}

export async function getCheckersWinnings(uid: string): Promise<number> {
    try {
        const res = await api.getWinnings(uid, 'checkers');
        return res.total ?? 0;
    } catch { return 0; }
}

// ── Game save / stats lookup ──────────────────────────────────────────────────

export async function saveCheckersGame(_gameResult: CheckersGameResult): Promise<boolean> {
    // Persisted server-side by CheckersGameRoom.endAndPersist — no client write needed.
    return true;
}

export async function getCheckersUserStats(uid: string): Promise<any> {
    try {
        const res = await api.getStats(uid, 'checkers');
        return res.success ? res.stats : null;
    } catch { return null; }
}

export async function updateCheckersLeaderboard(_uid: string, _userData: any): Promise<void> {
    // Server updates leaderboard automatically on every stat update — no-op here.
}

// ── Private ───────────────────────────────────────────────────────────────────

function _default(username: string): CheckersUserData {
    return {
        username, displayName: username, avatar: 'default',
        rank: 'Bronze', level: 1, createdAt: new Date().toISOString(),
        totalWinnings: 0, winningsCount: 0,
        winnings: { checkers: { total: 0, count: 0, history: [] } },
        gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
        winStreak: 0, bestWinStreak: 0, piecesCaptured: 0,
        kingsMade: 0, averageMoves: 0, experience: 0, achievements: [],
        balance: 0, totalDeposited: 0, totalWithdrawn: 0,
        totalWon: 0, totalLost: 0, totalBonus: 0,
        lastLogin: new Date().toISOString(), isActive: true,
    };
}

// ── Service export (identical shape to original) ───────────────────────────────

export const checkersService = {
    getUserData:         getCheckersUserData,
    updateStats:         updateCheckersStats,
    addWinnings:         addCheckersWinnings,
    saveGame:            saveCheckersGame,
    getLeaderboard:      getCheckersLeaderboard,
    getUserStats:        getCheckersUserStats,
    getBalance:          getCheckersBalance,
    updateWalletBalance: updateCheckersWalletBalance,
};