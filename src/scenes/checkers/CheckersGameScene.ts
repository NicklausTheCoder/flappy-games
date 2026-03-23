// // src/scenes/checkers/CheckersOnlineGameScene.ts
// import Phaser from 'phaser';
// import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
// import { ref, onValue, off, update } from 'firebase/database';
// import { db } from '../../firebase/init';

// interface CheckersPlayer {
//   uid: string;
//   username: string;
//   displayName: string;
//   avatar: string;
//   isReady: boolean;
//   color?: 'red' | 'black';
// }

// interface GameMove {
//   fromRow: number;
//   fromCol: number;
//   toRow: number;
//   toCol: number;
//   capturedPiece?: { row: number; col: number };
//   piece: string;
//   timestamp: number;
//   playerUid: string;
// }

// export class CheckersOnlineGameScene extends Phaser.Scene {
//   // Player info
//   private uid: string = '';
//   private username: string = '';
//   private lobbyId: string = '';
//   private myColor: 'red' | 'black' = 'red';
//   private opponent: CheckersPlayer | null = null;
  
//   // Game state
//   private board: (string | null)[][] = [];
//   private currentPlayer: 'red' | 'black' = 'red';
//   private myTurn: boolean = false;
//   private gameActive: boolean = true;
  
//   // Visual elements
//   private squares: Phaser.GameObjects.Rectangle[][] = [];
//   private pieces: (Phaser.GameObjects.Image | null)[][] = [];
//   private selectedPiece: { row: number; col: number } | null = null;
//   private validMoves: { row: number; col: number }[] = [];
  
//   // UI Elements
//   private turnText!: Phaser.GameObjects.Text;
//   private opponentNameText!: Phaser.GameObjects.Text;
//   private readyButton!: Phaser.GameObjects.Text;
//   private isReady: boolean = false;
  
//   // Firebase listeners
//   private lobbyUnsubscribe: (() => void) | null = null;
//   private gameStateUnsubscribe: (() => void) | null = null;
  
//   // Constants
//   private readonly BOARD_SIZE = 8;
//   private readonly SQUARE_SIZE = 38;
//   private readonly BOARD_OFFSET_X = 28;
//   private readonly BOARD_OFFSET_Y = 110;

//   constructor() {
//     super({ key: 'CheckersOnlineGameScene' });
//   }

//   init(data: { 
//     lobbyId: string;
//     uid: string;
//     username: string;
//   }) {
//     console.log('🎮 Online Checkers started:', data);
    
//     this.lobbyId = data.lobbyId;
//     this.uid = data.uid;
//     this.username = data.username;
//   }

//   async create() {
//     // Load the lobby first
//     const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
    
//     if (!lobby) {
//       console.error('❌ Lobby not found');
//       this.showErrorAndExit('Lobby not found');
//       return;
//     }
    
//     // Find my player data
//     const myPlayer = lobby.players[this.uid];
//     if (!myPlayer) {
//       console.error('❌ Player not found in lobby');
//       this.showErrorAndExit('Player not found');
//       return;
//     }
    
//     this.myColor = myPlayer.color || 'red';
//     this.opponent = lobby.players[lobby.playerIds.find(id => id !== this.uid)!];
    
//     // Initialize empty board
//     this.initBoard();
    
//     // Create visual board
//     this.createBoard();
//     this.createUI();
    
//     // Subscribe to lobby updates
//     this.subscribeToLobby();
    
//     // Subscribe to game state
//     this.subscribeToGameState();
    
//     // Set player online status
//     await checkersMultiplayer.setPlayerOnline(this.uid, true);
//     await checkersMultiplayer.setPlayerGameStatus(this.uid, true, this.lobbyId);
    
//     // If game already started, set up the board
//     if (lobby.status === 'playing' && lobby.startedAt) {
//       await this.loadGameState();
//       this.gameActive = true;
//       this.updateTurnDisplay();
//     } else {
//       // Show ready button
//       this.showReadyButton();
//     }
//   }

//   private initBoard() {
//     // Initialize empty board
//     this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    
//     // Place initial pieces
//     for (let row = 0; row < 8; row++) {
//       for (let col = 0; col < 8; col++) {
//         if ((row + col) % 2 === 1) {
//           if (row < 3) {
//             this.board[row][col] = 'black';
//           } else if (row > 4) {
//             this.board[row][col] = 'red';
//           }
//         }
//       }
//     }
//   }

