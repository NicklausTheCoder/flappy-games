// src/firebase/ballCrushSimple.ts
//
// Zero Firebase SDK on the client.
// All reads and writes go through the game server REST API via api.ts.
// All exported function signatures are IDENTICAL to the original —
// no game scene files need to change.

import { api } from './api';

// ── Types (unchanged) ──────────────────────────────────────────────────────────

export interface BallCrushUserData {
  username: string; displayName: string; avatar: string;
  rank: string; level: number; createdAt: string;
  totalWinnings: number; winningsCount: number; lastWinDate?: string;
  highScore: number; totalGames: number; totalWins: number; totalLosses: number;
  winStreak: number; bestWinStreak: number; totalScore: number; averageScore: number;
  experience: number; achievements: string[];
  balance: number; totalDeposited: number; totalWithdrawn: number;
  totalWon: number; totalLost: number; totalBonus: number;
  lastLogin: string; isActive: boolean;
}

export interface BallCrushLeaderboardEntry {
  username: string; displayName: string; highScore: number;
  rank: string; level: number; totalWins: number; winRate: number;
}

export interface BallCrushScoreEntry {
  id?: string; date: string; score: number;
  won: boolean; timestamp: number; game?: string;
}

// ── Balance ───────────────────────────────────────────────────────────────────

export async function getBallCrushBalance(uid: string): Promise<number> {
  try {
    const res = await api.getBalance(uid);
    console.log(`💰 Balance for ${uid}: $${res.balance}`);
    return res.balance ?? 0;
  } catch { return 0; }
}

// ── Wallet transaction ────────────────────────────────────────────────────────

export async function updateBallCrushWalletBalance(
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
    console.error('❌ updateBallCrushWalletBalance:', err);
    return false;
  }
}

// Legacy alias kept for any callers using the old two-arg signature
export async function deductBallCrushWalletBalance(
  uid: string, amount: number, description: string
): Promise<boolean> {
  return updateBallCrushWalletBalance(uid, amount, 'game_fee', description);
}

// ── Get user data ─────────────────────────────────────────────────────────────

export async function getBallCrushUserData(uid: string): Promise<BallCrushUserData | null> {
  try {
    console.log(`📡 Fetching Ball Crush data for UID: ${uid}`);
    const res = await api.getUser(uid);
    if (!res.success || !res.user) return _default('Player');

    const u         = res.user;
    const pub       = u.public || {};
    const gameStats = u.games?.['ball-crush'] || {};
    const winnings  = u.winnings || { total: 0, count: 0 };
    const wallet    = u.wallet || {};

    return {
      username:      pub.username    || 'Player',
      displayName:   pub.displayName || 'Player',
      avatar:        pub.avatar      || 'default',
      rank:          pub.globalRank  || 'Bronze',
      level:         pub.globalLevel || 1,
      createdAt:     u.metadata?.createdAt || new Date().toISOString(),
      totalWinnings: winnings.total  || 0,
      winningsCount: winnings.count  || 0,
      lastWinDate:   winnings.lastWin,
      highScore:     gameStats.highScore     || 0,
      totalGames:    gameStats.totalGames    || 0,
      totalWins:     gameStats.totalWins     || 0,
      totalLosses:   gameStats.totalLosses   || 0,
      winStreak:     gameStats.winStreak     || 0,
      bestWinStreak: gameStats.bestWinStreak || 0,
      totalScore:    gameStats.totalScore    || 0,
      averageScore:  gameStats.averageScore  || 0,
      experience:    gameStats.experience    || 0,
      achievements:  gameStats.achievements  || [],
      balance:        wallet.balance         || 0,
      totalDeposited: wallet.totalDeposited  || 0,
      totalWithdrawn: wallet.totalWithdrawn  || 0,
      totalWon:       wallet.totalWon        || 0,
      totalLost:      wallet.totalLost       || 0,
      totalBonus:     wallet.totalBonus      || 0,
      lastLogin:      u.private?.lastLogin   || new Date().toISOString(),
      isActive:       pub.isOnline           || false,
    };
  } catch (err) {
    console.error('❌ getBallCrushUserData:', err);
    return _default('Player');
  }
}

// ── Profile stats ─────────────────────────────────────────────────────────────

