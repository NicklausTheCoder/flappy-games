// src/firebase/checkersMultiplayer.ts
//
// Zero Firebase SDK on the client.
// Matchmaking is handled entirely by the Socket.IO server.
// This class keeps only what game scenes actually call:
//   - setPlayerOnline / setPlayerGameStatus  → POST /api/online/:uid
//   - getLobby                               → GET  /api/lobby/:lobbyId
//   - endGame                                → POST /api/lobby/:lobbyId/end
//   - subscribeToLobby                       → polling (no Firebase realtime client)
//   - createLobby / joinQueue / leaveQueue   → no-ops (Socket.IO server does this)
//
// All exported function signatures are IDENTICAL to the original.

import { api } from './api';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'dead';

export interface CheckersPlayer {
  uid: string; username: string; displayName: string; avatar: string;
  isReady: boolean; position: { x: number; y: number }; color?: 'red' | 'black';
}

export interface CheckersLobby {
  id: string; gameId: 'checkers'; status: GameStatus;
  players: { [uid: string]: CheckersPlayer };
  playerIds: string[]; createdAt: number;
  startedAt?: number; finishedAt?: number; winner?: string; maxPlayers: 2;
}

class CheckersMultiplayer {

  // ── Online status ─────────────────────────────────────────────────────────────

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    try { await api.setOnline(uid, isOnline); }
    catch (err) { console.error('Error setting player online:', err); }
  }

  async setPlayerQueueStatus(_uid: string, _inQueue: boolean): Promise<void> {
    // Queue is managed server-side via Socket.IO — no-op here.
  }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    try { await api.setGameStatus(uid, inGame, lobbyId); }
    catch (err) { console.error('Error setting game status:', err); }
  }

  // ── Player online check ───────────────────────────────────────────────────────

  async isPlayerOnline(_uid: string): Promise<boolean> {
    // The server tracks this. Clients don't need to query it directly.
    return true;
  }

  async isPlayerOnlineAndInQueue(_uid: string): Promise<boolean> { return true; }

  async cleanupOfflinePlayers(): Promise<void> { /* server handles this */ }

  // ── Matchmaking — delegated entirely to Socket.IO server ──────────────────────
  //
  // Scenes that still call joinQueue / leaveQueue will find these no-ops.
  // The actual queue logic lives in game/checkers-matchmaking.js on the server.
  // Scenes should emit 'joinCheckersMatchmaking' via Socket.IO instead.

  startMatchmakingService(): void { /* Socket.IO server handles matchmaking */ }
  stopMatchmakingService():  void { /* no-op */ }

  async joinQueue(_uid: string, _username: string, _displayName: string, _avatar?: string): Promise<void> {
    // Handled by CheckersMatchmakingScene via socket.emit('joinCheckersMatchmaking').
  }

  async leaveQueue(_uid: string): Promise<void> {
    // Handled by CheckersMatchmakingScene via socket.emit('leaveCheckersMatchmaking').
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────────

  async getLobby(lobbyId: string): Promise<CheckersLobby | null> {
    if (!lobbyId) { console.error('❌ getLobby: no lobbyId'); return null; }
    try {
      const res = await api.getLobby(lobbyId);
      if (res.success && res.lobby) return res.lobby as CheckersLobby;
      console.log('❌ Lobby not found:', lobbyId);
      return null;
    } catch (err) {
      console.error('❌ getLobby error:', err);
      return null;
    }
  }

  async createLobby(
    _p1Uid: string, _p2Uid: string, _p1Data: any, _p2Data: any
  ): Promise<string> {
    // Created server-side by the Socket.IO matchmaker — no-op here.
    return '';
  }

  /**
   * subscribeToLobby — polls the server every 2 s instead of using Firebase onValue.
   * Returns an unsubscribe function identical to the original signature.
   */
  subscribeToLobby(lobbyId: string, callback: (lobby: CheckersLobby | null) => void): () => void {
    if (!lobbyId) return () => {};

    // Initial fetch
    this.getLobby(lobbyId).then(callback);

    // Poll every 2 s — sufficient for lobby status changes (ready/playing/finished)
    const intervalId = setInterval(() => {
      this.getLobby(lobbyId).then(callback);
    }, 2000);

    return () => clearInterval(intervalId);
  }

  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    // Game uses Socket.IO events for ready state — no REST endpoint needed.
    console.log(`[Checkers] setPlayerReady: ${uid} ready=${isReady} in ${lobbyId}`);
  }

  async startGame(_lobbyId: string): Promise<void> { /* Socket.IO handles this */ }

  async markLobbyReady(_lobbyId: string): Promise<void> { /* no-op */ }

  // ── Displaced player ─────────────────────────────────────────────────────────

  async setDisplaced(_uid: string, _lobbyId: string): Promise<void> { /* no-op */ }
  async clearDisplaced(_uid: string): Promise<void>               { /* no-op */ }

  async cancelFromLobby(_lobbyId: string, _cancellerUid: string): Promise<void> {
    // Handled server-side when socket disconnects.
  }

  // ── Game end ──────────────────────────────────────────────────────────────────

  async endGame(lobbyId: string, _winnerUid: string): Promise<void> {
    // Server's CheckersGameRoom.endAndPersist handles this on game over.
    // This is kept for any scene that calls it directly as a fallback.
    console.log(`[Checkers] endGame called client-side for ${lobbyId} — server handles persist`);
  }

  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    // Scene should emit 'checkers:resign' via Socket.IO.
    console.log(`[Checkers] playerLeave: ${uid} from ${lobbyId}`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  cleanup(_lobbyId: string, ...unsubscribeFunctions: (() => void)[]): void {
    unsubscribeFunctions.forEach(fn => fn?.());
  }
}

export const checkersMultiplayer = new CheckersMultiplayer();