//   private async loadGameState() {
//     try {
//       const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
//       const snapshot = await import('firebase/database').then(fb => fb.get(gameStateRef));
      
//       if (snapshot.exists()) {
//         const state = snapshot.val();
//         this.board = state.board;
//         this.currentPlayer = state.currentPlayer;
//         this.myTurn = (this.currentPlayer === this.myColor);
//         this.placePieces();
//         this.updateTurnDisplay();
//       }
//     } catch (error) {
//       console.error('Error loading game state:', error);
//     }
//   }

//   private subscribeToLobby() {
//     this.lobbyUnsubscribe = checkersMultiplayer.subscribeToLobby(
//       this.lobbyId,
//       (lobby) => {
//         if (!lobby) {
//           this.showGameOver('Game lobby closed');
//           return;
//         }
        
//         // Update opponent if needed
//         if (lobby.playerIds.length === 2) {
//           const opponentId = lobby.playerIds.find(id => id !== this.uid);
//           if (opponentId && lobby.players[opponentId]) {
//             this.opponent = lobby.players[opponentId];
//             if (this.opponentNameText) {
//               this.opponentNameText.setText(`${this.opponent.displayName} (${this.opponent.color === 'red' ? '🔴' : '⚫'})`);
//             }
//           }
//         }
        
//         // Check if game started
//         if (lobby.status === 'playing' && !this.gameActive) {
//           this.gameActive = true;
//           this.myTurn = (this.currentPlayer === this.myColor);
//           this.placePieces();
//           this.updateTurnDisplay();
//           if (this.readyButton) {
//             this.readyButton.destroy();
//           }
//         }
        
//         // Check if game finished
//         if (lobby.status === 'finished') {
//           const winner = lobby.winner === this.uid ? 'You win!' : `${lobby.players[lobby.winner!]?.displayName} wins!`;
//           this.showGameOver(winner);
//         }
//       }
//     );
//   }

//   private subscribeToGameState() {
//     const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
    
//     this.gameStateUnsubscribe = onValue(gameStateRef, (snapshot) => {
//       if (!snapshot.exists()) return;
      
//       const state = snapshot.val();
      
//       // Check if this is a new move
//       if (state.lastMove && state.lastMove.timestamp > (state.lastProcessed || 0)) {
//         // Only apply if it's not my move
//         if (state.lastMove.playerUid !== this.uid) {
//           this.applyOpponentMove(state.lastMove);
          
//           // Mark as processed
//           update(gameStateRef, {
//             lastProcessed: state.lastMove.timestamp
//           });
//         }
//       }
      
//       // Update board and turn
//       this.board = state.board;
//       this.currentPlayer = state.currentPlayer;
//       this.myTurn = (this.currentPlayer === this.myColor);
      
//       // Refresh pieces
//       this.placePieces();
//       this.updateTurnDisplay();
      
//       // Check for win condition
//       if (state.winner) {
//         const winner = state.winner === this.uid ? 'You win!' : `${this.opponent?.displayName} wins!`;
//         this.showGameOver(winner);
//       }
//     });
//   }

//   private createBoard() {
//     for (let row = 0; row < this.BOARD_SIZE; row++) {
//       this.squares[row] = [];
//       this.pieces[row] = [];
      
//       for (let col = 0; col < this.BOARD_SIZE; col++) {
//         const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE;
//         const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE;
        
//         const isPlayable = (row + col) % 2 === 1;
//         const color = isPlayable ? 0x8b4513 : 0xdeb887;
        
//         const square = this.add.rectangle(
//           x + this.SQUARE_SIZE / 2,
//           y + this.SQUARE_SIZE / 2,
//           this.SQUARE_SIZE,
//           this.SQUARE_SIZE,
//           color
//         );
        
//         square.setStrokeStyle(1, 0x000000);
//         this.squares[row][col] = square;
        
//         // Make squares interactive when it's my turn
//         if (isPlayable) {
//           square.setInteractive({ useHandCursor: true });
//           square.on('pointerdown', () => this.onSquareClick(row, col));
//         }
//       }
//     }
//   }

//   private placePieces() {
//     // Clear existing pieces
//     for (let row = 0; row < this.BOARD_SIZE; row++) {
//       for (let col = 0; col < this.BOARD_SIZE; col++) {
//         if (this.pieces[row][col]) {
//           this.pieces[row][col]?.destroy();
//           this.pieces[row][col] = null;
//         }
//       }
//     }
    
