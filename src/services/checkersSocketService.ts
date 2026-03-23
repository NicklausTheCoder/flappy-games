// src/services/checkersSocketService.ts
import { io, Socket } from 'socket.io-client';

class CheckersSocketService {
  private socket: Socket | null = null;
  private gameId: string | null = null;
  private playerColor: 'red' | 'black' | null = null;
  
  // Event callbacks
  private onMoveCallback: ((move: any) => void) | null = null;
  private onGameStartCallback: ((data: any) => void) | null = null;
  private onGameEndCallback: ((data: any) => void) | null = null;
  private onPlayerDisconnectCallback: (() => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  /**
   * Connect to the game server
   */
  connect(serverUrl: string = import.meta.env.VITE_REACT_SERVER_URL || 'http://localhost:3000'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(serverUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
          console.log('✅ Connected to game server:', this.socket?.id);
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Connection error:', error);
          reject(error);
        });

        this.socket.on('disconnect', () => {
          console.log('🔌 Disconnected from server');
          if (this.onPlayerDisconnectCallback) {
            this.onPlayerDisconnectCallback();
          }
        });

        // Game event listeners
        this.socket.on('gameStarted', (data) => {
          console.log('🎮 Game started:', data);
          this.gameId = data.gameId;
          this.playerColor = data.color;
          if (this.onGameStartCallback) {
            this.onGameStartCallback(data);
          }
        });

        this.socket.on('moveMade', (data) => {
          console.log('♟️ Move received:', data);
          if (this.onMoveCallback) {
            this.onMoveCallback(data);
          }
        });

        this.socket.on('gameEnded', (data) => {
          console.log('🏁 Game ended:', data);
          if (this.onGameEndCallback) {
            this.onGameEndCallback(data);
          }
        });

        this.socket.on('error', (data) => {
          console.error('❌ Server error:', data);
          if (this.onErrorCallback) {
            this.onErrorCallback(data.message || 'Unknown error');
          }
        });

      } catch (error) {
        console.error('❌ Failed to connect:', error);
        reject(error);
      }
    });
  }

  /**
   * Join a game with matchmaking
   */
  joinMatchmaking(uid: string, username: string, displayName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('joinMatchmaking', {
        uid,
        username,
        displayName
      }, (response: any) => {
        if (response.success) {
          console.log('✅ Joined matchmaking:', response);
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Create a private game
   */
  createPrivateGame(uid: string, username: string, displayName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('createPrivateGame', {
        uid,
        username,
        displayName
      }, (response: any) => {
        if (response.success) {
          console.log('✅ Private game created:', response);
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Join a private game with code
   */
  joinPrivateGame(uid: string, username: string, displayName: string, gameCode: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('joinPrivateGame', {
        uid,
        username,
        displayName,
        gameCode
      }, (response: any) => {
        if (response.success) {
          console.log('✅ Joined private game:', response);
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Make a move
   */
  makeMove(gameId: string, move: {
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    piece: string;
    capturedPiece?: { row: number; col: number };
    promoted?: boolean;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('makeMove', {
        gameId,
        move,
        timestamp: Date.now()
      }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Resign from game
   */
  resign(gameId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('resign', { gameId }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Request draw
   */
  requestDraw(gameId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('requestDraw', { gameId }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Respond to draw request
   */
  respondToDraw(gameId: string, accept: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('respondToDraw', { gameId, accept }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  /**
   * Leave game
   */
  leaveGame(gameId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leaveGame', { gameId });
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.gameId = null;
    this.playerColor = null;
  }

  /**
   * Get current game ID
   */
  getGameId(): string | null {
    return this.gameId;
  }

  /**
   * Get player color
   */
  getPlayerColor(): 'red' | 'black' | null {
    return this.playerColor;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  // Event setters
  onMove(callback: (move: any) => void): void {
    this.onMoveCallback = callback;
  }

  onGameStart(callback: (data: any) => void): void {
    this.onGameStartCallback = callback;
  }

  onGameEnd(callback: (data: any) => void): void {
    this.onGameEndCallback = callback;
  }

  onPlayerDisconnect(callback: () => void): void {
    this.onPlayerDisconnectCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }
}

export const checkersSocketService = new CheckersSocketService();