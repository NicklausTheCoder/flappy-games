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
      await update(ref(db, `lobbies/${lobbyId}`), {
        status: 'ready'
      });
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
      const updates: any = {
        inGame: inGame,
        lastSeen: Date.now()
      };
      if (lobbyId) {
        updates.currentLobby = lobbyId;
      }
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
        lobbyId: lobbyId,
        awardedAt: new Date().toISOString()
      });

      console.log(`💰 Awarded $${prize} to ${uid} for checkers win`);

    } catch (error) {
      console.error('❌ Error awarding game prize:', error);
    }
  }
  async isPlayerOnlineAndInQueue(uid: string): Promise<boolean> {
    try {
      const onlineRef = ref(db, `online/${uid}`);
      const snapshot = await get(onlineRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const isOnline = data.online === true &&
          data.inQueue === true &&
          (Date.now() - data.lastSeen < 30000);
        return isOnline;
      }
      return false;
    } catch (error) {
      console.error('Error checking player online:', error);
      return false;
    }
  }

  async isPlayerOnline(uid: string): Promise<boolean> {
    try {
      const onlineRef = ref(db, `online/${uid}`);
      const snapshot = await get(onlineRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const isOnline = data.online === true && (Date.now() - data.lastSeen < 30000);
        return isOnline;
      }
      return false;
    } catch (error) {
      console.error('Error checking player online:', error);
      return false;
    }
  }

  async cleanupOfflinePlayers(): Promise<void> {
    try {
      const onlineRef = ref(db, 'online');
      const snapshot = await get(onlineRef);

      if (snapshot.exists()) {
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
      }
    } catch (error) {
      console.error('Error cleaning up offline players:', error);
    }
  }

  // =========== ATOMIC MATCHMAKING ===========

  /**
   * Start matchmaking service - runs continuously and uses atomic transactions
   */
  startMatchmakingService(): void {
    if (this.matchmakingListener) return;

    const lockRef = ref(db, 'matchmaking_lock/checkers');

    // Try to become the matchmaker
    runTransaction(lockRef, (current) => {
      const now = Date.now();
      // If no lock or lock is stale (>15s old), claim it
      if (!current || (now - current.claimedAt) > 15000) {
        return { claimedAt: now, claimedBy: Math.random().toString(36).slice(2) };
      }
      return undefined; // Someone else has the lock, abort
    }).then((result) => {
      if (!result.committed) {
        // Someone else is the matchmaker — just watch for our own match
        console.log('👀 Another client is matchmaking, just listening for matches');
        return;
      }

      console.log('🎯 This client is the matchmaker');
      const myLockValue = result.snapshot.val();

      // Renew the lock every 10s so it doesn't go stale
      const renewInterval = setInterval(async () => {
        if (!this.matchmakingListener) { clearInterval(renewInterval); return; }
        await update(lockRef, { claimedAt: Date.now() });
      }, 10000);

      const queueRef = ref(db, 'matchmaking/checkers');
      this.matchmakingListener = onValue(queueRef, async (snapshot) => {
        if (!snapshot.exists()) return;

        // Verify we still hold the lock before doing any matching
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
        const online = players.filter(p => p.uid && (now - (p.joinedAt || 0)) < 120000);
        if (online.length < 2) return;

        online.sort((a, b) => a.joinedAt - b.joinedAt);

        for (let i = 0; i + 1 < online.length; i += 2) {
          const p1 = online[i];
          const p2 = online[i + 1];
          if (p1.uid === p2.uid) continue;

          const claimed1 = await this.atomicClaimPlayer(ref(db, `matchmaking/checkers/${p1.uid}`));
          if (!claimed1) continue;

          const claimed2 = await this.atomicClaimPlayer(ref(db, `matchmaking/checkers/${p2.uid}`));
          if (!claimed2) {
            await set(ref(db, `matchmaking/checkers/${p1.uid}`), p1); // roll back
            continue;
          }

          console.log(`✅ Matched: ${p1.username} vs ${p2.username}`);
          try {
            await this.createLobby(p1.uid, p2.uid, p1, p2);
          } catch (err) {
            console.error('Failed to create lobby, re-queuing:', err);
            await set(ref(db, `matchmaking/checkers/${p1.uid}`), p1);
            await set(ref(db, `matchmaking/checkers/${p2.uid}`), p2);
          }
        }
      });
    }).catch(console.error);
  }

  /**
   * Atomically claim a player from the queue
   */
  private async atomicClaimPlayer(playerRef: any): Promise<boolean> {
    try {
      const result = await runTransaction(playerRef, (currentData) => {
        if (currentData === null) return undefined; // ABORT — already claimed
        return null; // Claim it
      });
      // committed=true AND snapshot is null means WE set it to null (we won the race)
      // committed=false means another client aborted us
      return result.committed && result.snapshot.val() === null;
    } catch (error) {
      console.error('Transaction failed:', error);
      return false;
    }
  }

  stopMatchmakingService(): void {
    if (this.matchmakingListener) {
      this.matchmakingListener();
      this.matchmakingListener = null;
    }
  }

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
    await this.setPlayerQueueStatus(uid, false);
  }

  private async cleanupPlayerLobbies(uid: string): Promise<void> {
    try {
      const lobbiesRef = ref(db, 'lobbies');
      const snapshot = await get(lobbiesRef);

      if (!snapshot.exists()) return;

      const lobbies = snapshot.val();

      for (const [lobbyId, lobbyData] of Object.entries(lobbies)) {
        const lobby = lobbyData as any;

        if (lobby.playerIds && lobby.playerIds.includes(uid)) {
          // Only clean up waiting or dead lobbies
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
      status: 'waiting', // Only 'waiting' lobbies can be joined
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
      console.log('📝 Attempting to create checkers lobby:', lobbyId);
      await set(ref(db, `lobbies/${lobbyId}`), lobby);
      console.log('✅ Lobby written to Firebase successfully');

      // Create match notifications for BOTH players
      await set(ref(db, `matches/${player1Uid}`), {
        lobbyId: lobbyId,
        gameId: 'checkers',
        timestamp: Date.now()
      });

      await set(ref(db, `matches/${player2Uid}`), {
        lobbyId: lobbyId,
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
      const lobbyRef = ref(db, `lobbies/${lobbyId}`);
      const snapshot = await get(lobbyRef);

      if (snapshot.exists()) {
        console.log('✅ Lobby found:', lobbyId);
        return snapshot.val() as CheckersLobby;
      } else {
        console.log('❌ Lobby not found in Firebase:', lobbyId);
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting lobby:', error);
      return null;
    }
  }

  subscribeToLobby(lobbyId: string, callback: (lobby: CheckersLobby | null) => void): () => void {
    if (!lobbyId) return () => { };

    const lobbyRef = ref(db, `lobbies/${lobbyId}`);

    const unsubscribe = onValue(lobbyRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as CheckersLobby);
      } else {
        callback(null);
      }
    });

    return unsubscribe;
  }

  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      isReady
    });

    const lobby = await this.getLobby(lobbyId);
    if (lobby && lobby.status === 'waiting') {
      const allReady = lobby.playerIds.every(id => lobby.players[id]?.isReady);

      if (allReady) {
        await this.startGame(lobbyId);
      }
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
    await set(ref(db, `displaced/${uid}`), {
      lobbyId: lobbyId,
      timestamp: Date.now()
    });
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
      console.log(`📝 Opponent ${opponentUid} marked as displaced`);
    }

    // Mark lobby as dead
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'dead'
    });

    await remove(ref(db, `gameStates/${lobbyId}`));

    const queueRef = ref(db, `matchmaking/checkers/${cancellerUid}`);
    const queueSnapshot = await get(queueRef);
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
    if (lobby) {
      await this.awardGamePrize(winnerUid, lobbyId, lobby);
    }

    setTimeout(async () => {
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60 * 1000);
  }

  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);

    if (lobby) {
      const otherPlayer = lobby.playerIds.find(id => id !== uid);

      if (otherPlayer && lobby.status === 'playing') {
        await this.endGame(lobbyId, otherPlayer);
      } else {
        // Mark as dead so other player gets refunded
        await update(ref(db, `lobbies/${lobbyId}`), {
          status: 'dead'
        });
      }
    }
  }

  cleanup(lobbyId: string, ...unsubscribeFunctions: (() => void)[]) {
    unsubscribeFunctions.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });

    if (lobbyId) {
      off(ref(db, `lobbies/${lobbyId}`));
    }
  }
}

export const checkersMultiplayer = new CheckersMultiplayer();