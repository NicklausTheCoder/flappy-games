// src/firebase/multiGameQueries.ts
//
// Zero Firebase SDK on the client.
// All reads and writes go through the game server REST API.
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

// ── Types (unchanged) ──────────────────────────────────────────────────────────

export type GameId = 'flappy-bird' | 'space-shooter' | 'ball-crush';

export interface GameInfo {
    id: GameId; name: string; icon: string;
    description: string; category: string; enabled: boolean; order: number;
}
export interface UserPublic {
    uid: string; username: string; displayName: string; avatar: string;
    globalRank: string; globalLevel: number; createdAt: string; isOnline: boolean;
}
export interface UserWallet {
    balance: number; totalDeposited: number; totalWithdrawn: number;
    totalWon: number; totalLost: number; totalBonus: number;
    currency: string; lastUpdated: string;
}
export interface GameStats {
    highScore: number; totalGames: number; totalWins: number; totalLosses: number;
    winStreak: number; bestWinStreak: number; experience: number; level: number;
    rank: string; achievements: string[]; lastPlayed: string;
    averageScore: number; totalScore: number; gamesWon: number; gamesLost: number;
}
export interface GameHistoryEntry {
    id: string; gameId: GameId; score: number; won: boolean;
    duration: number; timestamp: string; rewards: { experience: number; coins: number };
}
export interface CompleteUser {
    uid: string; public: UserPublic; private: any;
    wallet: UserWallet; metadata: any; games: { [K in GameId]?: GameStats };
}
export interface GlobalLeaderboardEntry {
    uid: string; username: string; displayName: string;
    globalLevel: number; globalRank: string; avatar: string;
    totalGames: number; totalWins: number; winRate: number; favoriteGame: GameId | null;
}
export interface GameLeaderboardEntry {
    uid: string; username: string; displayName: string; avatar: string;
    highScore: number; level: number; rank: string;
    totalGames: number; winStreak: number; winRate: number;
}

// ── Service class ─────────────────────────────────────────────────────────────

class MultiGameQueryService {

    private games: Record<GameId, GameInfo> = {
        'flappy-bird':   { id: 'flappy-bird',   name: 'Flappy Bird',   icon: '🐦', description: 'Navigate through pipes',      category: 'arcade', enabled: true, order: 1 },
        'space-shooter': { id: 'space-shooter', name: 'Space Shooter', icon: '🚀', description: '1v1 space battle game',        category: 'action', enabled: true, order: 2 },
        'ball-crush':    { id: 'ball-crush',    name: 'Ball Crush',    icon: '⚽', description: 'Crush balls and score points', category: 'arcade', enabled: true, order: 3 },
    };

    getGameInfo(gameId: GameId): GameInfo { return this.games[gameId]; }
    getAllGames(): GameInfo[] { return Object.values(this.games).filter(g => g.enabled); }

    // ── User ──────────────────────────────────────────────────────────────────

