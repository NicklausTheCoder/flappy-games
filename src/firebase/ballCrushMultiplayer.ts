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

  async markLobbyReady(lobbyId: string): Promise<void> {
    if (!lobbyId) return;
    try {
      await update(ref(db, `lobbies/${lobbyId}`), { status: 'ready' });
      console.log(`✅ Lobby ${lobbyId} marked as ready`);
    } catch (error) {
      console.error('Error marking lobby as ready:', error);
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
      remove(ref(db, `matching_lock/${uid}`)),
      update(ref(db, `online/${uid}`), { inQueue: false, lastSeen: Date.now() })
    ]);
  }

  /**
   * Cleans up lobbies that are stuck in 'waiting' or 'dead' state for this player.
   * DOES NOT touch 'finished' lobbies.
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

  startMatchmakingService(): void {
    if (this.matchmakingListener) return;

    const lockRef = ref(db, 'matchmaking_lock/ball-crush');
    const myId = Math.random().toString(36).slice(2);

    runTransaction(lockRef, (current) => {
      const now = Date.now();
      if (!current || (now - current.claimedAt) > 8000) {
        return { claimedAt: now, claimedBy: myId };
      }
      return undefined; // Someone else holds the lock
    }).then((result) => {
      if (!result.committed) {
        console.log('👀 Another client is matchmaking, just listening for our own match');
        setTimeout(() => {
          this.startMatchmakingService();
        }, 9000);
        return;
      }

      console.log('🎯 This client is the ball-crush matchmaker');
      const myLockValue = result.snapshot.val();

      // Renew the lock every 5s so other clients know we're still alive
      const renewInterval = setInterval(async () => {
        if (!this.matchmakingListener) { clearInterval(renewInterval); return; }
        await update(lockRef, { claimedAt: Date.now() });
      }, 5000);

      const queueRef = ref(db, 'matchmaking/ball-crush');
      this.matchmakingListener = onValue(queueRef, async (snapshot) => {
        if (!snapshot.exists()) return;

        // Verify we still hold the lock before doing anything
        const lockSnap = await get(lockRef);
        if (!lockSnap.exists() || lockSnap.val().claimedBy !== myLockValue.claimedBy) {
          console.log('⚠️ Lost matchmaking lock, stopping');
          this.stopMatchmakingService();
          clearInterval(renewInterval);
          return;
        }

        const queue = snapshot.val() as Record<string, any>;
        const players = Object.values(queue) as any[];
        if (players.length < 2) return;

        const now = Date.now();
        // Only consider players who joined recently (within 3 minutes)
        const eligible = players.filter(
          (p) => p.uid && (!p.joinedAt || (now - p.joinedAt) < 180000)
        );
        if (eligible.length < 2) return;

        // Sort oldest-first for fairness (FIFO)
        eligible.sort((a, b) => a.joinedAt - b.joinedAt);

        // Process one pair per tick to keep things clean
        const p1 = eligible[0];
        const p2 = eligible[1];
        if (p1.uid === p2.uid) return;

        // Lock both players at the match-assignment level first
        // to prevent two concurrent matchmaker instances from double-assigning
        const locked1 = await this.lockPlayerForMatch(p1.uid);
        if (!locked1) {
          console.log(`⚠️ ${p1.uid} already being matched, skipping`);
          return;
        }

        const locked2 = await this.lockPlayerForMatch(p2.uid);
        if (!locked2) {
          console.log(`⚠️ ${p2.uid} already being matched, skipping`);
          await this.unlockPlayerFromMatch(p1.uid);
          return;
        }

        // Now atomically claim both from the queue
        const claim1 = await this.atomicClaimPlayer(p1.uid);
        if (!claim1.claimed) {
          console.log(`⚠️ Failed to claim ${p1.uid} from queue (already taken)`);
          await this.unlockPlayerFromMatch(p1.uid);
          await this.unlockPlayerFromMatch(p2.uid);
          return;
        }

        const claim2 = await this.atomicClaimPlayer(p2.uid);
        if (!claim2.claimed) {
          console.log(`⚠️ Failed to claim ${p2.uid} from queue (already taken)`);
          // Roll back p1
          await set(ref(db, `matchmaking/ball-crush/${p1.uid}`), claim1.data);
          await this.unlockPlayerFromMatch(p1.uid);
          await this.unlockPlayerFromMatch(p2.uid);
          return;
        }

        console.log(`✅ Matched: ${p1.username} vs ${p2.username}`);
        try {
          await this.createLobby(p1.uid, p2.uid, claim1.data, claim2.data);
        } catch (err) {
          console.error('Failed to create lobby, re-queuing both players:', err);
          await set(ref(db, `matchmaking/ball-crush/${p1.uid}`), claim1.data);
          await set(ref(db, `matchmaking/ball-crush/${p2.uid}`), claim2.data);
        } finally {
          // Always release the match-level locks
          await this.unlockPlayerFromMatch(p1.uid);
          await this.unlockPlayerFromMatch(p2.uid);
        }
      });
    }).catch(console.error);
  }

  stopMatchmakingService(): void {
    if (this.matchmakingListener) {
      this.matchmakingListener();
      this.matchmakingListener = null;
    }
  }

  /**
   * Atomically claim a player from the queue.
   * Returns { claimed: true, data } ONLY if THIS caller was the one who removed the entry.
   */
  private async atomicClaimPlayer(uid: string): Promise<{ claimed: boolean; data: any }> {
    const playerRef = ref(db, `matchmaking/ball-crush/${uid}`);
    try {
      let capturedData: any = null;

      const result = await runTransaction(playerRef, (currentData) => {
        if (currentData === null) {
          // Already claimed by someone else — abort
          return undefined;
        }
        capturedData = currentData;
        return null; // Delete the entry atomically
      });

      if (result.committed && result.snapshot.val() === null && capturedData !== null) {
        return { claimed: true, data: capturedData };
      }

      return { claimed: false, data: null };
    } catch (error) {
      console.error('Transaction failed for', uid, error);
      return { claimed: false, data: null };
    }
  }

  /**
   * Guard against a player being assigned to multiple lobbies simultaneously.
   * Uses a Firebase transaction on a per-player "matching_lock" flag.
   */
  private async lockPlayerForMatch(uid: string): Promise<boolean> {
    const lockRef = ref(db, `matching_lock/${uid}`);
    try {
      const result = await runTransaction(lockRef, (current) => {
        if (current !== null) return undefined; // Already locked — abort
        return { lockedAt: Date.now() };
      });
      return result.committed;
    } catch {
      return false;
    }
  }

  private async unlockPlayerFromMatch(uid: string): Promise<void> {
    try {
      await remove(ref(db, `matching_lock/${uid}`));
    } catch { /* best effort */ }
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
    if (!lobbyId) return () => { };
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
    if (!lobbyId) return () => { };
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
    const newScore = (lobby.players[scorerUid]?.score || 0) + 1;

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

    await remove(ref(db, `gameStates/${lobbyId}`));

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