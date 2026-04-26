// src/firebase/flappyBirdSimple.ts
//
// Zero Firebase SDK on the client.
// All reads and writes go through the game server REST API.
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

// ── Types (unchanged) ──────────────────────────────────────────────────────────

export interface FlappyBirdUserData {
    username: string; displayName: string; avatar: string;
    rank: string; level: number; createdAt: string;
    totalWinnings: number; winningsCount: number; lastWinDate?: string;
    highScore: number; totalGames: number; totalWins: number; totalLosses: number;
    winStreak: number; bestWinStreak: number; totalScore: number; averageScore: number;
    totalFlaps: number; totalDistance: number; experience: number; achievements: string[];
    balance: number; totalDeposited: number; totalWithdrawn: number;
    totalWon: number; totalLost: number; totalBonus: number;
    lastLogin: string; isActive: boolean;
}

export interface FlappyBirdLeaderboardEntry {
    username: string; displayName: string; highScore: number;
    rank: string; level: number; totalWins: number; winRate: number;
}

export interface FlappyBirdScoreEntry {
    id?: string; date: string; score: number; won: boolean;
    timestamp: number; game?: string; flaps?: number; distance?: number;
}

// ── User data ─────────────────────────────────────────────────────────────────

export async function getFlappyBirdUserData(uid: string): Promise<FlappyBirdUserData | null> {
    try {
        console.log(`📡 Fetching Flappy Bird data for UID: ${uid}`);
        const res = await api.getUser(uid);
        if (!res.success || !res.user) return _default('Player');

        const u         = res.user;
        const pub       = u.public || {};
        const gameStats = u.games?.['flappy-bird'] || {};
        const winnings  = u.winnings || { total: 0, count: 0 };
        const wallet    = u.wallet || {};
        const balance   = wallet.balance ?? 0;

        console.log(`💰 Balance for ${uid}: $${balance}`);

        return {
            username:      pub.username    || 'Player',
            displayName:   pub.displayName || 'Player',
            avatar:        pub.avatar      || 'default',
            rank:          pub.globalRank  || 'Bronze',
            level:         pub.globalLevel || 1,
            createdAt:     u.metadata?.createdAt || new Date().toISOString(),
            totalWinnings: winnings.total || 0,
            winningsCount: winnings.count || 0,
            lastWinDate:   winnings.lastWin,
            highScore:     gameStats.highScore     || 0,
            totalGames:    gameStats.totalGames    || 0,
            totalWins:     gameStats.totalWins     || 0,
            totalLosses:   gameStats.totalLosses   || 0,
            winStreak:     gameStats.winStreak     || 0,
            bestWinStreak: gameStats.bestWinStreak || 0,
            totalScore:    gameStats.totalScore    || 0,
            averageScore:  gameStats.averageScore  || 0,
            totalFlaps:    gameStats.totalFlaps    || 0,
            totalDistance: gameStats.totalDistance || 0,
            experience:    gameStats.experience    || 0,
            achievements:  gameStats.achievements  || [],
            balance,
            totalDeposited: wallet.totalDeposited || 0,
            totalWithdrawn: wallet.totalWithdrawn || 0,
            totalWon:       wallet.totalWon       || 0,
            totalLost:      wallet.totalLost      || 0,
            totalBonus:     wallet.totalBonus     || 0,
            lastLogin:      u.private?.lastLogin  || new Date().toISOString(),
            isActive:       pub.isOnline          || false,
        };
    } catch (err) {
        console.error('❌ getFlappyBirdUserData:', err);
        return _default('Player');
    }
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getFlappyBirdBalance(uid: string): Promise<number> {
    try {
        const res = await api.getBalance(uid);
        console.log(`💰 Found balance: $${res.balance}`);
        return res.balance ?? 0;
    } catch { return 0; }
}

// ── Deduct entry fee ──────────────────────────────────────────────────────────

export async function deductFlappyBirdWalletBalance(
    uid: string, amount: number, description: string
): Promise<boolean> {
    try {
        const res = await api.transact(uid, amount, 'game_fee', description);
        if (res.success) console.log(`✅ Deduction OK — new balance: $${res.balance}`);
        else             console.log('❌ Insufficient funds');
        return res.success;
    } catch (err) {
        console.error('❌ deductFlappyBirdWalletBalance:', err);
        return false;
    }
}

// ── Save score ────────────────────────────────────────────────────────────────

export async function saveFlappyBirdScore(
    uid: string, score: number, won: boolean,
    flaps?: number, distance?: number
): Promise<boolean> {
    try {
        console.log(`💾 Saving Flappy Bird score — uid=${uid} score=${score} won=${won}`);
        const res = await api.updateStats(uid, 'flappy-bird', { score, won, flaps, distance });
        if (res.success) console.log('✅ Score saved');
        return res.success;
    } catch (err) {
        console.error('❌ saveFlappyBirdScore:', err);
        return false;
    }
}

// ── Stat update aliases (kept for backward compat) ────────────────────────────

export async function updateFlappyBirdStats(
    uid: string, score: number, won: boolean, flaps?: number, distance?: number
): Promise<void> {
    await saveFlappyBirdScore(uid, score, won, flaps, distance);
}

export async function updateFlappyBirdProfileStats(
    uid: string, score: number, won: boolean, duration: number,
    flaps?: number, distance?: number
): Promise<void> {
    await api.updateStats(uid, 'flappy-bird', { score, won, duration, flaps, distance });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getFlappyBirdLeaderboard(limit = 10): Promise<FlappyBirdLeaderboardEntry[]> {
    try {
        console.log('📡 Fetching Flappy Bird leaderboard...');
        const res = await api.getLeaderboard('flappy-bird', limit);
        if (!res.success) return [];
        console.log(`✅ ${res.leaderboard.length} entries`);
        return (res.leaderboard || []).map((d: any) => ({
            username:    d.username    || 'unknown',
            displayName: d.displayName || 'Unknown',
            highScore:   d.highScore   || 0,
            rank:        d.rank        || 'Bronze',
            level:       d.level       || 1,
            totalWins:   d.totalWins   || 0,
            winRate:     d.winRate     || 0,
        }));
    } catch (err) {
        console.error('❌ getFlappyBirdLeaderboard:', err);
        return [];
    }
}

// ── Player rank ───────────────────────────────────────────────────────────────

export async function getFlappyBirdPlayerRank(username: string): Promise<number> {
    try {
        const res = await api.getRankByUsername(username, 'flappy-bird');
        return res.success ? res.rank : 999;
    } catch { return 999; }
}

// ── Profile stats ─────────────────────────────────────────────────────────────

export async function getFlappyBirdProfileStats(uid: string): Promise<any> {
    try {
        const res = await api.getStats(uid, 'flappy-bird');
        return res.success ? res.stats : null;
    } catch { return null; }
}

// ── Score history ─────────────────────────────────────────────────────────────

export async function getFlappyBirdUserScores(uid: string, limit = 10): Promise<FlappyBirdScoreEntry[]> {
    try {
        console.log(`📊 Fetching Flappy Bird scores for UID: ${uid}`);
        const res = await api.getScores(uid, 'flappy-bird', limit);
        if (!res.success) return [];
        return (res.scores || []).map((d: any) => {
            const dt = new Date(d.timestamp);
            return {
                id:        d.id,
                date:      `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`,
                score:     d.score,
                won:       d.won,
                timestamp: d.timestamp,
                game:      d.game || 'flappy-bird',
                flaps:     d.flaps,
                distance:  d.distance,
            };
        });
    } catch (err) {
        console.error('❌ getFlappyBirdUserScores:', err);
        return [];
    }
}

// ── Win count ─────────────────────────────────────────────────────────────────

export async function getFlappyBirdWinCount(uid: string): Promise<number> {
    try {
        const res = await api.getWinnings(uid, 'flappy-bird');
        return res.total ?? 0;
    } catch { return 0; }
}

// ── Get user by UID (alias kept for compat) ───────────────────────────────────

export async function getFlappyBirdUserByUid(uid: string): Promise<FlappyBirdUserData | null> {
    return getFlappyBirdUserData(uid);
}

// ── Private ───────────────────────────────────────────────────────────────────

function _default(username: string): FlappyBirdUserData {
    return {
        username, displayName: username, avatar: 'default',
        rank: 'Bronze', level: 1, createdAt: new Date().toISOString(),
        totalWinnings: 0, winningsCount: 0,
        highScore: 0, totalGames: 0, totalWins: 0, totalLosses: 0,
        winStreak: 0, bestWinStreak: 0, totalScore: 0, averageScore: 0,
        totalFlaps: 0, totalDistance: 0, experience: 0, achievements: [],
        balance: 0, totalDeposited: 0, totalWithdrawn: 0,
        totalWon: 0, totalLost: 0, totalBonus: 0,
        lastLogin: new Date().toISOString(), isActive: true,
    };
}