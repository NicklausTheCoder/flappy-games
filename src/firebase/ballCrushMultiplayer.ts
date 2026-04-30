// src/firebase/ballCrushMultiplayer.ts
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

const SERVER_BASE = (import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com').replace(/\/$/, '');

async function patchLobby(path: string, body: object): Promise<void> {
  await fetch(`${SERVER_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

class BallCrushMultiplayer {

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    try { await api.setOnline(uid, isOnline); }
    catch (err) { console.error('Error setting player online:', err); }
  }

  async setPlayerQueueStatus(_uid: string, _inQueue: boolean): Promise<void> {}

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    try { await api.setGameStatus(uid, inGame, lobbyId); }
    catch (err) { console.error('Error setting game status:', err); }
  }

  async markLobbyReadyWithTimestamp(_lobbyId: string, _startedAt: number): Promise<void> {}
  async markLobbyDead(_lobbyId: string): Promise<void> {}

  startMatchmakingService(): void {}
  stopMatchmakingService():  void {}
  async joinQueue(_uid: string, _username: string, _displayName: string, _avatar?: string): Promise<void> {}
  async leaveQueue(_uid: string): Promise<void> {}

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

  async createLobby(_p1Uid: string, _p2Uid: string, _p1Data: any, _p2Data: any): Promise<string> {
    return '';
  }

  subscribeToLobby(lobbyId: string, callback: (lobby: BallCrushLobby | null) => void): () => void {
    if (!lobbyId) return () => {};
    this.getLobby(lobbyId).then(callback);
    const id = setInterval(() => this.getLobby(lobbyId).then(callback), 2000);
    return () => clearInterval(id);
  }

  // ✅ Actually writes isReady to Firebase via the server
  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    try {
      await patchLobby(`/api/lobby/${lobbyId}/player/${uid}/ready`, { isReady });
      console.log(`✅ [BallCrush] Player ${uid} ready=${isReady} written to lobby ${lobbyId}`);
    } catch (err) {
      console.error('❌ setPlayerReady error:', err);
    }
  }

  // ✅ Marks lobby as playing
  async startGame(lobbyId: string): Promise<void> {
    try {
      await patchLobby(`/api/lobby/${lobbyId}/start`, {});
    } catch (err) {
      console.error('❌ startGame error:', err);
    }
  }

  async setDisplaced(_uid: string, _lobbyId: string): Promise<void>  {}
  async clearDisplaced(_uid: string): Promise<void>                  {}
  async cancelFromLobby(_lobbyId: string, _cancellerUid: string): Promise<void> {}
  async updatePosition(_lobbyId: string, _uid: string, _x: number): Promise<void> {}
  async updateBallPosition(_lobbyId: string, _ballData: any): Promise<void> {}
  subscribeToBallUpdates(_lobbyId: string, _callback: (ballData: any) => void): () => void { return () => {}; }
  async playerScored(_lobbyId: string, _scorerUid: string, _opponentUid: string): Promise<void> {}
  async resetBall(_lobbyId: string, _direction: 'up' | 'down'): Promise<void> {}
  async endGame(_lobbyId: string, _winnerUid: string): Promise<void> {}
  async playerLeave(_lobbyId: string, _uid: string): Promise<void> {}
  cleanup(_lobbyId: string, ...unsubscribeFunctions: (() => void)[]): void {
    unsubscribeFunctions.forEach(fn => fn?.());
  }
}

export const ballCrushMultiplayer = new BallCrushMultiplayer();