// src/firebase/checkersMultiplayer.ts
import { ref, get, set, update, onValue, off, remove } from 'firebase/database';
import { db } from './init';

export type GameStatus = 'waiting' | 'ready' | 'playing' | 'finished';

export interface CheckersPlayer {
  uid: string;
  username: string;
  displayName: string;
  avatar: string;
  isReady: boolean;
  position: { x: number; y: number };
  color?: 'red' | 'black'; // Add this for Checkers
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
// In checkersMultiplayer.ts, update isPlayerOnline:

async isPlayerOnline(uid: string): Promise<boolean> {
    try {
        const onlineRef = ref(db, `online/${uid}`);
        const snapshot = await get(onlineRef);

        if (snapshot.exists()) {
            const data = snapshot.val();
            // Increase timeout to 60 seconds (60000 ms)
            const isOnline = data.online && (Date.now() - data.lastSeen < 60000);
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
                // Increase to 2 minutes (120000 ms) for cleanup
                if (now - data.lastSeen > 120000) { 
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
   * Join Checkers matchmaking queue
   */
// In checkersMultiplayer.ts, update the joinQueue method:

async joinQueue(uid: string, username: string, displayName: string, avatar: string = 'default'): Promise<void> {
    // Guard against undefined uid
    if (!uid) {
        console.error('❌ Cannot join queue: uid is undefined');
        return;
    }

    console.log(`🎮 ${username} (${uid}) joined checkers matchmaking queue`);

    // IMPORTANT: Clean up any existing lobbies for this player
    await this.cleanupPlayerLobbies(uid);

    // Set online and queue status
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

    // Clean up old offline players
    await this.cleanupOfflinePlayers();

    // Try to find a match immediately
    await this.findMatch();
}

/**
 * Clean up any existing lobbies for this player
 */
private async cleanupPlayerLobbies(uid: string): Promise<void> {
    try {
        const lobbiesRef = ref(db, 'lobbies');
        const snapshot = await get(lobbiesRef);
        
        if (!snapshot.exists()) return;
        
        const lobbies = snapshot.val();
        const now = Date.now();
        
        for (const [lobbyId, lobbyData] of Object.entries(lobbies)) {
            const lobby = lobbyData as any;
            
            // Check if this lobby contains the player
            if (lobby.playerIds && lobby.playerIds.includes(uid)) {
                // If lobby is waiting and only has this player, delete it
                if (lobby.status === 'waiting' && lobby.playerIds.length === 1) {
                    console.log(`🗑️ Cleaning up old lobby for player: ${lobbyId}`);
                    await remove(ref(db, `lobbies/${lobbyId}`));
                }
                // Also remove any match notifications for this player
                await remove(ref(db, `matches/${uid}`));
            }
        }
    } catch (error) {
        console.error('Error cleaning up player lobbies:', error);
    }
}
  /**
   * Leave matchmaking queue
   */
  async leaveQueue(uid: string): Promise<void> {
    if (!uid) return;
    console.log(`🚪 Player ${uid} left checkers queue`);

    await remove(ref(db, `matchmaking/checkers/${uid}`));
    await this.setPlayerQueueStatus(uid, false);
  }

  /**
   * Find a match for waiting players
   */
private async findMatch(): Promise<void> {
    const queueRef = ref(db, 'matchmaking/checkers');
    const snapshot = await get(queueRef);

    if (!snapshot.exists()) return;

    const queue = snapshot.val();
    const players = Object.values(queue) as any[];

    // Add a small delay to ensure players are properly registered
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Filter out offline players - but be more lenient
    const onlinePlayers = [];
    for (const player of players) {
        const isOnline = await this.isPlayerOnline(player.uid);
        // Log the status for debugging
        console.log(`📊 Player ${player.username} online status:`, isOnline);
        
        if (isOnline) {
            onlinePlayers.push(player);
        } else {
            // Don't remove immediately - just log
            console.log(`⚠️ Player ${player.username} appears offline, but keeping in queue`);
            onlinePlayers.push(player); // Keep them anyway for now
        }
    }

    if (onlinePlayers.length < 2) return;

    // Sort by join time
    onlinePlayers.sort((a, b) => a.joinedAt - b.joinedAt);

    // Take first 2 players
    const player1 = onlinePlayers[0];
    const player2 = onlinePlayers[1];

    if (player1.uid === player2.uid) {
        console.log('⚠️ Same player found twice, skipping');
        return;
    }

    console.log(`✅ Match found: ${player1.username} vs ${player2.username}`);
    await this.createLobby(player1.uid, player2.uid, player1, player2);
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
          position: { x: 100, y: 550 }, // Player 1 at bottom
          color: 'red' // Player 1 is red
        },
        [player2Uid]: {
          uid: player2Uid,
          username: player2Data.username || 'Player 2',
          displayName: player2Data.displayName || player2Data.username || 'Player 2',
          avatar: player2Data.avatar || 'default',
          isReady: false,
          position: { x: 260, y: 50 }, // Player 2 at top
          color: 'black' // Player 2 is black
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

  /**
   * Get lobby by ID
   */
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

  /**
   * Subscribe to lobby changes
   */
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

    console.log(`🎮 Checkers game started in lobby: ${lobbyId}`);
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

    console.log(`🏆 Checkers game finished, winner: ${winnerUid}`);

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

export const checkersMultiplayer = new CheckersMultiplayer();