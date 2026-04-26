// src/firebase/flappyBirdMultiplayer.ts
//
// Zero Firebase SDK on the client.
// All reads/writes go through the game server REST API.
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished';

export interface FlappyBirdPlayer {
  uid: string; username: string; displayName: string; avatar: string;
  score: number; alive: boolean; position: { x: number; y: number }; isReady: boolean;
}

export interface FlappyBirdLobby {
  id: string; gameId: 'flappy-bird'; status: GameStatus;
  players: { [uid: string]: FlappyBirdPlayer };
  playerIds: string[]; createdAt: number;
  startedAt?: number; finishedAt?: number; winner?: string; maxPlayers: 2;
  gameSpeed?: number; obstacles?: any[];
}

class FlappyBirdMultiplayer {

  // ── Online status ─────────────────────────────────────────────────────────────

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    try { await api.setOnline(uid, isOnline); }
    catch (err) { console.error('Error setting player online:', err); }
  }

  async setPlayerQueueStatus(_uid: string, _inQueue: boolean): Promise<void> { /* no-op */ }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    try { await api.setGameStatus(uid, inGame, lobbyId); }
    catch (err) { console.error('Error setting game status:', err); }
  }

  async isPlayerOnline(_uid: string): Promise<boolean> { return true; }
  async cleanupOfflinePlayers(): Promise<void>         { /* server handles */ }

  // ── Matchmaking ───────────────────────────────────────────────────────────────

  async joinQueue(
    _uid: string, _username: string, _displayName: string, _avatar?: string
  ): Promise<void> { /* Socket.IO handles this */ }

  async leaveQueue(_uid: string): Promise<void> { /* no-op */ }

  // ── Lobby ─────────────────────────────────────────────────────────────────────

  async getLobby(lobbyId: string): Promise<FlappyBirdLobby | null> {
    if (!lobbyId) return null;
    try {
      const res = await api.getLobby(lobbyId);
      return res.success && res.lobby ? res.lobby as FlappyBirdLobby : null;
    } catch { return null; }
  }

  async createLobby(
    _p1Uid: string, _p2Uid: string, _p1Data: any, _p2Data: any
  ): Promise<string> { return ''; }

  subscribeToLobby(
    lobbyId: string, callback: (lobby: FlappyBirdLobby | null) => void
  ): () => void {
    if (!lobbyId) return () => {};
    this.getLobby(lobbyId).then(callback);
    const id = setInterval(() => this.getLobby(lobbyId).then(callback), 2000);
    return () => clearInterval(id);
  }

  async setPlayerReady(_lobbyId: string, _uid: string, _isReady: boolean): Promise<void> { /* no-op */ }
  async startGame(_lobbyId: string): Promise<void>                                        { /* no-op */ }

  // ── Game actions ──────────────────────────────────────────────────────────────

  async updatePlayerPosition(_lobbyId: string, _uid: string, _y: number): Promise<void> { /* no-op */ }
  async playerScored(_lobbyId: string, _uid: string): Promise<void>                     { /* no-op */ }
  async playerDied(_lobbyId: string, _uid: string): Promise<void>                       { /* no-op */ }
  async updateObstacles(_lobbyId: string, _obstacles: any[]): Promise<void>             { /* no-op */ }

  // ── Game end ──────────────────────────────────────────────────────────────────

  async endGame(_lobbyId: string, _winnerUid: string): Promise<void> { /* server handles */ }
  async playerLeave(_lobbyId: string, _uid: string): Promise<void>   { /* server handles */ }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  cleanup(_lobbyId: string, ...unsubscribeFunctions: (() => void)[]): void {
    unsubscribeFunctions.forEach(fn => fn?.());
  }
}

export const flappyBirdMultiplayer = new FlappyBirdMultiplayer();