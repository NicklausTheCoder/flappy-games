// src/firebase/ballCrushMultiplayer.ts
import {
  ref,
  get,
  set,
  update,
  onValue,
  off,
  remove,
  runTransaction,
  serverTimestamp,
  push
} from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'dead';

export interface BallCrushPlayer {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  health: number;
  position: { x: number; y: number };
  isReady: boolean;
  score: number;
}

export interface BallCrushLobby {
  id: string;
  gameId: 'ball-crush';
  status: GameStatus;
  players: {
    [uid: string]: BallCrushPlayer;
  };
  playerIds: string[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  winner?: string;
  maxPlayers: 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER-SIDE MATCHMAKING (run this in a Cloud Function or trusted backend)
// Only ONE instance should run this — not every client.
// Export it so your backend/admin can import and call startMatchmakingService().
// ─────────────────────────────────────────────────────────────────────────────

class BallCrushMultiplayer {
  private matchmakingListener: (() => void) | null = null;

  // =========== ONLINE STATUS ===========

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    if (!uid) return;
    try {
      await set(ref(db, `online/${uid}`), {
        online: isOnline,
        lastSeen: Date.now(),
        inQueue: false,
        inGame: false
      });
    } catch (error) {
      console.error('Error setting player online status:', error);
    }
  }

  async setPlayerQueueStatus(uid: string, inQueue: boolean): Promise<void> {
    if (!uid) return;
    try {
      await update(ref(db, `online/${uid}`), {
        inQueue,
        lastSeen: Date.now()
      });
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    if (!uid) return;
    try {
      const updates: any = { inGame, lastSeen: Date.now() };
      if (lobbyId) updates.currentLobby = lobbyId;
      await update(ref(db, `online/${uid}`), updates);
    } catch (error) {
      console.error('Error updating game status:', error);
    }
  }

  async isPlayerOnlineAndInQueue(uid: string): Promise<boolean> {
    if (!uid) return false;
    try {
      const snap = await get(ref(db, `online/${uid}`));
      if (!snap.exists()) return false;
      const d = snap.val();
      return d.online === true && d.inQueue === true && (Date.now() - d.lastSeen < 30000);
    } catch {
      return false;
    }
  }

  // =========== QUEUE ENTRY ===========

  /**
   * Join the matchmaking queue.
   * Cleans up ONLY stale (waiting/dead) lobbies — never touches finished ones.
   * After a game ends, call this to requeue cleanly.
   */
  async joinQueue(
    uid: string,
    username: string,
    displayName: string,
    avatar: string = 'default'
  ): Promise<void> {
    if (!uid) {
      console.error('❌ Cannot join queue: uid is undefined');
      return;
    }

    console.log(`🎮 ${username} joining ball-crush queue`);

    // 1. Clean up any stale lobbies (waiting/dead only — NOT finished)
    await this.cleanupStaleLobbies(uid);

    // 2. Clear any leftover match notification from a previous session
    await remove(ref(db, `matches/${uid}`));

    // 3. Mark online + in queue
    await set(ref(db, `online/${uid}`), {
      online: true,
      inQueue: true,
      inGame: false,
      lastSeen: Date.now()
    });

    // 4. Add to queue — use set so duplicate joins just overwrite
    await set(ref(db, `matchmaking/ball-crush/${uid}`), {
      uid,
      username,
      displayName: displayName || username,
      avatar: avatar || 'default',
      joinedAt: Date.now(),
      gameId: 'ball-crush'
    });

    console.log(`✅ ${username} added to queue`);
  }

  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 ${uid} left ball-crush queue`);
    await Promise.all([
      remove(ref(db, `matchmaking/ball-crush/${uid}`)),
      update(ref(db, `online/${uid}`), { inQueue: false, lastSeen: Date.now() })
    ]);
  }

  /**
   * Cleans up lobbies that are stuck in 'waiting' or 'dead' state for this player.
   * DOES NOT touch 'finished' lobbies — avoids wiping matches/ for a new game.
   */
  private async cleanupStaleLobbies(uid: string): Promise<void> {
    try {
      const snap = await get(ref(db, 'lobbies'));
      if (!snap.exists()) return;

      const now = Date.now();
      const deletions: Promise<void>[] = [];

      snap.forEach((child) => {
        const lobby = child.val();
        const lobbyId = child.key!;
        const isStale = now - (lobby.createdAt || 0) > 5 * 60 * 1000; // older than 5 min
        const isOurLobby = lobby.playerIds && lobby.playerIds.includes(uid);
        const isDeadOrWaiting = lobby.status === 'waiting' || lobby.status === 'dead';

        if (isOurLobby && (isDeadOrWaiting || isStale)) {
          console.log(`🗑️ Removing stale lobby ${lobbyId} (status: ${lobby.status})`);
          deletions.push(remove(ref(db, `lobbies/${lobbyId}`)));
          deletions.push(remove(ref(db, `gameStates/${lobbyId}`)));
        }
      });

      await Promise.all(deletions);
    } catch (error) {
      console.error('Error cleaning up stale lobbies:', error);
    }
  }

  // =========== MATCHMAKING SERVICE ===========
  // ⚠️  Run this in ONE place only (Cloud Function / admin server).
  //     At scale, every client running this causes duplicate lobbies.

  startMatchmakingService(): void {
    if (this.matchmakingListener) return;

    const queueRef = ref(db, 'matchmaking/ball-crush');

    this.matchmakingListener = onValue(queueRef, async (snapshot) => {
      if (!snapshot.exists()) return;

      const queue = snapshot.val() as Record<string, any>;
      const players = Object.values(queue);

      if (players.length < 2) return;

      // Filter: only players that are truly online and in queue
      const now = Date.now();
      const online = players.filter(p =>
        p.uid &&
        (now - (p.joinedAt || 0)) < 120000 // in queue less than 2 min
      );

      if (online.length < 2) return;

      // Sort by join time (FIFO)
      online.sort((a, b) => a.joinedAt - b.joinedAt);

      // Process pairs — handle multiple matches in one pass for scale
      for (let i = 0; i + 1 < online.length; i += 2) {
        const p1 = online[i];
        const p2 = online[i + 1];

        if (p1.uid === p2.uid) continue;

        // Atomically claim both slots
        const claimed1 = await this.atomicClaimPlayer(
          ref(db, `matchmaking/ball-crush/${p1.uid}`)
        );
        if (!claimed1) continue;

        const claimed2 = await this.atomicClaimPlayer(
          ref(db, `matchmaking/ball-crush/${p2.uid}`)
        );
        if (!claimed2) {
          // Roll p1 back
          await set(ref(db, `matchmaking/ball-crush/${p1.uid}`), p1);
          continue;
        }

        console.log(`✅ Matched: ${p1.username} vs ${p2.username}`);
        try {
          await this.createLobby(p1.uid, p2.uid, p1, p2);
        } catch (err) {
          console.error('Failed to create lobby, re-queuing:', err);
          // Re-queue both on failure
          await set(ref(db, `matchmaking/ball-crush/${p1.uid}`), p1);
          await set(ref(db, `matchmaking/ball-crush/${p2.uid}`), p2);
        }
      }
    });
  }

  stopMatchmakingService(): void {
    if (this.matchmakingListener) {
      this.matchmakingListener();
      this.matchmakingListener = null;
    }
  }

  private async atomicClaimPlayer(playerRef: any): Promise<boolean> {
    try {
      const result = await runTransaction(playerRef, (current) => {
        if (current === null) return current; // Already claimed
        return null; // Claim it
      });
      return result.committed && result.snapshot.val() === null;
    } catch (error) {
      console.error('Transaction failed:', error);
      return false;
    }
  }

  // =========== LOBBY MANAGEMENT ===========

  async createLobby(
    player1Uid: string,
    player2Uid: string,
    player1Data: any,
    player2Data: any
  ): Promise<string> {
    const lobbyId = `ballcrush_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const lobby: BallCrushLobby = {
      id: lobbyId,
      gameId: 'ball-crush',
      status: 'waiting',
      players: {
        [player1Uid]: {
          uid: player1Uid,
          username: player1Data.username || 'Player 1',
          displayName: player1Data.displayName || player1Data.username || 'Player 1',
          avatar: player1Data.avatar || 'default',
          health: 5,
          position: { x: 180, y: 550 },
          isReady: false,
          score: 0
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username || 'Player 2',
          displayName: player2Data.displayName || player2Data.username || 'Player 2',
          avatar: player2Data.avatar || 'default',
          health: 5,
          position: { x: 180, y: 50 },
          isReady: false,
          score: 0
        }
      },
      playerIds: [player1Uid, player2Uid],
      createdAt: Date.now(),
      maxPlayers: 2
    };

    await set(ref(db, `lobbies/${lobbyId}`), lobby);

    // Notify both players simultaneously
    await Promise.all([
      set(ref(db, `matches/${player1Uid}`), {
        lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now()
      }),
      set(ref(db, `matches/${player2Uid}`), {
        lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now()
      }),
      update(ref(db, `online/${player1Uid}`), { inGame: true, inQueue: false }),
      update(ref(db, `online/${player2Uid}`), { inGame: true, inQueue: false })
    ]);

    console.log(`🏰 Lobby created: ${lobbyId}`);
    return lobbyId;
  }

  async getLobby(lobbyId: string): Promise<BallCrushLobby | null> {
    if (!lobbyId) return null;
    try {
      const snap = await get(ref(db, `lobbies/${lobbyId}`));
      return snap.exists() ? (snap.val() as BallCrushLobby) : null;
    } catch (error) {
      console.error('Error getting lobby:', error);
      return null;
    }
  }

  subscribeToLobby(
    lobbyId: string,
    callback: (lobby: BallCrushLobby | null) => void
  ): () => void {
    if (!lobbyId) return () => {};
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    const unsub = onValue(lobbyRef, (snap) => {
      callback(snap.exists() ? (snap.val() as BallCrushLobby) : null);
    });
    return unsub;
  }

  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), { isReady });

    const lobby = await this.getLobby(lobbyId);
    if (lobby && lobby.status === 'waiting') {
      const allReady = lobby.playerIds.every(id => lobby.players[id]?.isReady);
      if (allReady) await this.startGame(lobbyId);
    }
  }

  async startGame(lobbyId: string): Promise<void> {
    if (!lobbyId) return;
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now()
    });
    console.log(`🎮 Game started in lobby: ${lobbyId}`);
  }

  // =========== DISPLACED PLAYER HANDLING ===========

  async setDisplaced(uid: string, lobbyId: string): Promise<void> {
    await set(ref(db, `displaced/${uid}`), { lobbyId, timestamp: Date.now() });
  }

  async clearDisplaced(uid: string): Promise<void> {
    await remove(ref(db, `displaced/${uid}`));
  }

  async cancelFromLobby(lobbyId: string, cancellerUid: string): Promise<void> {
    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const opponentUid = lobby.playerIds.find(id => id !== cancellerUid);
    if (opponentUid) {
      await this.setDisplaced(opponentUid, lobbyId);
    }

    await Promise.all([
      update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' }),
      remove(ref(db, `gameStates/${lobbyId}`))
    ]);
  }

  // =========== GAME ACTIONS ===========

  async updatePosition(lobbyId: string, uid: string, x: number): Promise<void> {
    if (!lobbyId || !uid) return;
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}/position`), { x });
  }

  async updateBallPosition(
    lobbyId: string,
    ballData: {
      x: number;
      y: number;
      speed: number;
      directionX: number;
      directionY: number;
      timestamp?: number;
    }
  ): Promise<void> {
    if (!lobbyId) return;
    await set(ref(db, `gameStates/${lobbyId}/ball`), {
      x: ballData.x,
      y: ballData.y,
      speed: ballData.speed,
      direction: { x: ballData.directionX, y: ballData.directionY },
      timestamp: ballData.timestamp || Date.now(),
      lastUpdate: Date.now()
    });
  }

  subscribeToBallUpdates(lobbyId: string, callback: (ballData: any) => void): () => void {
    if (!lobbyId) return () => {};
    const ballRef = ref(db, `gameStates/${lobbyId}/ball`);
    const unsub = onValue(ballRef, (snap) => {
      if (snap.exists()) callback(snap.val());
    });
    return unsub;
  }

  async playerScored(lobbyId: string, scorerUid: string, opponentUid: string): Promise<void> {
    if (!lobbyId || !scorerUid || !opponentUid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const newHealth = Math.max(0, (lobby.players[opponentUid]?.health || 5) - 1);
    const newScore  = (lobby.players[scorerUid]?.score || 0) + 1;

    await Promise.all([
      update(ref(db, `lobbies/${lobbyId}/players/${opponentUid}`), { health: newHealth }),
      update(ref(db, `lobbies/${lobbyId}/players/${scorerUid}`), { score: newScore })
    ]);

    if (newHealth <= 0) {
      await this.endGame(lobbyId, scorerUid);
    }
  }

  async resetBall(lobbyId: string, serverDirection: 'up' | 'down'): Promise<void> {
    if (!lobbyId) return;
    await set(ref(db, `gameStates/${lobbyId}/ball`), {
      x: 180,
      y: 320,
      speed: 200,
      direction: serverDirection === 'up'
        ? { x: (Math.random() * 0.8) - 0.4, y: -0.8 }
        : { x: (Math.random() * 0.8) - 0.4, y: 0.8 },
      lastUpdate: Date.now()
    });
  }

  // =========== GAME END ===========

  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });

    console.log(`🏆 Game finished, winner: ${winnerUid}`);

    // Clean up game state immediately; lobby persists briefly for UI
    await remove(ref(db, `gameStates/${lobbyId}`));

    // Remove lobby after 5 minutes (for post-game UI)
    setTimeout(async () => {
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60 * 1000);
  }

  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const other = lobby.playerIds.find(id => id !== uid);

    if (other && lobby.status === 'playing') {
      await this.endGame(lobbyId, other);
    } else {
      await update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' });
    }

    // Mark both players as no longer in game
    const updates: Record<string, any> = {
      [`online/${uid}/inGame`]: false,
      [`online/${uid}/lastSeen`]: Date.now()
    };
    if (other) {
      updates[`online/${other}/inGame`] = false;
      updates[`online/${other}/lastSeen`] = Date.now();
    }
    await update(ref(db), updates);
  }

  cleanup(lobbyId: string, ...unsubscribeFunctions: (() => void)[]) {
    unsubscribeFunctions.forEach(fn => fn && fn());
    if (lobbyId) off(ref(db, `gameStates/${lobbyId}/ball`));
  }
}

export const ballCrushMultiplayer = new BallCrushMultiplayer();