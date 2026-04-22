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
  countdownStartedAt?: number; // written by host when both players ready
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCK CONSTANTS
//
// GLOBAL_LOCK_TTL  — how long the matchmaking-service lock lives before another
//                    client can steal it. Keep SHORT so a crashed tab doesn't
//                    block matchmaking. The holder renews every RENEW_INTERVAL.
//
// RENEW_INTERVAL   — how often the active matchmaker refreshes the lock.
//                    Must be well below GLOBAL_LOCK_TTL.
//
// PAIR_LOCK_TTL    — per-player "currently being matched" lock. Held only for
//                    the duration of createLobby (~1-2 s). Stale locks are
//                    automatically overwritten after this timeout.
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_LOCK_TTL = 4_000;  // ms
const RENEW_INTERVAL  = 2_000;  // ms  (must be < GLOBAL_LOCK_TTL / 2)
const PAIR_LOCK_TTL   = 15_000; // ms

class BallCrushMultiplayer {
  private matchmakingListener: (() => void) | null = null;
  private renewInterval: ReturnType<typeof setInterval> | null = null;

  // =========== ONLINE STATUS ===========

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
    if (!uid) return;
    try {
      await set(ref(db, `online/${uid}`), {
        online: isOnline,
        lastSeen: Date.now(),
        inQueue: false,
        inGame: false,
      });
    } catch (error) {
      console.error('Error setting player online status:', error);
    }
  }

  async setPlayerQueueStatus(uid: string, inQueue: boolean): Promise<void> {
    if (!uid) return;
    try {
      await update(ref(db, `online/${uid}`), { inQueue, lastSeen: Date.now() });
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    if (!uid) return;
    try {
      const updates: Record<string, unknown> = { inGame, lastSeen: Date.now() };
      if (lobbyId) updates.currentLobby = lobbyId;
      await update(ref(db, `online/${uid}`), updates);
    } catch (error) {
      console.error('Error updating game status:', error);
    }
  }

  // =========== LOBBY READY / COUNTDOWN ===========

  /**
   * Marks the lobby as 'ready' and writes the countdown start timestamp
   * in a single atomic update. Both clients read this timestamp to drive
   * their countdown display — guaranteeing they show the same number at
   * the same wall-clock time regardless of subscription lag.
   *
   * Called by the HOST only when both players are ready.
   * Idempotent — safe to call multiple times (status won't regress from 'ready').
   */
  async markLobbyReadyWithTimestamp(lobbyId: string, startedAt: number): Promise<void> {
    if (!lobbyId) return;
    try {
      // Only transition waiting → ready, never ready → ready (avoid resetting timestamp)
      const snap = await get(ref(db, `lobbies/${lobbyId}/status`));
      if (snap.exists() && snap.val() !== 'waiting') return;

      await update(ref(db, `lobbies/${lobbyId}`), {
        status: 'ready',
        countdownStartedAt: startedAt,
      });
      console.log(`✅ Lobby ${lobbyId} ready, countdown started at ${startedAt}`);
    } catch (error) {
      console.error('Error marking lobby ready with timestamp:', error);
    }
  }

  // =========== QUEUE ENTRY ===========

  /**
   * Join the matchmaking queue.
   * The $1 fee is charged in the scene BEFORE this is called.
   * This method only manages queue state.
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

    // Clear any stale pair-lock from a crashed previous session
    await remove(ref(db, `matching_lock/${uid}`)).catch(() => {});

    // Remove leftover match notification from a previous session
    await remove(ref(db, `matches/${uid}`)).catch(() => {});

    // Clean up stale lobbies before rejoining
    await this.cleanupStaleLobbies(uid);

    // Mark online + in queue
    await set(ref(db, `online/${uid}`), {
      online: true,
      inQueue: true,
      inGame: false,
      lastSeen: Date.now(),
    });

    // Write queue entry — set() so repeated joins just overwrite
    await set(ref(db, `matchmaking/ball-crush/${uid}`), {
      uid,
      username,
      displayName: displayName || username,
      avatar: avatar || 'default',
      joinedAt: Date.now(),
      gameId: 'ball-crush',
    });

    console.log(`✅ ${username} added to queue`);
  }

  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 ${uid} left ball-crush queue`);
    await Promise.all([
      remove(ref(db, `matchmaking/ball-crush/${uid}`)),
      remove(ref(db, `matching_lock/${uid}`)),
      update(ref(db, `online/${uid}`), { inQueue: false, lastSeen: Date.now() }),
    ]);
  }
async markLobbyDead(lobbyId: string): Promise<void> {
  if (!lobbyId) return;
  try {
    // Only update if not already finished/dead — never overwrite a completed game
    const snap = await get(ref(db, `lobbies/${lobbyId}/status`));
    if (!snap.exists()) return;
    const status = snap.val();
    if (status === 'finished' || status === 'dead') return;

    await Promise.all([
      update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' }),
      remove(ref(db, `gameStates/${lobbyId}`)),
    ]);
    console.log(`🪦 Lobby ${lobbyId} marked dead`);
  } catch (error) {
    console.error('Error marking lobby dead:', error);
  }
}
  private async cleanupStaleLobbies(uid: string): Promise<void> {
    try {
      const snap = await get(ref(db, 'lobbies'));
      if (!snap.exists()) return;

      const now = Date.now();
      const deletions: Promise<void>[] = [];

      snap.forEach((child) => {
        const lobby = child.val();
        const lobbyId = child.key!;
        const age = now - (lobby.createdAt || 0);
        const isOurs = lobby.playerIds?.includes(uid);
        const isStaleWaiting = lobby.status === 'waiting' && age > 2 * 60_000;
        const isDead = lobby.status === 'dead';
        const isVeryOld = age > 5 * 60_000;

        if (isOurs && (isStaleWaiting || isDead || isVeryOld)) {
          console.log(`🗑️ Removing stale lobby ${lobbyId} (${lobby.status})`);
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
  //
  // HOW THE DISTRIBUTED LOCK WORKS
  // ──────────────────────────────
  // 1. Each client races to write `matchmaking_lock/ball-crush` via a Firebase
  //    transaction. Only one wins — Firebase transactions are atomic server-side.
  //    The winner becomes THE matchmaker; everyone else retries after TTL expiry.
  //
  // 2. The winner renews its lock every RENEW_INTERVAL ms. If it crashes, the
  //    lock expires after GLOBAL_LOCK_TTL ms and the next client takes over.
  //
  // 3. Inside the queue onValue callback, the winner re-reads the lock BEFORE
  //    touching any player data. If it no longer owns the lock it stops.
  //
  // 4. Per-player pair-locks (`matching_lock/<uid>`) are short-lived locks that
  //    prevent two matchmaker instances from matching the same player at once.
  //    Released in a finally block — always.
  //
  // 5. atomicClaimPlayer uses a Firebase transaction to DELETE the player from
  //    the queue atomically. Only one client can delete a non-null node.
  //
  // IMPORTANT FOR CALLERS (the Phaser scene):
  //   • Call startMatchmakingService() ONCE when entering the matchmaking scene.
  //   • Do NOT call stop() + start() on a timer — that breaks the distributed
  //     lock. If you want a "nudge" after N seconds, call joinQueue() again to
  //     refresh the player's joinedAt timestamp instead.

  startMatchmakingService(): void {
    if (this.matchmakingListener) return; // Already running on this instance

    const lockRef = ref(db, 'matchmaking_lock/ball-crush');
    const myId    = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    runTransaction(lockRef, (current) => {
      const now     = Date.now();
      const expired = !current || (now - (current.claimedAt ?? 0)) > GLOBAL_LOCK_TTL;
      if (expired) return { claimedAt: now, claimedBy: myId };
      return undefined; // Someone holds a fresh lock — abort
    })
      .then((result) => {
        if (!result.committed) {
          // Another client holds the lock — retry after it would expire
          console.log('👀 Another client is matchmaking — will retry');
          setTimeout(() => this.startMatchmakingService(), GLOBAL_LOCK_TTL + 500);
          return;
        }

        console.log(`🎯 This client (${myId}) is the ball-crush matchmaker`);

        // Renew the lock on a tight interval
        this.renewInterval = setInterval(async () => {
          if (!this.matchmakingListener) {
            clearInterval(this.renewInterval!);
            this.renewInterval = null;
            return;
          }
          try {
            await runTransaction(lockRef, (current) => {
              if (!current || current.claimedBy !== myId) return undefined; // Lost it
              return { claimedAt: Date.now(), claimedBy: myId };
            });
          } catch { /* best effort */ }
        }, RENEW_INTERVAL);

        const queueRef = ref(db, 'matchmaking/ball-crush');
        this.matchmakingListener = onValue(queueRef, (snapshot) => {
          this.processQueue(snapshot, lockRef, myId).catch(console.error);
        });
      })
      .catch(console.error);
  }

  private async processQueue(
    snapshot: import('firebase/database').DataSnapshot,
    lockRef: import('firebase/database').DatabaseReference,
    myId: string
  ): Promise<void> {
    if (!snapshot.exists()) return;

    // Re-verify lock ownership BEFORE touching any player data
    const lockSnap = await get(lockRef);
    if (!lockSnap.exists() || lockSnap.val().claimedBy !== myId) {
      console.log('⚠️ Lost matchmaking lock — stopping');
      this.stopMatchmakingService();
      return;
    }

    const queue = snapshot.val() as Record<string, any>;
    const now   = Date.now();

    const eligible = (Object.values(queue) as any[]).filter(
      (p) => p.uid && (!p.joinedAt || now - p.joinedAt < 180_000)
    );

    if (eligible.length < 2) return;

    // FIFO — match the two longest-waiting players
    eligible.sort((a, b) => a.joinedAt - b.joinedAt);

    const p1 = eligible[0];
    const p2 = eligible[1];
    if (!p1?.uid || !p2?.uid || p1.uid === p2.uid) return;

    // Acquire per-player pair-locks (both or neither)
    const locked1 = await this.lockPlayerForMatch(p1.uid);
    if (!locked1) {
      console.log(`⚠️ ${p1.uid} already being matched — skipping tick`);
      return;
    }

    const locked2 = await this.lockPlayerForMatch(p2.uid);
    if (!locked2) {
      console.log(`⚠️ ${p2.uid} already being matched — skipping tick`);
      await this.unlockPlayerFromMatch(p1.uid);
      return;
    }

    try {
      // Atomically remove both players from the queue
      const claim1 = await this.atomicClaimPlayer(p1.uid);
      if (!claim1.claimed) {
        console.log(`⚠️ ${p1.uid} already claimed — skipping`);
        return;
      }

      const claim2 = await this.atomicClaimPlayer(p2.uid);
      if (!claim2.claimed) {
        console.log(`⚠️ ${p2.uid} already claimed — rolling back p1`);
        await set(ref(db, `matchmaking/ball-crush/${p1.uid}`), claim1.data).catch(() => {});
        return;
      }

      console.log(`✅ Matched: ${p1.username} vs ${p2.username}`);

      try {
        await this.createLobby(p1.uid, p2.uid, claim1.data, claim2.data);
      } catch (err) {
        console.error('❌ createLobby failed — re-queuing both:', err);
        await Promise.all([
          set(ref(db, `matchmaking/ball-crush/${p1.uid}`), claim1.data).catch(() => {}),
          set(ref(db, `matchmaking/ball-crush/${p2.uid}`), claim2.data).catch(() => {}),
        ]);
      }
    } finally {
      // Always release pair-locks
      await this.unlockPlayerFromMatch(p1.uid);
      await this.unlockPlayerFromMatch(p2.uid);
    }
  }

  stopMatchmakingService(): void {
    if (this.matchmakingListener) {
      this.matchmakingListener();
      this.matchmakingListener = null;
    }
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }
  }

  private async atomicClaimPlayer(uid: string): Promise<{ claimed: boolean; data: any }> {
    const playerRef = ref(db, `matchmaking/ball-crush/${uid}`);
    let capturedData: any = null;
    try {
      const result = await runTransaction(playerRef, (current) => {
        if (current === null) return undefined; // Already gone — abort
        capturedData = current;
        return null; // Delete atomically
      });

      if (result.committed && result.snapshot.val() === null && capturedData !== null) {
        return { claimed: true, data: capturedData };
      }
      return { claimed: false, data: null };
    } catch (error) {
      console.error('atomicClaimPlayer failed for', uid, error);
      return { claimed: false, data: null };
    }
  }

  private async lockPlayerForMatch(uid: string): Promise<boolean> {
    const lockRef = ref(db, `matching_lock/${uid}`);
    try {
      const result = await runTransaction(lockRef, (current) => {
        if (current !== null) {
          const isStale = Date.now() - (current.lockedAt ?? 0) > PAIR_LOCK_TTL;
          if (!isStale) return undefined; // Actively locked — abort
        }
        return { lockedAt: Date.now() };
      });
      return result.committed;
    } catch {
      return false;
    }
  }

  private async unlockPlayerFromMatch(uid: string): Promise<void> {
    await remove(ref(db, `matching_lock/${uid}`)).catch(() => {});
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
          score: 0,
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username || 'Player 2',
          displayName: player2Data.displayName || player2Data.username || 'Player 2',
          avatar: player2Data.avatar || 'default',
          health: 5,
          position: { x: 180, y: 50 },
          isReady: false,
          score: 0,
        },
      },
      playerIds: [player1Uid, player2Uid],
      createdAt: Date.now(),
      maxPlayers: 2,
    };

    await set(ref(db, `lobbies/${lobbyId}`), lobby);

    await Promise.all([
      set(ref(db, `matches/${player1Uid}`), {
        lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now(),
      }),
      set(ref(db, `matches/${player2Uid}`), {
        lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now(),
      }),
      update(ref(db, `online/${player1Uid}`), { inGame: true, inQueue: false }),
      update(ref(db, `online/${player2Uid}`), { inGame: true, inQueue: false }),
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
    return onValue(lobbyRef, (snap) => {
      callback(snap.exists() ? (snap.val() as BallCrushLobby) : null);
    });
  }

  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    if (!lobbyId || !uid) return;
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), { isReady });
  }

  async startGame(lobbyId: string): Promise<void> {
    if (!lobbyId) return;
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now(),
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

    const opponentUid = lobby.playerIds.find((id) => id !== cancellerUid);
    if (opponentUid) await this.setDisplaced(opponentUid, lobbyId);

    await Promise.all([
      update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' }),
      remove(ref(db, `gameStates/${lobbyId}`)),
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
      timestamp: ballData.timestamp ?? Date.now(),
      lastUpdate: Date.now(),
    });
  }

  subscribeToBallUpdates(lobbyId: string, callback: (ballData: any) => void): () => void {
    if (!lobbyId) return () => {};
    const ballRef = ref(db, `gameStates/${lobbyId}/ball`);
    return onValue(ballRef, (snap) => {
      if (snap.exists()) callback(snap.val());
    });
  }

  async playerScored(lobbyId: string, scorerUid: string, opponentUid: string): Promise<void> {
    if (!lobbyId || !scorerUid || !opponentUid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const newHealth = Math.max(0, (lobby.players[opponentUid]?.health ?? 5) - 1);
    const newScore  = (lobby.players[scorerUid]?.score ?? 0) + 1;

    await Promise.all([
      update(ref(db, `lobbies/${lobbyId}/players/${opponentUid}`), { health: newHealth }),
      update(ref(db, `lobbies/${lobbyId}/players/${scorerUid}`), { score: newScore }),
    ]);

    if (newHealth <= 0) await this.endGame(lobbyId, scorerUid);
  }

  async resetBall(lobbyId: string, serverDirection: 'up' | 'down'): Promise<void> {
    if (!lobbyId) return;
    await set(ref(db, `gameStates/${lobbyId}/ball`), {
      x: 180,
      y: 320,
      speed: 200,
      direction:
        serverDirection === 'up'
          ? { x: Math.random() * 0.8 - 0.4, y: -0.8 }
          : { x: Math.random() * 0.8 - 0.4, y: 0.8 },
      lastUpdate: Date.now(),
    });
  }

  // =========== GAME END ===========

  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid,
    });

    console.log(`🏆 Game finished, winner: ${winnerUid}`);
    await remove(ref(db, `gameStates/${lobbyId}`));

    setTimeout(async () => {
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60_000);
  }

  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const other = lobby.playerIds.find((id) => id !== uid);

    if (other && lobby.status === 'playing') {
      await this.endGame(lobbyId, other);
    } else {
      await update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' });
    }

    const onlineUpdates: Record<string, unknown> = {
      [`online/${uid}/inGame`]: false,
      [`online/${uid}/lastSeen`]: Date.now(),
    };
    if (other) {
      onlineUpdates[`online/${other}/inGame`] = false;
      onlineUpdates[`online/${other}/lastSeen`] = Date.now();
    }
    await update(ref(db), onlineUpdates);
  }

  cleanup(lobbyId: string, ...unsubscribeFunctions: (() => void)[]) {
    unsubscribeFunctions.forEach((fn) => fn?.());
    if (lobbyId) off(ref(db, `gameStates/${lobbyId}/ball`));
  }
}

export const ballCrushMultiplayer = new BallCrushMultiplayer();