// src/firebase/flappyBirdTournament.ts
//
// Zero Firebase SDK on the client.
// All tournament reads/writes go through the game server REST API.
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

export interface TournamentPeriod {
  id: string; startTime: number; endTime: number;
  players: {
    [uid: string]: {
      username: string; displayName: string;
      highestScore: number; gamesPlayed: number; lastPlayed: number;
    };
  };
  totalPool: number;
  winner?: { uid: string; username: string; displayName: string; score: number; prize: number };
  status: 'active' | 'completed' | 'paid';
}

export interface TournamentEntry {
  uid: string; username: string; displayName: string; score: number; timestamp: number;
}

// ── Period helpers (pure client-side calculations, no DB needed) ───────────────

export function getCurrentTournamentPeriod(): string {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = String(now.getMonth() + 1).padStart(2, '0');
  const d    = String(now.getDate()).padStart(2, '0');
  const h    = String(Math.floor(now.getHours() / 4) * 4).padStart(2, '0');
  return `${y}-${m}-${d}-${h}`;
}

export function getTournamentPeriodBounds(periodId: string): { start: number; end: number } {
  const [y, mo, d, h] = periodId.split('-').map(Number);
  return {
    start: new Date(y, mo - 1, d, h, 0, 0, 0).getTime(),
    end:   new Date(y, mo - 1, d, h + 4, 0, 0, 0).getTime(),
  };
}

// ── API-backed functions ───────────────────────────────────────────────────────

export async function getOrCreateTournamentPeriod(): Promise<TournamentPeriod> {
  // Server creates the period if it doesn't exist when status is fetched.
  const res = await api.getTournamentStatus('flappy-bird');
  // Return a minimal TournamentPeriod shape so callers don't break.
  const periodId = getCurrentTournamentPeriod();
  const { start, end } = getTournamentPeriodBounds(periodId);
  return {
    id: periodId, startTime: start, endTime: end,
    players: {}, totalPool: res.totalPool || 0, status: 'active',
  };
}

export async function recordTournamentGame(
  uid: string, username: string, displayName: string, score: number
): Promise<void> {
  try {
    await api.recordTournamentGame('flappy-bird', uid, username, displayName, score);
    console.log(`📊 Tournament game recorded — ${username} score=${score}`);
  } catch (err) {
    console.error('❌ recordTournamentGame error:', err);
  }
}

export async function completeTournamentPeriod(periodId: string): Promise<void> {
  // Completion is triggered server-side automatically.
  // This is a no-op client-side — kept for signature compatibility.
  console.log(`[Tournament] completeTournamentPeriod(${periodId}) — handled server-side`);
}

export async function getCurrentTournamentStatus(): Promise<{
  periodId: string; timeRemaining: number; totalPool: number;
  players: number; topPlayers: Array<{ username: string; displayName: string; score: number }>;
}> {
  try {
    const res = await api.getTournamentStatus('flappy-bird');
    if (res.success) return res;
  } catch (err) {
    console.error('❌ getCurrentTournamentStatus error:', err);
  }
  return {
    periodId: getCurrentTournamentPeriod(),
    timeRemaining: 0, totalPool: 0, players: 0, topPlayers: [],
  };
}

export async function checkAndCompleteExpiredPeriods(): Promise<void> {
  // Server runs this every 5 minutes automatically — no-op client-side.
}

export async function getTournamentHistory(limit = 10): Promise<TournamentPeriod[]> {
  try {
    const res = await api.getTournamentHistory('flappy-bird', limit);
    return res.success ? res.history || [] : [];
  } catch (err) {
    console.error('❌ getTournamentHistory error:', err);
    return [];
  }
}