// src/firebase/multiplayerQueries.ts
import { 
  ref, 
  get, 
  set,
  update,
  onValue,
  off,
  push,
  query,
  limitToLast,
  orderByChild,
  equalTo,
  remove
} from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished';
export type GameId = 'flappy-bird' | 'space-shooter' | 'ball-crush' | 'sky-shooter';

export interface Player {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  health: number;
  position: { x: number; y: number };
  isReady: boolean;
  score: number;
}

export interface Lobby {
  id: string;
  gameId: GameId;  // Changed from literal 'sky-shooter' to GameId type
  status: GameStatus;
  players: {
    [uid: string]: Player;
  };
  playerIds: string[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  winner?: string;
  maxPlayers: 2; // Always 2 for 1v1
}

export interface MatchmakingQueue {
  uid: string;
  username: string;
  joinedAt: number;
  gameId: GameId;  // Changed from literal 'sky-shooter' to GameId type
}

class MultiplayerService {
  
  // =========== MATCHMAKING ===========

  /**
   * Add player to matchmaking queue
   */
  async joinQueue(uid: string, username: string, gameId: GameId = 'sky-shooter'): Promise<void> {
    console.log(`🎮 ${username} joined ${gameId} matchmaking queue`);
    
    await set(ref(db, `matchmaking/${gameId}/${uid}`), {
      uid,
      username,
      joinedAt: Date.now(),
      gameId
    });
    
    // Try to find a match immediately
    await this.tryMatchmake(gameId);
  }

  /**
   * Remove player from queue
   */
  async leaveQueue(uid: string, gameId: GameId = 'sky-shooter'): Promise<void> {
    console.log(`🚪 Player ${uid} left ${gameId} queue`);
    await remove(ref(db, `matchmaking/${gameId}/${uid}`));
  }

  /**
   * Try to match players in queue
   */
  private async tryMatchmake(gameId: GameId): Promise<void> {
    const queueRef = ref(db, `matchmaking/${gameId}`);
    const snapshot = await get(queueRef);
    
    if (!snapshot.exists()) return;
    
    const queue = snapshot.val();
    const players = Object.values(queue) as MatchmakingQueue[];
    
    // Need at least 2 players
    if (players.length < 2) return;
    
    // Sort by join time (oldest first)
    players.sort((a, b) => a.joinedAt - b.joinedAt);
    
    // Take first 2 players
    const player1 = players[0];
    const player2 = players[1];
    
    console.log(`✅ Match found: ${player1.username} vs ${player2.username} in ${gameId}`);
    
    // Create lobby for these players
    await this.createLobby(player1.uid, player2.uid, gameId);
    
    // Remove them from queue
    await remove(ref(db, `matchmaking/${gameId}/${player1.uid}`));
    await remove(ref(db, `matchmaking/${gameId}/${player2.uid}`));
  }

  // =========== LOBBY MANAGEMENT ===========

  /**
   * Create a new lobby for two players
   */
  async createLobby(player1Uid: string, player2Uid: string, gameId: GameId): Promise<string> {
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Get player details
    const [player1Data, player2Data] = await Promise.all([
      this.getPlayerDetails(player1Uid),
      this.getPlayerDetails(player2Uid)
    ]);
    
    const lobby: Lobby = {
      id: lobbyId,
      gameId,
      status: 'waiting',
      players: {
        [player1Uid]: {
          uid: player1Uid,
          username: player1Data.username,
          displayName: player1Data.displayName,
          avatar: player1Data.avatar,
          health: 100,
          position: this.getStartPosition(gameId, 'player1'),
          isReady: false,
          score: 0
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username,
          displayName: player2Data.displayName,
          avatar: player2Data.avatar,
          health: 100,
          position: this.getStartPosition(gameId, 'player2'),
          isReady: false,
          score: 0
        }
      },
      playerIds: [player1Uid, player2Uid],
      createdAt: Date.now(),
      maxPlayers: 2
    };
    
    await set(ref(db, `lobbies/${lobbyId}`), lobby);
    console.log(`🏰 Lobby created: ${lobbyId} for ${gameId}`);
    
    return lobbyId;
  }

  /**
   * Get start positions based on game type
   */
  private getStartPosition(gameId: GameId, player: 'player1' | 'player2'): { x: number; y: number } {
    switch(gameId) {
      case 'ball-crush':
        // Ball Crush: top and bottom positions
        return player === 'player1' 
          ? { x: 180, y: 550 } // Bottom
          : { x: 180, y: 90 };  // Top
      case 'sky-shooter':
      case 'space-shooter':
        // Space shooter: left and right positions
        return player === 'player1'
          ? { x: 100, y: 300 }
          : { x: 260, y: 300 };
      default:
        // Default positions
        return player === 'player1'
          ? { x: 180, y: 500 }
          : { x: 180, y: 140 };
    }
  }