//     // Create pieces based on board state
//     for (let row = 0; row < this.BOARD_SIZE; row++) {
//       for (let col = 0; col < this.BOARD_SIZE; col++) {
//         const pieceType = this.board[row][col];
//         if (pieceType) {
//           this.createPiece(row, col, pieceType);
//         }
//       }
//     }
//   }

//   private createPiece(row: number, col: number, pieceType: string) {
//     const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
//     const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    
//     const isRed = pieceType.includes('red');
//     const isKing = pieceType.includes('king');
//     const texture = isKing ? (isRed ? 'red_king' : 'black_king') : (isRed ? 'red_normal' : 'black_normal');
    
//     const piece = this.add.image(x, y, texture);
//     piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
    
//     // Make my pieces interactive
//     if ((isRed && this.myColor === 'red') || (!isRed && this.myColor === 'black')) {
//       piece.setInteractive({ useHandCursor: true });
//       piece.on('pointerdown', () => this.onPieceClick(row, col));
//     }
    
//     this.pieces[row][col] = piece;
//   }

//   private onPieceClick(row: number, col: number) {
//     if (!this.myTurn || !this.gameActive) return;
    
//     const piece = this.board[row][col];
//     if (!piece) return;
    
//     // Clear previous selection
//     this.clearHighlights();
    
//     // Select the piece
//     this.selectedPiece = { row, col };
//     this.validMoves = this.getValidMoves(row, col);
//     this.highlightValidMoves();
//   }

//   private onSquareClick(row: number, col: number) {
//     if (!this.myTurn || !this.selectedPiece || !this.gameActive) return;
    
//     // Check if this is a valid move
//     const isValid = this.validMoves.some(move => move.row === row && move.col === col);
    
//     if (isValid) {
//       this.makeMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
//     }
    
//     this.selectedPiece = null;
//     this.clearHighlights();
//   }

//   private async makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
//     // Check if this is a capture move
//     const isCapture = Math.abs(toRow - fromRow) > 1;
//     let capturedPiece = null;
    
//     if (isCapture) {
//       const captureRow = (fromRow + toRow) / 2;
//       const captureCol = (fromCol + toCol) / 2;
//       capturedPiece = { row: captureRow, col: captureCol };
//     }
    
//     // Create new board state
//     const newBoard = JSON.parse(JSON.stringify(this.board));
//     const piece = newBoard[fromRow][fromCol];
//     newBoard[toRow][toCol] = piece;
//     newBoard[fromRow][fromCol] = null;
    
//     if (capturedPiece) {
//       newBoard[capturedPiece.row][capturedPiece.col] = null;
//     }
    
//     // Check for king promotion
//     let promoted = false;
//     if ((piece === 'red' && toRow === 0) || (piece === 'black' && toRow === 7)) {
//       newBoard[toRow][toCol] = `king_${piece}`;
//       promoted = true;
//     }
    
//     // Create move object
//     const move: GameMove = {
//       fromRow,
//       fromCol,
//       toRow,
//       toCol,
//       capturedPiece,
//       piece,
//       timestamp: Date.now(),
//       playerUid: this.uid
//     };
    
//     // Save game state to Firebase
//     const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
//     const newCurrentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
    
//     try {
//       await update(gameStateRef, {
//         board: newBoard,
//         currentPlayer: newCurrentPlayer,
//         lastMove: move,
//         lastUpdated: Date.now()
//       });
      
//       // Update local state
//       this.board = newBoard;
//       this.currentPlayer = newCurrentPlayer;
//       this.myTurn = false;
      
//       // Animate the move
//       this.animateMove(fromRow, fromCol, toRow, toCol, capturedPiece, promoted);
      
//       this.updateTurnDisplay();
      
//       // Check for win
//       await this.checkWinCondition();
      
//     } catch (error) {
//       console.error('Error making move:', error);
//       this.showMessage('Failed to make move');
//     }
//   }

//   private animateMove(fromRow: number, fromCol: number, toRow: number, toCol: number, capturedPiece: any, promoted: boolean) {
//     const piece = this.pieces[fromRow][fromCol];
//     if (!piece) return;
    
//     const targetX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
//     const targetY = this.BOARD_OFFSET_Y + toRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    
//     this.tweens.add({
//       targets: piece,
//       x: targetX,
//       y: targetY,
//       duration: 200,
//       ease: 'Power2',
//       onComplete: () => {
//         // Update pieces array
//         this.pieces[toRow][toCol] = piece;
//         this.pieces[fromRow][fromCol] = null;
        