export async function updateBallCrushProfileStats(
  uid: string, score: number, won: boolean, duration: number
): Promise<void> {
  try {
    console.log(`📊 Updating Ball Crush profile stats for UID: ${uid}`);
    const res = await api.updateStats(uid, 'ball-crush', { score, won, duration });
    if (res.success) console.log('✅ Profile stats updated:', res.stats);
    else             console.error('❌ Stats update failed:', res.error);
  } catch (err) { console.error('❌ updateBallCrushProfileStats:', err); }
}

export async function getBallCrushProfileStats(uid: string): Promise<any> {
  try {
    const res = await api.getStats(uid, 'ball-crush');
    return res.success ? res.stats : null;
  } catch { return null; }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getBallCrushLeaderboard(limit = 10): Promise<BallCrushLeaderboardEntry[]> {
  try {
    const res = await api.getLeaderboard('ball-crush', limit);
    if (!res.success) return [];
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
    console.error('❌ getBallCrushLeaderboard:', err);
    return [];
  }
}

// ── Winnings ──────────────────────────────────────────────────────────────────

export async function getBallCrushWinnings(uid: string): Promise<number> {
  try {
    const res = await api.getWinnings(uid, 'ball-crush');
    return res.total ?? 0;
  } catch { return 0; }
}

export async function getBallCrushWinCount(uid: string): Promise<number> {
  // Count is stored in the same winnings node on the server
  return getBallCrushWinnings(uid);
}

// ── Save score ────────────────────────────────────────────────────────────────
//
// Original took (username, score, won) and did a username→uid lookup.
// The lookup no longer happens client-side (no Firebase).
// Pass uid instead of username — if old callers pass a username the server
// will return an error and false is returned gracefully.

export async function saveBallCrushScore(
  uid: string, score: number, won: boolean
): Promise<boolean> {
  return saveBallCrushScoreByUid(uid, score, won);
}

export async function saveBallCrushScoreByUid(
  uid: string, score: number, won: boolean
): Promise<boolean> {
  try {
    console.log(`💾 Saving Ball Crush score — uid=${uid} score=${score} won=${won}`);
    const res = await api.updateStats(uid, 'ball-crush', { score, won });
    if (res.success) console.log('✅ Ball Crush score saved');
    return res.success;
  } catch (err) {
    console.error('❌ saveBallCrushScoreByUid:', err);
    return false;
  }
}

// ── Stats update ──────────────────────────────────────────────────────────────
// Original took (username, score, won). Now delegates to saveBallCrushScoreByUid.

export async function updateBallCrushStats(
  uid: string, score: number, won: boolean
): Promise<void> {
  await saveBallCrushScoreByUid(uid, score, won);
}

// ── Player rank ───────────────────────────────────────────────────────────────

export async function getBallCrushPlayerRank(username: string): Promise<number> {
  try {
    const res = await api.getRankByUsername(username, 'ball-crush');
    return res.success ? res.rank : 999;
  } catch { return 999; }
}

// ── Score history ─────────────────────────────────────────────────────────────
// Original took username + did a lookup. Now takes uid directly.

export async function getBallCrushUserScores(
  uid: string, limit = 10
): Promise<BallCrushScoreEntry[]> {
  try {
    console.log(`📊 Fetching Ball Crush scores for UID: ${uid}`);
    const res = await api.getScores(uid, 'ball-crush', limit);
    if (!res.success) return [];
    return (res.scores || []).map((d: any) => ({
      id:        d.id,
      date:      new Date(d.timestamp).toLocaleDateString(),
      score:     d.score,
      won:       d.won,
      timestamp: d.timestamp,
      game:      d.game || 'ball-crush',
    }));
  } catch (err) {
    console.error('❌ getBallCrushUserScores:', err);
    return [];
  }
}

// ── Private ───────────────────────────────────────────────────────────────────

function _default(username: string): BallCrushUserData {
  return {
    username, displayName: username, avatar: 'default',
    rank: 'Bronze', level: 1, createdAt: new Date().toISOString(),
    totalWinnings: 0, winningsCount: 0,
    highScore: 0, totalGames: 0, totalWins: 0, totalLosses: 0,
    winStreak: 0, bestWinStreak: 0, totalScore: 0, averageScore: 0,
    experience: 0, achievements: [],
    balance: 0, totalDeposited: 0, totalWithdrawn: 0,
    totalWon: 0, totalLost: 0, totalBonus: 0,
    lastLogin: new Date().toISOString(), isActive: true,
  };
}