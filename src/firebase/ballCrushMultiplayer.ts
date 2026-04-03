// src/firebase/ballCrushMultiplayer.ts
import {
  ref,
  get,
  set,
  update,
  onValue,
  off,
  remove,
  runTransaction
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
    
    const queueRef = ref(db, 'matchmaking/ball-crush');
    this.matchmakingListener = onValue(queueRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      
      const queue = snapshot.val();
      const players = Object.values(queue) as any[];
      
      if (players.length < 2) return;
      
      // Get online players who are in queue
      const onlinePlayers = [];
      for (const player of players) {
        const isOnline = await this.isPlayerOnlineAndInQueue(player.uid);
        if (isOnline) onlinePlayers.push(player);
      }
      
      if (onlinePlayers.length < 2) return;
      
      // Sort by join time (oldest first)
      onlinePlayers.sort((a, b) => a.joinedAt - b.joinedAt);
      
      // Use atomic transaction to claim the first player
      const player1 = onlinePlayers[0];
      const player2 = onlinePlayers[1];
      
      if (player1.uid === player2.uid) {
        await remove(ref(db, `matchmaking/ball-crush/${player1.uid}`));
        return;
      }
      
      // ATOMIC: Try to claim player1 using transaction
      const player1Ref = ref(db, `matchmaking/ball-crush/${player1.uid}`);
      const claimed = await this.atomicClaimPlayer(player1Ref);
      
      if (!claimed) {
        console.log(`⚠️ Could not claim player ${player1.username}, already matched`);
        return;
      }
      
      // Try to claim player2 atomically
      const player2Ref = ref(db, `matchmaking/ball-crush/${player2.uid}`);
      const claimed2 = await this.atomicClaimPlayer(player2Ref);
      
      if (!claimed2) {
        // Put player1 back if we can't claim player2
        await set(player1Ref, player1);
        console.log(`⚠️ Could not claim player ${player2.username}, rolling back`);
        return;
      }
      
      console.log(`✅ Match found (atomic): ${player1.username} vs ${player2.username}`);
      
      // Create lobby for these players
      await this.createLobby(player1.uid, player2.uid, player1, player2);
    });
  }

  /**
   * Atomically claim a player from the queue
   */
  private async atomicClaimPlayer(playerRef: any): Promise<boolean> {
    try {
      const result = await runTransaction(playerRef, (currentData) => {
        if (currentData === null) {
          return currentData; // Already taken
        }
        return null; // Remove it - we claim it
      });
      return result.committed;
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

    console.log(`🎮 ${username} (${uid}) joined ball-crush matchmaking queue`);

    await this.cleanupPlayerLobbies(uid);
    await this.setPlayerOnline(uid, true);
    await this.setPlayerQueueStatus(uid, true);

    const queueData = {
      uid,
      username,
      displayName: displayName || username,
      avatar: avatar || 'default',
      joinedAt: Date.now(),
      gameId: 'ball-crush'
    };

    await set(ref(db, `matchmaking/ball-crush/${uid}`), queueData);
    await this.cleanupOfflinePlayers();
  }

  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 Player ${uid} left ball-crush queue`);

    await remove(ref(db, `matchmaking/ball-crush/${uid}`));
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
    const lobbyId = `ballcrush_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const lobby: BallCrushLobby = {
      id: lobbyId,
      gameId: 'ball-crush',
      status: 'waiting', // Only 'waiting' lobbies can be joined
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
    
    try {
      console.log('📝 Attempting to create lobby:', lobbyId);
      await set(ref(db, `lobbies/${lobbyId}`), lobby);
      console.log('✅ Lobby written to Firebase successfully');
      
      // Create match notifications for BOTH players
      await set(ref(db, `matches/${player1Uid}`), {
        lobbyId: lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now()
      });
      
      await set(ref(db, `matches/${player2Uid}`), {
        lobbyId: lobbyId,
        gameId: 'ball-crush',
        timestamp: Date.now()
      });
      
      console.log(`🏰 Ball Crush lobby created: ${lobbyId}`);
      return lobbyId;
    } catch (error) {
      console.error('❌ Failed to create lobby:', error);
      throw error;
    }
  }

  async getLobby(lobbyId: string): Promise<BallCrushLobby | null> {
    if (!lobbyId) {
      console.error('❌ getLobby called with no lobbyId');
      return null;
    }

    try {
      const lobbyRef = ref(db, `lobbies/${lobbyId}`);
      const snapshot = await get(lobbyRef);

      if (snapshot.exists()) {
        console.log('✅ Lobby found:', lobbyId);
        return snapshot.val() as BallCrushLobby;
      } else {
        console.log('❌ Lobby not found in Firebase:', lobbyId);
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting lobby:', error);
      return null;
    }
  }

  subscribeToLobby(lobbyId: string, callback: (lobby: BallCrushLobby | null) => void): () => void {
    if (!lobbyId) return () => { };

    const lobbyRef = ref(db, `lobbies/${lobbyId}`);

    const unsubscribe = onValue(lobbyRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as BallCrushLobby);
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

    console.log(`🎮 Ball Crush game started in lobby: ${lobbyId}`);
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
    
    const queueRef = ref(db, `matchmaking/ball-crush/${cancellerUid}`);
    const queueSnapshot = await get(queueRef);
    if (queueSnapshot.exists()) {
      await this.leaveQueue(cancellerUid);
    }
  }

  // =========== GAME ACTIONS ===========

  async updatePosition(lobbyId: string, uid: string, x: number): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}/position`), {
      x
    });
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

    const unsubscribe = onValue(ballRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      }
    });

    return unsubscribe;
  }

  async playerScored(lobbyId: string, scorerUid: string, opponentUid: string): Promise<void> {
    if (!lobbyId || !scorerUid || !opponentUid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const opponentHealth = lobby.players[opponentUid]?.health || 5;
    const newHealth = Math.max(0, opponentHealth - 1);

    await update(ref(db, `lobbies/${lobbyId}/players/${opponentUid}`), {
      health: newHealth
    });

    const scorerScore = lobby.players[scorerUid]?.score || 0;
    await update(ref(db, `lobbies/${lobbyId}/players/${scorerUid}`), {
      score: scorerScore + 1
    });

    if (newHealth <= 0) {
      await this.endGame(lobbyId, scorerUid);
    }
  }

  async resetBall(lobbyId: string, serverDirection: 'up' | 'down'): Promise<void> {
    if (!lobbyId) return;

    const ballData = {
      x: 180,
      y: 320,
      speed: 200,
      direction: serverDirection === 'up'
        ? { x: (Math.random() * 0.8) - 0.4, y: -0.8 }
        : { x: (Math.random() * 0.8) - 0.4, y: 0.8 },
      lastUpdate: Date.now()
    };

    await set(ref(db, `gameStates/${lobbyId}/ball`), ballData);
  }

  // =========== GAME END ===========

  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });

    console.log(`🏆 Ball Crush game finished, winner: ${winnerUid}`);

    setTimeout(async () => {
      await remove(ref(db, `gameStates/${lobbyId}`));
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
      off(ref(db, `gameStates/${lobbyId}/ball`));
    }
  }
}

export const ballCrushMultiplayer = new BallCrushMultiplayer();