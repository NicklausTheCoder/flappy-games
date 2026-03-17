// src/firebase/ballCrushMultiplayer.ts
import {
  ref,
  get,
  set,
  update,
  onValue,
  off,
  remove
} from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished';

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

  // =========== MATCHMAKING ===========
  // Add to ballCrushMultiplayer.ts

  /**
   * Set player online status
   */
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

  /**
   * Update player queue status
   */
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

  /**
   * Update player game status
   */
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

  /**
   * Check if player is online
   */
  async isPlayerOnline(uid: string): Promise<boolean> {
    try {
      const onlineRef = ref(db, `online/${uid}`);
      const snapshot = await get(onlineRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        // Consider online if seen in last 30 seconds
        const isOnline = data.online && (Date.now() - data.lastSeen < 30000);
        return isOnline;
      }
      return false;
    } catch (error) {
      console.error('Error checking player online:', error);
      return false;
    }
  }

  /**
   * Clean up old online statuses
   */
  async cleanupOfflinePlayers(): Promise<void> {
    try {
      const onlineRef = ref(db, 'online');
      const snapshot = await get(onlineRef);

      if (snapshot.exists()) {
        const now = Date.now();
        const updates: any = {};

        snapshot.forEach((child) => {
          const data = child.val();
          if (now - data.lastSeen > 60000) { // Offline for more than 1 minute
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
  /**
   * Join Ball Crush matchmaking queue
   */
  async joinQueue(uid: string, username: string, displayName: string, avatar: string = 'default'): Promise<void> {
    // Guard against undefined uid
    if (!uid) {
      console.error('❌ Cannot join queue: uid is undefined');
      return;
    }

    console.log(`🎮 ${username} (${uid}) joined ball-crush matchmaking queue`);

    // Set online and queue status
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

    // Clean up old offline players
    await this.cleanupOfflinePlayers();

    // Try to find a match immediately
    await this.findMatch();
  }

  /**
   * Leave matchmaking queue
   */
  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 Player ${uid} left ball-crush queue`);

    await remove(ref(db, `matchmaking/ball-crush/${uid}`));
    await this.setPlayerQueueStatus(uid, false);
  }

  /**
   * Find a match for waiting players
   */
  private async findMatch(): Promise<void> {
    const queueRef = ref(db, 'matchmaking/ball-crush');
    const snapshot = await get(queueRef);

    if (!snapshot.exists()) return;

    const queue = snapshot.val();
    const players = Object.values(queue) as any[];

    // Filter out offline players
    const onlinePlayers = [];
    for (const player of players) {
      const isOnline = await this.isPlayerOnline(player.uid);
      if (isOnline) {
        onlinePlayers.push(player);
      } else {
        // Remove offline players from queue
        console.log(`🗑️ Removing offline player ${player.username} from queue`);
        await remove(ref(db, `matchmaking/ball-crush/${player.uid}`));
      }
    }

    if (onlinePlayers.length < 2) return;

    // Sort by join time (oldest first)
    onlinePlayers.sort((a, b) => a.joinedAt - b.joinedAt);

    // Take first 2 players
    const player1 = onlinePlayers[0];
    const player2 = onlinePlayers[1];

    console.log(`✅ Match found: ${player1.username} vs ${player2.username} in ball-crush`);

    // Create lobby for these players
    await this.createLobby(player1.uid, player2.uid, player1, player2);

    // Remove them from queue
    await remove(ref(db, `matchmaking/ball-crush/${player1.uid}`));
    await remove(ref(db, `matchmaking/ball-crush/${player2.uid}`));
  }

  // =========== LOBBY MANAGEMENT ===========

  /**
   * Create a new lobby for two players
   */
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
  
  try {
    console.log('📝 Attempting to create lobby:', lobbyId);
    await set(ref(db, `lobbies/${lobbyId}`), lobby);
    console.log('✅ Lobby written to Firebase successfully');
    
    // Verify it was written
    const verifyRef = ref(db, `lobbies/${lobbyId}`);
    const verifySnapshot = await get(verifyRef);
    if (verifySnapshot.exists()) {
      console.log('✅ Lobby verified in Firebase');
    } else {
      console.error('❌ Lobby not found after write!');
    }
    
    // Create match notifications for BOTH players
    await set(ref(db, `matches/${player1Uid}`), {
      lobbyId: lobbyId,
      timestamp: Date.now()
    });
    
    await set(ref(db, `matches/${player2Uid}`), {
      lobbyId: lobbyId,
      timestamp: Date.now()
    });
    
    // IMPORTANT: The creator (player1) should automatically go to lobby
    // This happens via the match notification listener in MatchmakingScene
    
    console.log(`🏰 Ball Crush lobby created: ${lobbyId}`);
    
    return lobbyId;
  } catch (error) {
    console.error('❌ Failed to create lobby:', error);
    throw error;
  }
}
  /**
   * Get lobby by ID
   */
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

  /**
   * Subscribe to lobby changes
   */
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

  /**
   * Set player ready status
   */
  async setPlayerReady(lobbyId: string, uid: string, isReady: boolean): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      isReady
    });

    // Check if both players are ready
    const lobby = await this.getLobby(lobbyId);
    if (lobby && lobby.status === 'waiting') {
      const allReady = lobby.playerIds.every(id => lobby.players[id]?.isReady);

      if (allReady) {
        await this.startGame(lobbyId);
      }
    }
  }

  /**
   * Start the game
   */
  async startGame(lobbyId: string): Promise<void> {
    if (!lobbyId) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now()
    });

    console.log(`🎮 Ball Crush game started in lobby: ${lobbyId}`);
  }

  // =========== GAME ACTIONS ===========

  /**
   * Update player position
   */
  async updatePosition(lobbyId: string, uid: string, x: number): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}/position`), {
      x
    });
  }

  /**
   * Update ball position
   */
  /**
   * Update ball position
   */
  async updateBallPosition(
    lobbyId: string,
    ballData: {
      x: number;
      y: number;
      speed: number;
      directionX: number;
      directionY: number;
      timestamp?: number;  // Add this optional timestamp
    }
  ): Promise<void> {
    if (!lobbyId) return;

    await set(ref(db, `gameStates/${lobbyId}/ball`), {
      x: ballData.x,
      y: ballData.y,
      speed: ballData.speed,
      direction: { x: ballData.directionX, y: ballData.directionY },
      timestamp: ballData.timestamp || Date.now(), // Use provided timestamp or current time
      lastUpdate: Date.now()
    });
  }
  /**
   * Subscribe to ball updates
   */
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

  /**
   * Player scored
   */
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

  /**
   * Reset ball after score
   */
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

  /**
   * End game
   */
  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });

    console.log(`🏆 Ball Crush game finished, winner: ${winnerUid}`);

    // Clean up after 5 minutes
    setTimeout(async () => {
      await remove(ref(db, `gameStates/${lobbyId}`));
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60 * 1000);
  }

  /**
   * Player leaves game
   */
  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);

    if (lobby) {
      const otherPlayer = lobby.playerIds.find(id => id !== uid);

      if (otherPlayer && lobby.status === 'playing') {
        await this.endGame(lobbyId, otherPlayer);
      } else {
        await remove(ref(db, `lobbies/${lobbyId}`));
        await remove(ref(db, `gameStates/${lobbyId}`));
      }
    }
  }

  /**
   * Clean up listeners
   */
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