// src/firebase/checkersMultiplayer.ts
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

export type CheckersGameStatus = 'waiting' | 'playing' | 'finished';

export interface CheckersPlayerData {
  uid: string;
  username: string;
  color: 'red' | 'black';
  joinedAt: number;
  online: boolean;
  lastSeen: number;
}

export interface CheckersMove {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  timestamp: number;
  byUid: string;
}

export interface CheckersGameState {
  id: string;
  status: CheckersGameStatus;
  board: (string | null)[][];
  currentTurn: 'red' | 'black';
  players: {
    red: CheckersPlayerData | null;
    black: CheckersPlayerData | null;
  };
  lastMove: CheckersMove | null;
  winner: 'red' | 'black' | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

class CheckersMultiplayer {

  // ─── Presence ────────────────────────────────────────────────────────────────

  async setOnline(uid: string, gameId: string): Promise<void> {
    await update(ref(db, `checkersGames/${gameId}/players`), {}).catch(() => {});
    // heartbeat written directly on the player slot
  }

  async heartbeat(uid: string, gameId: string, color: 'red' | 'black'): Promise<void> {
    try {
      await update(ref(db, `checkersGames/${gameId}/players/${color}`), {
        online: true,
        lastSeen: Date.now()
      });
    } catch (e) {
      console.error('Heartbeat error', e);
    }
  }

  async setOffline(uid: string, gameId: string, color: 'red' | 'black'): Promise<void> {
    try {
      await update(ref(db, `checkersGames/${gameId}/players/${color}`), {
        online: false,
        lastSeen: Date.now()
      });
    } catch (e) {
      console.error('setOffline error', e);
    }
  }

  // ─── Game creation / joining ──────────────────────────────────────────────

  /**
   * Find an open game waiting for a second player, or create a new one.
   * Returns { gameId, color } telling the caller who they are.
   */
  async findOrCreateGame(uid: string, username: string): Promise<{ gameId: string; color: 'red' | 'black' }> {
    const gamesRef = ref(db, 'checkersGames');
    const snapshot = await get(gamesRef);

    if (snapshot.exists()) {
      const games = snapshot.val() as Record<string, CheckersGameState>;
      // Look for a waiting game with no black player
      for (const [gameId, game] of Object.entries(games)) {
        if (
          game.status === 'waiting' &&
          game.players.red !== null &&
          game.players.black === null &&
          game.players.red.uid !== uid // don't join your own waiting game
        ) {
          // Join as black
          const blackPlayer: CheckersPlayerData = {
            uid,
            username,
            color: 'black',
            joinedAt: Date.now(),
            online: true,
            lastSeen: Date.now()
          };

          await update(ref(db, `checkersGames/${gameId}`), {
            'players/black': blackPlayer,
            status: 'playing',
            startedAt: Date.now()
          });

          console.log(`✅ ${username} joined game ${gameId} as BLACK`);
          return { gameId, color: 'black' };
        }
      }
    }

    // No open game found — create one as red
    const gameId = `checkers_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const initialBoard = this.createInitialBoard();

    const redPlayer: CheckersPlayerData = {
      uid,
      username,
      color: 'red',
      joinedAt: Date.now(),
      online: true,
      lastSeen: Date.now()
    };

    const newGame: CheckersGameState = {
      id: gameId,
      status: 'waiting',
      board: initialBoard,
      currentTurn: 'red',
      players: {
        red: redPlayer,
        black: null
      },
      lastMove: null,
      winner: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null
    };

    await set(ref(db, `checkersGames/${gameId}`), newGame);
    console.log(`✅ ${username} created game ${gameId} as RED`);
    return { gameId, color: 'red' };
  }

  // ─── Board helpers ────────────────────────────────────────────────────────

  createInitialBoard(): (string | null)[][] {
    const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) board[row][col] = 'black';
      }
    }
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) board[row][col] = 'red';
      }
    }
    return board;
  }

  // ─── Move submission ──────────────────────────────────────────────────────

  async submitMove(
    gameId: string,
    uid: string,
    board: (string | null)[][],
    nextTurn: 'red' | 'black',
    move: Omit<CheckersMove, 'timestamp' | 'byUid'>,
    winner: 'red' | 'black' | null
  ): Promise<void> {
    const fullMove: CheckersMove = { ...move, timestamp: Date.now(), byUid: uid };

    const updates: Partial<CheckersGameState> = {
      board,
      currentTurn: nextTurn,
      lastMove: fullMove,
      winner,
      status: winner ? 'finished' : 'playing',
      finishedAt: winner ? Date.now() : null
    };

    await update(ref(db, `checkersGames/${gameId}`), updates);

    if (winner) {
      // Save to history
      const result = {
        gameId,
        winner,
        timestamp: Date.now()
      };
      await push(ref(db, 'gameHistory/checkers'), result);

      // Clean up after 5 minutes
      setTimeout(async () => {
        await remove(ref(db, `checkersGames/${gameId}`));
      }, 5 * 60 * 1000);
    }
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  subscribeToGame(gameId: string, callback: (state: CheckersGameState | null) => void): () => void {
    const gameRef = ref(db, `checkersGames/${gameId}`);
    onValue(gameRef, (snapshot) => {
      callback(snapshot.exists() ? (snapshot.val() as CheckersGameState) : null);
    });
    return () => off(gameRef);
  }

  // ─── Forfeit / leave ──────────────────────────────────────────────────────

  async forfeit(gameId: string, loserColor: 'red' | 'black'): Promise<void> {
    const winner: 'red' | 'black' = loserColor === 'red' ? 'black' : 'red';
    await update(ref(db, `checkersGames/${gameId}`), {
      status: 'finished',
      winner,
      finishedAt: Date.now()
    });
  }

  cleanup(gameId: string) {
    off(ref(db, `checkersGames/${gameId}`));
  }
}

export const checkersMultiplayer = new CheckersMultiplayer();