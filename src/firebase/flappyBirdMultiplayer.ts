// src/firebase/flappyBirdMultiplayer.ts
import {
  ref,
  get,
  set,
  update,
  onValue,
  off,
  remove,
  push
} from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished';

export interface FlappyBirdPlayer {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  score: number;
  alive: boolean;
  position: { x: number; y: number };
  isReady: boolean;
}

export interface FlappyBirdLobby {
  id: string;
  gameId: 'flappy-bird';
  status: GameStatus;
  players: {
    [uid: string]: FlappyBirdPlayer;
  };
  playerIds: string[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  winner?: string;
  maxPlayers: 2;
  gameSpeed?: number;
  obstacles?: any[];
}

class FlappyBirdMultiplayer {

  // =========== MATCHMAKING ===========

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
   * Join Flappy Bird matchmaking queue
   */
  async joinQueue(uid: string, username: string, displayName: string, avatar: string = 'default'): Promise<void> {
    if (!uid) {
      console.error('❌ Cannot join queue: uid is undefined');
      return;
    }

    console.log(`🎮 ${username} (${uid}) joined flappy-bird matchmaking queue`);

    await this.setPlayerOnline(uid, true);
    await this.setPlayerQueueStatus(uid, true);

    const queueData = {
      uid,
      username,
      displayName: displayName || username,
      avatar: avatar || 'default',
      joinedAt: Date.now(),
      gameId: 'flappy-bird'
    };

    await set(ref(db, `matchmaking/flappy-bird/${uid}`), queueData);
    await this.cleanupOfflinePlayers();
    await this.findMatch();
  }

  /**
   * Leave matchmaking queue
   */
  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 Player ${uid} left flappy-bird queue`);

    await remove(ref(db, `matchmaking/flappy-bird/${uid}`));
    await this.setPlayerQueueStatus(uid, false);
  }

  /**
   * Find a match for waiting players
   */
  private async findMatch(): Promise<void> {
    const queueRef = ref(db, 'matchmaking/flappy-bird');
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
        console.log(`🗑️ Removing offline player ${player.username} from queue`);
        await remove(ref(db, `matchmaking/flappy-bird/${player.uid}`));
      }
    }

    if (onlinePlayers.length < 2) return;

    // Sort by join time (oldest first)
    onlinePlayers.sort((a, b) => a.joinedAt - b.joinedAt);

    // Take first 2 players
    const player1 = onlinePlayers[0];
    const player2 = onlinePlayers[1];

    console.log(`✅ Match found: ${player1.username} vs ${player2.username} in flappy-bird`);

    // Create lobby for these players
    await this.createLobby(player1.uid, player2.uid, player1, player2);

    // Remove them from queue
    await remove(ref(db, `matchmaking/flappy-bird/${player1.uid}`));
    await remove(ref(db, `matchmaking/flappy-bird/${player2.uid}`));
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
    const lobbyId = `flappy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const lobby: FlappyBirdLobby = {
      id: lobbyId,
      gameId: 'flappy-bird',
      status: 'waiting',
      players: {
        [player1Uid]: {
          uid: player1Uid,
          username: player1Data.username || 'Player 1',
          displayName: player1Data.displayName || player1Data.username || 'Player 1',
          avatar: player1Data.avatar || 'default',
          score: 0,
          alive: true,
          position: { x: 100, y: 300 }, // Starting position
          isReady: false
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username || 'Player 2',
          displayName: player2Data.displayName || player2Data.username || 'Player 2',
          avatar: player2Data.avatar || 'default',
          score: 0,
          alive: true,
          position: { x: 260, y: 300 }, // Starting position (right side)
          isReady: false
        }
      },
      playerIds: [player1Uid, player2Uid],
      createdAt: Date.now(),
      maxPlayers: 2,
      gameSpeed: 200,
      obstacles: []
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

      console.log(`🏰 Flappy Bird lobby created: ${lobbyId}`);

      return lobbyId;
    } catch (error) {
      console.error('❌ Failed to create lobby:', error);
      throw error;
    }
  }

  /**
   * Get lobby by ID
   */
  async getLobby(lobbyId: string): Promise<FlappyBirdLobby | null> {
    if (!lobbyId) {
      console.error('❌ getLobby called with no lobbyId');
      return null;
    }

    try {
      const lobbyRef = ref(db, `lobbies/${lobbyId}`);
      const snapshot = await get(lobbyRef);

      if (snapshot.exists()) {
        console.log('✅ Lobby found:', lobbyId);
        return snapshot.val() as FlappyBirdLobby;
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
  subscribeToLobby(lobbyId: string, callback: (lobby: FlappyBirdLobby | null) => void): () => void {
    if (!lobbyId) return () => { };

    const lobbyRef = ref(db, `lobbies/${lobbyId}`);

    const unsubscribe = onValue(lobbyRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as FlappyBirdLobby);
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

    // Initialize obstacles
    const initialObstacles = this.generateObstacles();

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now(),
      obstacles: initialObstacles
    });

    console.log(`🎮 Flappy Bird game started in lobby: ${lobbyId}`);
  }

  /**
   * Generate initial obstacles
   */
  private generateObstacles(): any[] {
    const obstacles = [];
    for (let i = 0; i < 5; i++) {
      obstacles.push({
        x: 400 + i * 300,
        gapY: 200 + Math.random() * 200,
        gapSize: 150,
        passed: false
      });
    }
    return obstacles;
  }

  // =========== GAME ACTIONS ===========

  /**
   * Update player position
   */
  async updatePlayerPosition(lobbyId: string, uid: string, y: number): Promise<void> {
    if (!lobbyId || !uid) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}/position`), {
      y
    });
  }

  /**
   * Player scored (passed an obstacle)
   */
  async playerScored(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const currentScore = lobby.players[uid]?.score || 0;
    const newScore = currentScore + 1;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      score: newScore
    });

    // Update obstacles to mark as passed
    // This would need more sophisticated logic in a real implementation
  }

  /**
   * Player died
   */
  async playerDied(lobbyId: string, uid: string): Promise<void> {
    if (!lobbyId || !uid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      alive: false
    });

    // Check if game should end
    const otherPlayer = lobby.playerIds.find(id => id !== uid);
    if (otherPlayer && lobby.players[otherPlayer]?.alive) {
      // Other player is still alive, they win
      await this.endGame(lobbyId, otherPlayer);
    } else {
      // Both dead or only one player left
      await this.endGame(lobbyId, uid); // Last one standing? Actually both dead
    }
  }

  /**
   * Update obstacles (called by host/authoritative server)
   */
  async updateObstacles(lobbyId: string, obstacles: any[]): Promise<void> {
    if (!lobbyId) return;

    await update(ref(db, `lobbies/${lobbyId}`), {
      obstacles
    });
  }

  // =========== GAME END ===========

  /**
   * End game
   */
  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    if (!lobbyId || !winnerUid) return;

    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;

    const winnerScore = lobby.players[winnerUid]?.score || 0;

    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });

    console.log(`🏆 Flappy Bird game finished, winner: ${winnerUid} with score: ${winnerScore}`);

    // Save game result to history
    const gameResult = {
      lobbyId,
      winner: winnerUid,
      winnerScore,
      players: lobby.players,
      timestamp: Date.now()
    };

    await push(ref(db, 'gameHistory/flappy-bird'), gameResult);

    // Clean up after 5 minutes
    setTimeout(async () => {
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
      off(ref(db, `lobbies/${lobbyId}`));
    }
  }
}

export const flappyBirdMultiplayer = new FlappyBirdMultiplayer();