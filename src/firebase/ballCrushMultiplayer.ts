// src/firebase/ballCrushMultiplayer.ts
//
// Zero Firebase SDK on the client.
// Matchmaking is handled entirely by the Socket.IO server.
// This class keeps only what game scenes actually call.
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'dead';

export interface BallCrushPlayer {
  uid: string; username: string; displayName: string; avatar: string;
  health: number; position: { x: number; y: number }; isReady: boolean; score: number;
}

export interface BallCrushLobby {
  id: string; gameId: 'ball-crush'; status: GameStatus;
  players: { [uid: string]: BallCrushPlayer };
  playerIds: string[]; createdAt: number;
  startedAt?: number; finishedAt?: number; winner?: string; maxPlayers: 2;
  countdownStartedAt?: number;
}

class BallCrushMultiplayer {

  // ── Online status ─────────────────────────────────────────────────────────────

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    try { await api.setOnline(uid, isOnline); }
    catch (err) { console.error('Error setting player online:', err); }
  }

  async setPlayerQueueStatus(_uid: string, _inQueue: boolean): Promise<void> {
    // Queue managed server-side via Socket.IO — no-op.
  }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    try { await api.setGameStatus(uid, inGame, lobbyId); }
    catch (err) { console.error('Error setting game status:', err); }
  }

  // ── Lobby ready / countdown ───────────────────────────────────────────────────

  async markLobbyReadyWithTimestamp(_lobbyId: string, _startedAt: number): Promise<void> {
    // Game start is coordinated by the Socket.IO server — no-op here.
  }

  async markLobbyDead(_lobbyId: string): Promise<void> {
    // Server handles lobby cleanup — no-op here.
  }

  // ── Matchmaking — delegated entirely to Socket.IO server ──────────────────────
  //
  // Actual queue logic lives in game/ballcrush-matchmaking.js on the server.
  // Scenes emit 'joinMatchmaking' via Socket.IO instead.

  startMatchmakingService(): void { /* Socket.IO server handles matchmaking */ }
  stopMatchmakingService():  void { /* no-op */ }

  async joinQueue(
    _uid: string, _username: string, _displayName: string, _avatar?: string
  ): Promise<void> {
    // Handled by BallCrushMatchmakingScene via socket.emit('joinMatchmaking').
  }

  async leaveQueue(_uid: string): Promise<void> {
    // Handled by BallCrushMatchmakingScene via socket.emit('leaveMatchmaking').
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────────

  async getLobby(lobbyId: string): Promise<BallCrushLobby | null> {
    if (!lobbyId) return null;
    try {
      const res = await api.getLobby(lobbyId);
      return res.success && res.lobby ? res.lobby as BallCrushLobby : null;
    } catch (err) {
      console.error('❌ getLobby error:', err);
      return null;
    }
  }

  async createLobby(
    _p1Uid: string, _p2Uid: string, _p1Data: any, _p2Data: any
  ): Promise<string> {
    // Created server-side by Socket.IO matchmaker — no-op here.
    return '';
  }

  /**
   * subscribeToLobby — polls every 2 s instead of Firebase onValue.
   * Signature identical to original.
   */
  subscribeToLobby(
    lobbyId: string, callback: (lobby: BallCrushLobby | null) => void
  ): () => void {
    if (!lobbyId) return () => {};
    this.getLobby(lobbyId).then(callback);
    const id = setInterval(() => this.getLobby(lobbyId).then(callback), 2000);
    return () => clearInterval(id);
  }

  async setPlayerReady(_lobbyId: string, _uid: string, _isReady: boolean): Promise<void> {
    // Coordinated via Socket.IO game room events.
  }

  async startGame(_lobbyId: string): Promise<void> { /* Socket.IO handles this */ }

  // ── Displaced player ─────────────────────────────────────────────────────────

  async setDisplaced(_uid: string, _lobbyId: string): Promise<void>  { /* no-op */ }
  async clearDisplaced(_uid: string): Promise<void>                  { /* no-op */ }
  async cancelFromLobby(_lobbyId: string, _cancellerUid: string): Promise<void> { /* no-op */ }

  // ── Game actions — all handled server-side via Socket.IO ──────────────────────

  async updatePosition(_lobbyId: string, _uid: string, _x: number): Promise<void> { /* no-op */ }

  async updateBallPosition(_lobbyId: string, _ballData: any): Promise<void> { /* no-op */ }

  subscribeToBallUpdates(_lobbyId: string, _callback: (ballData: any) => void): () => void {
    // Ball state is pushed by the server via Socket.IO gameState events.
    return () => {};
  }

  async playerScored(
    _lobbyId: string, _scorerUid: string, _opponentUid: string
  ): Promise<void> { /* no-op — server authoritative */ }

  async resetBall(_lobbyId: string, _direction: 'up' | 'down'): Promise<void> { /* no-op */ }

  // ── Game end ──────────────────────────────────────────────────────────────────

  async endGame(_lobbyId: string, _winnerUid: string): Promise<void> {
    // Server's BallCrushRoom.endGame handles this — no-op here.
  }

  async playerLeave(_lobbyId: string, _uid: string): Promise<void> {
    // Server handles disconnect → win on socket disconnect event.
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  cleanup(_lobbyId: string, ...unsubscribeFunctions: (() => void)[]): void {
    unsubscribeFunctions.forEach(fn => fn?.());
  }
}

export const ballCrushMultiplayer = new BallCrushMultiplayer();