//         // Remove captured piece
//         if (capturedPiece) {
//           this.removePiece(capturedPiece.row, capturedPiece.col);
//         }
        
//         // Handle promotion
//         if (promoted) {
//           const pieceType = this.board[toRow][toCol];
//           const isRed = pieceType.includes('red');
//           piece.setTexture(isRed ? 'red_king' : 'black_king');
//         }
//       }
//     });
//   }

//   private removePiece(row: number, col: number) {
//     const piece = this.pieces[row][col];
//     if (piece) {
//       this.tweens.add({
//         targets: piece,
//         scale: 0,
//         alpha: 0,
//         duration: 200,
//         onComplete: () => {
//           piece.destroy();
//           this.pieces[row][col] = null;
//         }
//       });
//     }
//   }

//   private applyOpponentMove(move: GameMove) {
//     // Animate the opponent's move
//     this.animateMove(
//       move.fromRow, move.fromCol,
//       move.toRow, move.toCol,
//       move.capturedPiece,
//       false
//     );
//   }

//   private getValidMoves(row: number, col: number): { row: number; col: number }[] {
//     const moves: { row: number; col: number }[] = [];
//     const piece = this.board[row][col];
    
//     if (!piece) return moves;
    
//     const isKing = piece.includes('king');
//     const isRed = piece.includes('red');
    
//     const directions = isKing
//       ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
//       : isRed
//         ? [[-1, -1], [-1, 1]]
//         : [[1, -1], [1, 1]];
    
//     for (const [rowDir, colDir] of directions) {
//       // Regular moves
//       const newRow = row + rowDir;
//       const newCol = col + colDir;
//       if (this.isValidSquare(newRow, newCol) && !this.board[newRow][newCol]) {
//         moves.push({ row: newRow, col: newCol });
//       }
      
//       // Captures
//       const jumpRow = row + rowDir * 2;
//       const jumpCol = col + colDir * 2;
//       const midRow = row + rowDir;
//       const midCol = col + colDir;
      
//       if (this.isValidSquare(jumpRow, jumpCol) && !this.board[jumpRow][jumpCol]) {
//         const midPiece = this.board[midRow][midCol];
//         if (midPiece) {
//           const isOpponent = midPiece.includes(isRed ? 'black' : 'red');
//           if (isOpponent) {
//             moves.push({ row: jumpRow, col: jumpCol });
//           }
//         }
//       }
//     }
    
//     return moves;
//   }

//   private isValidSquare(row: number, col: number): boolean {
//     return row >= 0 && row < 8 && col >= 0 && col < 8;
//   }

//   private highlightValidMoves() {
//     this.validMoves.forEach(move => {
//       if (this.squares[move.row][move.col]) {
//         this.squares[move.row][move.col].setFillStyle(0x44ff44, 0.5);
//       }
//     });
//   }

//   private clearHighlights() {
//     for (let row = 0; row < 8; row++) {
//       for (let col = 0; col < 8; col++) {
//         if (this.squares[row][col] && (row + col) % 2 === 1) {
//           this.squares[row][col].setFillStyle(0x8b4513);
//         }
//       }
//     }
//   }

//   private async checkWinCondition() {
//     let redPieces = 0;
//     let blackPieces = 0;
    
//     for (let row = 0; row < 8; row++) {
//       for (let col = 0; col < 8; col++) {
//         const piece = this.board[row][col];
//         if (piece) {
//           if (piece.includes('red')) redPieces++;
//           else blackPieces++;
//         }
//       }
//     }
    
//     let winner = null;
//     if (redPieces === 0) winner = this.myColor === 'black' ? this.uid : this.opponent?.uid;
//     if (blackPieces === 0) winner = this.myColor === 'red' ? this.uid : this.opponent?.uid;
    
//     if (winner) {
//       const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
//       await update(gameStateRef, {
//         winner: winner,
//         finishedAt: Date.now()
//       });
      
//       await checkersMultiplayer.endGame(this.lobbyId, winner);
//     }
//   }

//   private createUI() {
//     // Opponent info
//     this.opponentNameText = this.add.text(180, 20, 
//       this.opponent ? `${this.opponent.displayName} (${this.opponent.color === 'red' ? '🔴' : '⚫'})` : 'Waiting for opponent...', {
//       fontSize: '16px',
//       color: '#aaaaaa'
//     }).setOrigin(0.5);
    