  /**
   * Get player details from database
   */
  private async getPlayerDetails(uid: string): Promise<{ username: string; displayName: string; avatar: string }> {
    try {
      const userRef = ref(db, `users/${uid}/public`);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        return {
          username: data.username || 'Unknown',
          displayName: data.displayName || 'Unknown',
          avatar: data.avatar || 'default'
        };
      }
    } catch (error) {
      console.error('Error getting player details:', error);
    }
    
    return {
      username: 'Unknown',
      displayName: 'Unknown',
      avatar: 'default'
    };
  }

  /**
   * Get lobby by ID
   */
  async getLobby(lobbyId: string): Promise<Lobby | null> {
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    const snapshot = await get(lobbyRef);
    
    if (snapshot.exists()) {
      return snapshot.val() as Lobby;
    }
    return null;
  }

  /**
   * Subscribe to lobby changes
   */
  subscribeToLobby(lobbyId: string, callback: (lobby: Lobby | null) => void): () => void {
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    
    const unsubscribe = onValue(lobbyRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as Lobby);
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
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      isReady
    });
    
    // Check if both players are ready
    const lobby = await this.getLobby(lobbyId);
    if (lobby) {
      const allReady = lobby.playerIds.every(id => lobby.players[id]?.isReady);
      
      if (allReady && lobby.status === 'waiting') {
        await this.startGame(lobbyId);
      }
    }
  }

  /**
   * Start the game
   */
  async startGame(lobbyId: string): Promise<void> {
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'playing',
      startedAt: Date.now()
    });
    
    console.log(`🎮 Game started in lobby: ${lobbyId}`);
  }

  // =========== GAME ACTIONS ===========

  /**
   * Update player position
   */
  async updatePosition(lobbyId: string, uid: string, x: number, y: number): Promise<void> {
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}/position`), {
      x, y
    });
  }

  /**
   * Player shoots (for shooters) or hits (for ball games)
   */
  async playerShot(lobbyId: string, shooterUid: string, targetUid: string, damage: number): Promise<void> {
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    const snapshot = await get(lobbyRef);
    
    if (!snapshot.exists()) return;
    
    const lobby = snapshot.val() as Lobby;
    const targetHealth = lobby.players[targetUid]?.health || 0;
    const newHealth = Math.max(0, targetHealth - damage);
    
    // Update target health
    await update(ref(db, `lobbies/${lobbyId}/players/${targetUid}`), {
      health: newHealth
    });
    
    // Record shot in game events
    await push(ref(db, `lobbies/${lobbyId}/events`), {
      type: 'shot',
      shooter: shooterUid,
      target: targetUid,
      damage,
      timestamp: Date.now()
    });
    
    // Check if target is dead
    if (newHealth <= 0) {
      await this.playerDied(lobbyId, targetUid, shooterUid);
    }
  }

  /**
   * Player died
   */
  async playerDied(lobbyId: string, deadUid: string, killerUid: string): Promise<void> {
    // Update killer's score
    await update(ref(db, `lobbies/${lobbyId}/players/${killerUid}/score`), {
      score: (await this.getPlayerScore(lobbyId, killerUid)) + 1
    });
    
    // Respawn player after 3 seconds
    setTimeout(async () => {
      await this.respawnPlayer(lobbyId, deadUid);
    }, 3000);
  }

  /**
   * Respawn player
   */
  async respawnPlayer(lobbyId: string, uid: string): Promise<void> {
    const lobby = await this.getLobby(lobbyId);
    if (!lobby) return;
    
    const position = this.getStartPosition(lobby.gameId, uid === lobby.playerIds[0] ? 'player1' : 'player2');
    
    await update(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      health: 100,
      position
    });
  }

  /**
   * Get player score
   */
  private async getPlayerScore(lobbyId: string, uid: string): Promise<number> {
    const scoreRef = ref(db, `lobbies/${lobbyId}/players/${uid}/score`);
    const snapshot = await get(scoreRef);
    return snapshot.exists() ? snapshot.val() : 0;
  }

  /**
   * End game
   */
  async endGame(lobbyId: string, winnerUid: string): Promise<void> {
    await update(ref(db, `lobbies/${lobbyId}`), {
      status: 'finished',
      finishedAt: Date.now(),
      winner: winnerUid
    });
    
    console.log(`🏆 Game finished, winner: ${winnerUid}`);
    
    // Clean up after 5 minutes
    setTimeout(async () => {
      await remove(ref(db, `lobbies/${lobbyId}`));
    }, 5 * 60 * 1000);
  }

  // =========== CLEANUP ===========

  /**
   * Player leaves game
   */
  async playerLeave(lobbyId: string, uid: string): Promise<void> {
    const lobby = await this.getLobby(lobbyId);
    
    if (lobby) {
      // Find the other player
      const otherPlayer = lobby.playerIds.find(id => id !== uid);
      
      if (otherPlayer) {
        // Other player wins by default
        await this.endGame(lobbyId, otherPlayer);
      } else {
        // Just delete the lobby if empty
        await remove(ref(db, `lobbies/${lobbyId}`));
      }
    }
  }
}

export const multiplayer = new MultiplayerService();