    async getUserByUid(uid: string): Promise<CompleteUser | null> {
        try {
            console.log(`🔍 Getting user by UID: ${uid}`);
            const res = await api.getUser(uid);
            if (!res.success || !res.user) return null;

            // Normalise wallet balance (server sends the correct one)
            const u = res.user as CompleteUser;
            return { uid, ...u };
        } catch (err) {
            console.error('Error in getUserByUid:', err);
            return null;
        }
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    async getGameStats(uid: string, gameId: GameId): Promise<GameStats | null> {
        try {
            const res = await api.getStats(uid, gameId);
            return res.success ? res.stats : _defaultStats();
        } catch { return _defaultStats(); }
    }

    async updateGameStats(
        uid: string, gameId: GameId,
        score: number, won: boolean, duration: number
    ): Promise<void> {
        try {
            await api.updateStats(uid, gameId, { score, won, duration });
        } catch (err) { console.error('Error in updateGameStats:', err); }
    }

    // ── History ───────────────────────────────────────────────────────────────

    async addGameHistory(_uid: string, _entry: Omit<GameHistoryEntry, 'id'>): Promise<void> {
        // Saved server-side inside updateStats — no-op here.
    }

    async getGameHistory(uid: string, gameId?: GameId, limit = 20): Promise<GameHistoryEntry[]> {
        try {
            const res = await api.getScores(uid, gameId || '', limit);
            if (!res.success) return [];
            return (res.scores || []).map((d: any) => ({
                id: d.id, gameId: d.game || d.gameId,
                score: d.score, won: d.won, duration: d.duration || 0,
                timestamp: d.date || new Date(d.timestamp).toISOString(),
                rewards: { experience: d.won ? 100 : 10, coins: d.won ? 10 : 2 },
            }));
        } catch { return []; }
    }

    // ── Leaderboards ──────────────────────────────────────────────────────────

    async getGlobalLeaderboard(limit = 10): Promise<GlobalLeaderboardEntry[]> {
        try {
            const res = await api.getAllLeaderboard(limit);
            if (!res.success) return [];
            return (res.leaderboard || []).map((e: any) => ({
                uid: e.uid, username: e.username || 'unknown',
                displayName: e.displayName || 'Unknown',
                globalLevel: e.level || 1, globalRank: e.rankTier || 'Bronze',
                avatar: e.avatar || 'default',
                totalGames: e.totalGames || 0, totalWins: e.totalWins || 0,
                winRate: e.winRate || 0, favoriteGame: null,
            }));
        } catch { return []; }
    }

    async getGameLeaderboard(gameId: GameId, limit = 10): Promise<GameLeaderboardEntry[]> {
        try {
            const res = await api.getLeaderboard(gameId, limit);
            if (!res.success) return [];
            return (res.leaderboard || []).map((e: any) => ({
                uid: e.uid, username: e.username || 'unknown',
                displayName: e.displayName || 'Unknown', avatar: e.avatar || 'default',
                highScore: e.highScore || 0, level: e.level || 1, rank: e.rank || 'Rookie',
                totalGames: e.totalGames || 0, winStreak: e.winStreak || 0,
                winRate: e.winRate || 0,
            }));
        } catch { return []; }
    }

    async getUserGameRank(uid: string, gameId: GameId): Promise<{ rank: number; total: number }> {
        try {
            const res = await api.getRank(uid, gameId);
            return res.success ? { rank: res.rank, total: res.total } : { rank: 0, total: 0 };
        } catch { return { rank: 0, total: 0 }; }
    }

    // ── Achievements ──────────────────────────────────────────────────────────

    async checkGameAchievements(_uid: string, _gameId: GameId, _score: number): Promise<string[]> {
        // Handled server-side — no-op here.
        return [];
    }

    // ── Wallet ────────────────────────────────────────────────────────────────

    async getWalletBalance(uid: string): Promise<number> {
        try {
            const res = await api.getBalance(uid);
            return res.balance ?? 0;
        } catch { return 0; }
    }

    async updateWalletBalance(uid: string, amount: number, type: string, description: string): Promise<boolean> {
        try {
            const res = await api.transact(uid, amount, type, description);
            return res.success;
        } catch { return false; }
    }

    // ── Favorite game ─────────────────────────────────────────────────────────

    async getFavoriteGame(uid: string): Promise<GameId | null> {
        try {
            const res = await api.getUser(uid);
            if (!res.success || !res.user?.games) return null;
            let max = 0, fav: GameId | null = null;
            Object.entries(res.user.games).forEach(([id, s]: [string, any]) => {
                if ((s.totalGames || 0) > max) { max = s.totalGames; fav = id as GameId; }
            });
            return fav;
        } catch { return null; }
    }
}

function _defaultStats(): GameStats {
    return {
        highScore: 0, totalGames: 0, totalWins: 0, totalLosses: 0,
        winStreak: 0, bestWinStreak: 0, experience: 0, level: 1, rank: 'Rookie',
        achievements: [], lastPlayed: new Date().toISOString(),
        averageScore: 0, totalScore: 0, gamesWon: 0, gamesLost: 0,
    };
}

export const multiGameQueries = new MultiGameQueryService();