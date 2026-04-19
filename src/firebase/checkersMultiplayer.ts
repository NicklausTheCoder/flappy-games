import { ref, get, set, update, onValue, off, remove, runTransaction, push } from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'dead';

export interface CheckersPlayer {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  isReady: boolean;
  position: { x: number; y: number };
  color?: 'red' | 'black';
}

export interface CheckersLobby {
  id: string;
  gameId: 'checkers';
  status: GameStatus;
  players: {
    [uid: string]: CheckersPlayer;
  };
  playerIds: string[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  winner?: string;
  maxPlayers: 2;
}

class CheckersMultiplayer {
  private matchmakingListener: (() => void) | null = null;

  // =========== ONLINE STATUS MANAGEMENT ===========

  async setPlayerOnline(uid: string, isOnline: boolean): Promise<void> {
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

  async markLobbyReady(lobbyId: string): Promise<void> {
    if (!lobbyId) return;
    try {
      await update(ref(db, `lobbies/${lobbyId}`), { status: 'ready' });
      console.log(`✅ Lobby ${lobbyId} marked as ready`);
    } catch (error) {
      console.error('Error marking lobby as ready:', error);
    }
  }

  async setPlayerQueueStatus(uid: string, inQueue: boolean): Promise<void> {
    try {
      await update(ref(db, `online/${uid}`), {
        inQueue: inQueue,
        lastSeen: Date.now()
      });
    } catch (error) {
      console.error('Error updating queue status:', error);
    }
  }

  async setPlayerGameStatus(uid: string, inGame: boolean, lobbyId?: string): Promise<void> {
    try {
      const updates: any = { inGame, lastSeen: Date.now() };
      if (lobbyId) updates.currentLobby = lobbyId;
      await update(ref(db, `online/${uid}`), updates);
    } catch (error) {
      console.error('Error updating game status:', error);
    }
  }

  private async awardGamePrize(uid: string, lobbyId: string, lobby: CheckersLobby): Promise<void> {
    try {
      const prize = 1.50;
      const winningsBalanceRef = ref(db, `winningsBalance/${uid}`);
      const snapshot = await get(winningsBalanceRef);
      const currentWinnings = snapshot.exists() ? snapshot.val().balance || 0 : 0;

      await update(winningsBalanceRef, {
        balance: currentWinnings + prize,
        lastUpdated: new Date().toISOString()
      });

      await set(ref(db, `winnings/${uid}/${lobbyId}`), {
        amount: prize,
        game: 'checkers',
        lobbyId,
        awardedAt: new Date().toISOString()
      });

      console.log(`💰 Awarded $${prize} to ${uid} for checkers win`);
    } catch (error) {
      console.error('❌ Error awarding game prize:', error);
    }
  }

  async isPlayerOnlineAndInQueue(uid: string): Promise<boolean> {
    try {
      const snapshot = await get(ref(db, `online/${uid}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        return data.online === true && data.inQueue === true && (Date.now() - data.lastSeen < 30000);
      }
      return false;
    } catch (error) {
      console.error('Error checking player online:', error);
      return false;
    }
  }

  async isPlayerOnline(uid: string): Promise<boolean> {
    try {
      const snapshot = await get(ref(db, `online/${uid}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        return data.online === true && (Date.now() - data.lastSeen < 30000);
      }
      return false;
    } catch (error) {
      console.error('Error checking player online:', error);
      return false;
    }
  }

  async cleanupOfflinePlayers(): Promise<void> {
    try {
      const snapshot = await get(ref(db, 'online'));
      if (!snapshot.exists()) return;

      const now = Date.now();
      const updates: any = {};
      snapshot.forEach((child) => {
        const data = child.val();
        if (now - data.lastSeen > 60000 && !data.inQueue) {
          updates[`${child.key}/online`] = false;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db, 'online'), updates);
      }
    } catch (error) {
      console.error('Error cleaning up offline players:', error);
    }
  }

  // =========== ATOMIC MATCHMAKING ===========

  /**
   * Atomically claim a player from the queue.
   * Returns true ONLY if THIS caller was the one who removed the entry.
   * Uses a version field to detect if another client already claimed the slot.
   */
  private async atomicClaimPlayer(uid: string): Promise<{ claimed: boolean; data: any }> {
    const playerRef = ref(db, `matchmaking/checkers/${uid}`);
    try {
      let capturedData: any = null;

      const result = await runTransaction(playerRef, (currentData) => {
        if (currentData === null) {
          // Already claimed by someone else — abort
          return undefined;
        }
        // Mark as claimed so we can detect it
        capturedData = currentData;
        return null; // Delete the entry atomically
      });

      if (result.committed && result.snapshot.val() === null && capturedData !== null) {
        // WE successfully claimed this player
        return { claimed: true, data: capturedData };
      }

      // Either aborted (another client won) or data was already null
      return { claimed: false, data: null };
    } catch (error) {
      console.error('Transaction failed for', uid, error);
      return { claimed: false, data: null };
    }
  }

  /**
   * Guard against a player being assigned to multiple lobbies simultaneously.
   * Uses a Firebase transaction on a per-player "in_match" flag.
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

  /**
   * Start matchmaking service — runs continuously and uses atomic transactions.
   * Multiple clients can call this; only one will hold the lock at a time.
   */
  startMatchmakingService(): void {
    if (this.matchmakingListener) return;

    const lockRef = ref(db, 'matchmaking_lock/checkers');
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

      console.log('🎯 This client is the matchmaker');
      const myLockValue = result.snapshot.val();

      // Renew the lock every 10s
      const renewInterval = setInterval(async () => {
        if (!this.matchmakingListener) { clearInterval(renewInterval); return; }
        await update(lockRef, { claimedAt: Date.now() });
     }, 5000);

      const queueRef = ref(db, 'matchmaking/checkers');
      this.matchmakingListener = onValue(queueRef, async (snapshot) => {
        if (!snapshot.exists()) return;

        // Verify we still hold the lock
        const lockSnap = await get(lockRef);
        if (!lockSnap.exists() || lockSnap.val().claimedBy !== myLockValue.claimedBy) {
          console.log('⚠️ Lost matchmaking lock, stopping');
          this.stopMatchmakingService();
          clearInterval(renewInterval);
          return;
        }

        const queue = snapshot.val();
        const players = Object.values(queue) as any[];
        if (players.length < 2) return;

        const now = Date.now();
        // Only consider players who joined recently and are still active
       const eligible = players.filter(
          (p) => p.uid && (!p.joinedAt || (now - p.joinedAt) < 180000)
        );
        if (eligible.length < 2) return;

        // Sort oldest-first for fairness
        eligible.sort((a, b) => a.joinedAt - b.joinedAt);

        // Process one pair per tick to keep things clean
        const p1 = eligible[0];
        const p2 = eligible[1];
        if (p1.uid === p2.uid) return;

        // Lock both players at the "match assignment" level first
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
          await set(ref(db, `matchmaking/checkers/${p1.uid}`), claim1.data);
          await this.unlockPlayerFromMatch(p1.uid);
          await this.unlockPlayerFromMatch(p2.uid);
          return;
        }

        console.log(`✅ Matched: ${p1.username} vs ${p2.username}`);
        try {
          await this.createLobby(p1.uid, p2.uid, claim1.data, claim2.data);
        } catch (err) {
          console.error('Failed to create lobby, re-queuing both players:', err);
          await set(ref(db, `matchmaking/checkers/${p1.uid}`), claim1.data);
          await set(ref(db, `matchmaking/checkers/${p2.uid}`), claim2.data);
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
   * Join the matchmaking queue.
   * NOTE: The $1 fee is charged in the scene BEFORE calling this.
   * This method does NOT charge any fee — it only manages queue state.
   */
  async joinQueue(uid: string, username: string, displayName: string, avatar: string = 'default'): Promise<void> {
    if (!uid) {
      console.error('❌ Cannot join queue: uid is undefined');
      return;
    }

    console.log(`🎮 ${username} (${uid}) joined checkers matchmaking queue`);

    await this.cleanupPlayerLobbies(uid);
    await this.setPlayerOnline(uid, true);
    await this.setPlayerQueueStatus(uid, true);

    const queueData = {
      uid,
      username,
      displayName: displayName || username,
      avatar: avatar || 'default',
      joinedAt: Date.now(),
      gameId: 'checkers'
    };

    await set(ref(db, `matchmaking/checkers/${uid}`), queueData);
    await this.cleanupOfflinePlayers();
  }

  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 Player ${uid} left checkers queue`);
    await remove(ref(db, `matchmaking/checkers/${uid}`));
    await remove(ref(db, `matching_lock/${uid}`));
    await this.setPlayerQueueStatus(uid, false);
  }

  private async cleanupPlayerLobbies(uid: string): Promise<void> {
    try {
      const snapshot = await get(ref(db, 'lobbies'));
      if (!snapshot.exists()) return;

      const lobbies = snapshot.val();
      for (const [lobbyId, lobbyData] of Object.entries(lobbies)) {
        const lobby = lobbyData as any;
        if (lobby.playerIds && lobby.playerIds.includes(uid)) {
          if ((lobby.status === 'waiting' || lobby.status === 'dead') && lobby.playerIds.length === 1) {
            console.log(`🗑️ Cleaning up old lobby for player: ${lobbyId}`);
            await remove(ref(db, `lobbies/${lobbyId}`));
          }
          await remove(ref(db, `matches/${uid}`));
        }
      }
    } catch (error) {
      console.error('Error cleaning up player lobbies:', error);
    }
  }

  // =========== LOBBY MANAGEMENT ===========

  async createLobby(
    player1Uid: string,
    player2Uid: string,
    player1Data: any,
    player2Data: any
  ): Promise<string> {
    const lobbyId = `checkers_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const lobby: CheckersLobby = {
      id: lobbyId,
      gameId: 'checkers',
      status: 'waiting',
      players: {
        [player1Uid]: {
          uid: player1Uid,
          username: player1Data.username || 'Player 1',
          displayName: player1Data.displayName || player1Data.username || 'Player 1',
          avatar: player1Data.avatar || 'default',
          isReady: false,
          position: { x: 100, y: 550 },
          color: 'red'
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username || 'Player 2',
          displayName: player2Data.displayName || player2Data.username || 'Player 2',
          avatar: player2Data.avatar || 'default',
          isReady: false,
          position: { x: 260, y: 50 },
          color: 'black'
        }
      },
      playerIds: [player1Uid, player2Uid],
      createdAt: Date.now(),
      maxPlayers: 2
    };

    try {
      console.log('📝 Creating checkers lobby:', lobbyId);
      await set(ref(db, `lobbies/${lobbyId}`), lobby);
      console.log('✅ Lobby written to Firebase');

      // Notify both players
      await set(ref(db, `matches/${player1Uid}`), {
        lobbyId,
        gameId: 'checkers',
        timestamp: Date.now()
      });
      await set(ref(db, `matches/${player2Uid}`), {
        lobbyId,
        gameId: 'checkers',
        timestamp: Date.now()
      });

      console.log(`🏰 Checkers lobby created: ${lobbyId}`);
      return lobbyId;
    } catch (error) {
      console.error('❌ Failed to create lobby:', error);
      throw error;
    }
  }

  async getLobby(lobbyId: string): Promise<CheckersLobby | null> {
    if (!lobbyId) {
      console.error('❌ getLobby called with no lobbyId');
      return null;
    }
    try {
      const snapshot = await get(ref(db, `lobbies/${lobbyId}`));
      if (snapshot.exists()) return snapshot.val() as CheckersLobby;
      console.log('❌ Lobby not found:', lobbyId);
      return null;
    } catch (error) {
      console.error('❌ Error getting lobby:', error);
      return null;
    }
  }

  subscribeToLobby(lobbyId: string, callback: (lobby: CheckersLobby | null) => void): () => void {
    if (!lobbyId) return () => { };
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    return onValue(lobbyRef, (snapshot) => {
      callback(snapshot.exists() ? (snapshot.val() as CheckersLobby) : null);
    });
  }

  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    if (!lobbyId || !uid) return;
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), { isReady });

    const lobby = await this.getLobby(lobbyId);
    if (lobby && lobby.status === 'waiting') {
      const allReady = lobby.playerIds.every((id) => lobby.players[id]?.isReady);
      if (allReady) await this.startGame(lobbyId);
    }
  }

  async startGame(lobbyId: string): Promise<void> {
    if (!lobbyId) return;
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now()
    });
    console.log(`🎮 Checkers game started in lobby: ${lobbyId}`);
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
    if (opponentUid) {
      await this.setDisplaced(opponentUid, lobbyId);
      console.log(`📝 Opponent ${opponentUid} marked as displaced`);
    }

    await update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' });
    await remove(ref(db, `gameStates/${lobbyId}`));

    const queueSnapshot = await get(ref(db, `matchmaking/checkers/${cancellerUid}`));
    if (queueSnapshot.exists()) {
      await this.leaveQueue(cancellerUid);
    }
  }

  // =========== GAME END ===========

  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });

    console.log(`🏆 Checkers game finished, winner: ${winnerUid}`);

    const lobby = await this.getLobby(lobbyId);
    if (lobby) await this.awardGamePrize(winnerUid, lobbyId, lobby);

    setTimeout(async () => {
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60 * 1000);
  }

  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;
    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const otherPlayer = lobby.playerIds.find((id) => id !== uid);
    if (otherPlayer && lobby.status === 'playing') {
      await this.endGame(lobbyId, otherPlayer);
    } else {
      await update(ref(db, `lobbies/${lobbyId}`), { status: 'dead' });
    }
  }

  cleanup(lobbyId: string, ...unsubscribeFunctions: (() => void)[]) {
    unsubscribeFunctions.forEach((fn) => { if (fn) fn(); });
    if (lobbyId) off(ref(db, `lobbies/${lobbyId}`));
  }
}

export const checkersMultiplayer = new CheckersMultiplayer();