//     // My info
//     this.add.text(180, 620, `${this.username} (${this.myColor === 'red' ? '🔴' : '⚫'})`, {
//       fontSize: '14px',
//       color: '#cccccc'
//     }).setOrigin(0.5);
    
//     // Turn indicator
//     this.turnText = this.add.text(180, 50, '', {
//       fontSize: '18px',
//       fontStyle: 'bold'
//     }).setOrigin(0.5);
    
//     // Resign button
//     const resignBtn = this.add.text(300, 10, '🏳️ RESIGN', {
//       fontSize: '14px',
//       color: '#ffffff',
//       backgroundColor: '#f44336',
//       padding: { x: 8, y: 4 }
//     })
//       .setInteractive({ useHandCursor: true })
//       .on('pointerdown', () => this.resignGame());
    
//     // Back button
//     const backBtn = this.add.text(20, 10, '← BACK', {
//       fontSize: '14px',
//       color: '#ffffff',
//       backgroundColor: '#666666',
//       padding: { x: 8, y: 4 }
//     })
//       .setInteractive({ useHandCursor: true })
//       .on('pointerdown', () => this.leaveGame());
//   }

//   private showReadyButton() {
//     this.readyButton = this.add.text(180, 300, 'READY', {
//       fontSize: '32px',
//       color: '#ffffff',
//       backgroundColor: '#4caf50',
//       padding: { x: 20, y: 10 }
//     })
//       .setOrigin(0.5)
//       .setInteractive({ useHandCursor: true })
//       .on('pointerdown', async () => {
//         this.isReady = true;
//         await checkersMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);
//         this.readyButton.setText('WAITING...');
//         this.readyButton.disableInteractive();
//       });
//   }

//   private updateTurnDisplay() {
//     if (!this.gameActive) return;
    
//     let text = '';
//     let color = '';
    
//     if (this.myTurn) {
//       text = '🔴 YOUR TURN';
//       color = '#00ff00';
//     } else {
//       text = '⚫ OPPONENT\'S TURN';
//       color = '#ff6666';
//     }
    
//     this.turnText.setText(text);
//     this.turnText.setColor(color);
//   }

//   private async resignGame() {
//     const confirmed = confirm('Are you sure you want to resign?');
//     if (!confirmed) return;
    
//     await checkersMultiplayer.endGame(this.lobbyId, this.opponent?.uid || '');
//     this.showGameOver('You resigned');
//   }

//   private async leaveGame() {
//     await checkersMultiplayer.playerLeave(this.lobbyId, this.uid);
//     this.cleanup();
//     this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username });
//   }

//   private showMessage(msg: string) {
//     const message = this.add.text(180, 600, msg, {
//       fontSize: '16px',
//       color: '#ffff00'
//     }).setOrigin(0.5);
    
//     this.time.delayedCall(2000, () => message.destroy());
//   }

//   private showGameOver(message: string) {
//     this.gameActive = false;
    
//     this.add.text(180, 300, 'GAME OVER', {
//       fontSize: '32px',
//       color: '#ffff00',
//       fontStyle: 'bold'
//     }).setOrigin(0.5);
    
//     this.add.text(180, 350, message, {
//       fontSize: '24px',
//       color: '#ffffff'
//     }).setOrigin(0.5);
    
//     this.add.text(180, 400, 'Tap to return to menu', {
//       fontSize: '16px',
//       color: '#aaaaaa'
//     }).setOrigin(0.5);
    
//     this.input.once('pointerdown', () => {
//       this.cleanup();
//       this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username });
//     });
//   }

//   private showErrorAndExit(message: string) {
//     this.add.text(180, 320, message, {
//       fontSize: '20px',
//       color: '#ff0000'
//     }).setOrigin(0.5);
    
//     this.time.delayedCall(2000, () => {
//       this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username });
//     });
//   }

//   private cleanup() {
//     if (this.lobbyUnsubscribe) {
//       this.lobbyUnsubscribe();
//     }
//     if (this.gameStateUnsubscribe) {
//       this.gameStateUnsubscribe();
//     }
    
//     // Clean up Firebase listeners
//     off(ref(db, `lobbies/${this.lobbyId}`));
//     off(ref(db, `games/checkers/${this.lobbyId}`));
//   }
// }