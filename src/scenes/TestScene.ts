// src/scenes/checkers/CheckersSocketTestScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

export class CheckersSocketTestScene extends Phaser.Scene {
  // Socket connection
  private socket: Socket | null = null;
  private roomId: string = '';
  private myColor: 'red' | 'black' = 'red';
  private isHost: boolean = true;
  private opponentName: string = 'Opponent';

  // Game state
  private board: (string | null)[][] = [];
  private currentPlayer: 'red' | 'black' = 'red';
  private myTurn: boolean = false;
  private gameActive: boolean = false;

  // Move tracking
  private selectedPiece: { row: number; col: number } | null = null;
  private validMoves: { row: number; col: number }[] = [];
  private movesCount: number = 0;
  private piecesCapturedCount: number = 0;
  private kingsMadeCount: number = 0;
  private gameStartTime: number = 0;

  // Visual elements
  private squares: Phaser.GameObjects.Rectangle[][] = [];
  private pieces: (Phaser.GameObjects.Image | null)[][] = [];
  private turnText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private opponentText!: Phaser.GameObjects.Text;

  // Constants
  private readonly BOARD_SIZE = 8;
  private readonly SQUARE_SIZE = 38;
  private readonly BOARD_OFFSET_X = 28;
  private readonly BOARD_OFFSET_Y = 100;

  constructor() {
    super({ key: 'CheckersSocketTestScene' });
  }

  init(data: { 
    roomId: string;
    myColor: 'red' | 'black';
    isHost: boolean;
    opponentName?: string;
    socket?: Socket;
  }) {
    console.log('🎮 CheckersSocketTestScene initialized:', data);

    this.roomId = data.roomId;
    this.myColor = data.myColor;
    this.isHost = data.isHost;
    this.opponentName = data.opponentName || 'Opponent';
    this.socket = data.socket || null;

    // Red always starts
    this.currentPlayer = 'red';
    this.myTurn = (this.currentPlayer === this.myColor);
    this.gameStartTime = Date.now();
    this.gameActive = true;

    console.log('👤 Playing as:', this.myColor);
    console.log('👥 Opponent:', this.opponentName);
    console.log('🎯 My turn?', this.myTurn);
  }

  preload() {
    this.load.image('red_normal', 'assets/checkers/red_normal.png');
    this.load.image('red_king', 'assets/checkers/red_king.png');
    this.load.image('black_normal', 'assets/checkers/black_normal.png');
    this.load.image('black_king', 'assets/checkers/black_king.png');
  }

  create() {
    console.log('🎮 Creating online checkers game...');

    this.cameras.main.setBackgroundColor('#2a2a2a');

    this.initializeBoard();
    this.createBoard();
    this.createUI();
    this.setupSocketListeners();

    // If host, place initial pieces
    if (this.isHost) {
      this.placeInitialPieces();
      // Send board state to server
      this.socket?.emit('syncGameState', {
        roomId: this.roomId,
        board: this.board,
        currentPlayer: this.currentPlayer
      });
    } else {
      // Joiner waits for board state from host
      this.messageText.setText('Waiting for host to start game...');
      this.socket?.emit('requestGameState', { roomId: this.roomId });
    }
  }

  private setupSocketListeners() {
    if (!this.socket) {
      console.error('❌ No socket connection');
      return;
    }

    this.socket.on('gameStateSync', (data: any) => {
      console.log('📥 Game state sync received!');
      this.board = data.board;
      this.currentPlayer = data.currentPlayer;
      this.myTurn = (this.currentPlayer === this.myColor);
      this.gameActive = true;

      this.redrawBoard();
      this.updateTurnText();
      this.messageText.setText('Game started! Make a move');
    });

    this.socket.on('opponentMove', (data: any) => {
      console.log('📥 Opponent move received:', data);
      
      // Remove captured piece if any
      if (data.capturedPiece) {
        this.removePiece(data.capturedPiece.row, data.capturedPiece.col);
        // Update board array
        if (this.board[data.capturedPiece.row] && this.board[data.capturedPiece.row][data.capturedPiece.col]) {
          this.board[data.capturedPiece.row][data.capturedPiece.col] = null;
        }
      }
      
      // Animate the move
      this.animateOpponentMove(data.fromRow, data.fromCol, data.toRow, data.toCol);
      
      // Update board array
      const pieceType = this.board[data.fromRow][data.fromCol];
      if (pieceType) {
        this.board[data.toRow][data.toCol] = pieceType;
        this.board[data.fromRow][data.fromCol] = null;
      }
      
      // Check for king promotion
      if (data.promoted) {
        const color = data.playerColor === 'red' ? 'red' : 'black';
        this.board[data.toRow][data.toCol] = `king_${color}`;
        this.updatePieceTexture(data.toRow, data.toCol, true);
        this.kingsMadeCount++;
      }
      
      // Update game state
      this.currentPlayer = data.currentPlayer;
      this.myTurn = (this.currentPlayer === this.myColor);
      this.updateTurnText();
      this.deselectPiece();
      this.updatePieceInteractivity();
    });

    this.socket.on('moveConfirmed', (data: any) => {
      console.log('✅ Move confirmed by server');
      
      // Remove captured piece if any
      if (data.capturedPiece) {
        this.removePiece(data.capturedPiece.row, data.capturedPiece.col);
        if (this.board[data.capturedPiece.row] && this.board[data.capturedPiece.row][data.capturedPiece.col]) {
          this.board[data.capturedPiece.row][data.capturedPiece.col] = null;
        }
      }
      
      // Update with server's board state
      if (data.newBoard) {
        this.board = data.newBoard;
        this.redrawBoard();
      }
      
      // Check for promotion
      if (data.promoted && !this.board[data.toRow][data.toCol]?.includes('king')) {
        const color = data.playerColor === 'red' ? 'red' : 'black';
        this.board[data.toRow][data.toCol] = `king_${color}`;
        this.updatePieceTexture(data.toRow, data.toCol, true);
        this.kingsMadeCount++;
      }
      
      this.currentPlayer = data.currentPlayer;
      this.myTurn = (this.currentPlayer === this.myColor);
      this.updateTurnText();
      this.updatePieceInteractivity();
    });

    this.socket.on('gameOver', (data: any) => {
      console.log('🏁 Game over:', data);
      this.gameActive = false;
      this.showGameOver(data.message);
    });

    this.socket.on('opponentDisconnected', () => {
      console.log('⚠️ Opponent disconnected');
      this.messageText.setText('Opponent disconnected');
      this.gameActive = false;
      this.time.delayedCall(3000, () => {
        this.scene.start('CheckersStartScene');
      });
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      this.messageText.setText('Connection lost');
      this.gameActive = false;
    });
  }

  private initializeBoard() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      this.board[row] = [];
      this.squares[row] = [];
      this.pieces[row] = [];
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        this.board[row][col] = null;
        this.pieces[row][col] = null;
      }
    }
  }

  private createBoard() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE;
        const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE;

        const isPlayable = (row + col) % 2 === 1;
        const color = isPlayable ? 0x8b4513 : 0xdeb887;

        const square = this.add.rectangle(
          x + this.SQUARE_SIZE / 2,
          y + this.SQUARE_SIZE / 2,
          this.SQUARE_SIZE,
          this.SQUARE_SIZE,
          color
        );

        square.setStrokeStyle(1, 0x000000);
        this.squares[row][col] = square;

        if (isPlayable) {
          square.setInteractive({ useHandCursor: true });
          square.on('pointerdown', () => this.onSquareClick(row, col));
        }
      }
    }

    this.addCoordinates();
  }

  private addCoordinates() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      this.add.text(
        this.BOARD_OFFSET_X - 18,
        this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE + this.SQUARE_SIZE / 2 - 8,
        (8 - row).toString(),
        { fontSize: '12px', color: '#ffffff' }
      );
    }

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let col = 0; col < this.BOARD_SIZE; col++) {
      this.add.text(
        this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2 - 6,
        this.BOARD_OFFSET_Y - 20,
        letters[col],
        { fontSize: '12px', color: '#ffffff' }
      );
    }
  }

  private createUI() {
    // Opponent info
    this.opponentText = this.add.text(180, 20, `vs ${this.opponentName}`, {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // Turn indicator
    this.turnText = this.add.text(180, 540, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Message area
    this.messageText = this.add.text(180, 570, '', {
      fontSize: '12px',
      color: '#ffff00'
    }).setOrigin(0.5);

    // Resign button
    const resignBtn = this.add.text(300, 10, '🏳️ RESIGN', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 8, y: 4 }
    })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resign());
  }

  private placeInitialPieces() {
    console.log('Placing initial pieces...');
    this.gameActive = true;
    this.currentPlayer = 'red';
    this.myTurn = (this.myColor === 'red');

    // Place black pieces (top)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          this.createPiece(row, col, 'black', false);
          this.board[row][col] = 'black';
        }
      }
    }

    // Place red pieces (bottom)
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          this.createPiece(row, col, 'red', false);
          this.board[row][col] = 'red';
        }
      }
    }

    this.updateTurnText();
  }

  private redrawBoard() {
    // Clear existing pieces
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if (this.pieces[row]?.[col]) {
          this.pieces[row][col]?.destroy();
          this.pieces[row][col] = null;
        }
      }
    }

    // Create pieces from board state
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece) {
          const isKing = piece.includes('king');
          const color = piece.includes('red') ? 'red' : 'black';
          this.createPiece(row, col, color, isKing);
        }
      }
    }

    this.updatePieceInteractivity();
  }

  private createPiece(row: number, col: number, color: 'red' | 'black', isKing: boolean) {
    const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

    const texture = isKing ? `${color}_king` : `${color}_normal`;
    const piece = this.add.image(x, y, texture);
    piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
    piece.setData('row', row);
    piece.setData('col', col);

    // Make MY pieces interactive
    if (color === this.myColor && this.gameActive && this.myTurn) {
      piece.setInteractive({ useHandCursor: true });
      piece.on('pointerdown', () => this.onPieceClick(row, col));
      piece.on('pointerover', () => piece.setTint(0xffffaa));
      piece.on('pointerout', () => piece.clearTint());
    } else {
      piece.disableInteractive();
    }

    this.pieces[row][col] = piece;
  }

  private updatePieceTexture(row: number, col: number, isKing: boolean) {
    const piece = this.pieces[row][col];
    if (!piece) return;

    const color = this.board[row][col]?.includes('red') ? 'red' : 'black';
    const texture = isKing ? `${color}_king` : `${color}_normal`;
    piece.setTexture(texture);
    piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
  }

  private onPieceClick(row: number, col: number) {
    if (!this.gameActive || !this.myTurn) return;
    const piece = this.board[row][col];
    if (piece && piece.includes(this.myColor)) {
      this.selectPiece(row, col);
    }
  }

  private onSquareClick(row: number, col: number) {
    if (!this.gameActive || !this.myTurn || !this.selectedPiece) return;
    this.tryMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
  }

  private selectPiece(row: number, col: number) {
    this.deselectPiece();
    this.selectedPiece = { row, col };
    this.validMoves = this.getValidMoves(row, col);
    this.highlightValidMoves();
    this.messageText.setText(`Selected ${this.getSquareName(row, col)}`);
  }

  private deselectPiece() {
    this.selectedPiece = null;
    this.clearHighlights();
    this.validMoves = [];
  }

  private getValidMoves(row: number, col: number): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const piece = this.board[row][col];

    if (!piece) return moves;

    const isKing = piece.includes('king');
    const isRed = piece.includes('red');

    // King can move any number of squares diagonally
    if (isKing) {
      const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      
      for (const [rowDir, colDir] of directions) {
        let steps = 1;
        while (true) {
          const newRow = row + rowDir * steps;
          const newCol = col + colDir * steps;
          
          if (!this.isValidSquare(newRow, newCol)) break;
          
          const targetPiece = this.board[newRow][newCol];
          
          if (!targetPiece) {
            moves.push({ row: newRow, col: newCol });
            steps++;
          } else {
            const isOpponent = targetPiece.includes(isRed ? 'black' : 'red');
            if (isOpponent) {
              const jumpRow = newRow + rowDir;
              const jumpCol = newCol + colDir;
              if (this.isValidSquare(jumpRow, jumpCol) && !this.board[jumpRow][jumpCol]) {
                moves.push({ row: jumpRow, col: jumpCol });
              }
            }
            break;
          }
        }
      }
    } else {
      // Regular pieces: can only move 1 square forward, or capture 2 squares forward
      const directions = isRed ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
      
      for (const [rowDir, colDir] of directions) {
        // Regular move (1 step)
        const newRow = row + rowDir;
        const newCol = col + colDir;
        if (this.isValidSquare(newRow, newCol) && !this.board[newRow][newCol]) {
          moves.push({ row: newRow, col: newCol });
        }
        
        // Capture move (2 steps)
        const jumpRow = row + rowDir * 2;
        const jumpCol = col + colDir * 2;
        const midRow = row + rowDir;
        const midCol = col + colDir;
        
        if (this.isValidSquare(jumpRow, jumpCol) && !this.board[jumpRow][jumpCol]) {
          const midPiece = this.board[midRow][midCol];
          if (midPiece) {
            const isOpponent = midPiece.includes(isRed ? 'black' : 'red');
            if (isOpponent) {
              moves.push({ row: jumpRow, col: jumpCol });
            }
          }
        }
      }
    }

    return moves;
  }

  private isValidSquare(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  private tryMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const isValid = this.validMoves.some(move => move.row === toRow && move.col === toCol);
    if (!isValid) {
      this.messageText.setText('❌ Invalid move!');
      this.squares[toRow][toCol].setFillStyle(0xff4444, 0.5);
      this.time.delayedCall(300, () => {
        this.squares[toRow][toCol].setFillStyle((toRow + toCol) % 2 === 1 ? 0x8b4513 : 0xdeb887);
      });
      return;
    }

    const isCapture = Math.abs(toRow - fromRow) > 1;
    let capturedPiece = null;

    if (isCapture) {
      const rowStep = toRow > fromRow ? 1 : -1;
      const colStep = toCol > fromCol ? 1 : -1;
      let currentRow = fromRow + rowStep;
      let currentCol = fromCol + colStep;
      
      while (currentRow !== toRow && currentCol !== toCol) {
        if (this.board[currentRow][currentCol]) {
          capturedPiece = { row: currentRow, col: currentCol };
          break;
        }
        currentRow += rowStep;
        currentCol += colStep;
      }
      this.piecesCapturedCount++;
      
      // Immediately remove captured piece visually
      if (capturedPiece) {
        this.removePiece(capturedPiece.row, capturedPiece.col);
        this.board[capturedPiece.row][capturedPiece.col] = null;
      }
    }

    const move = {
      fromRow, fromCol, toRow, toCol, capturedPiece,
      piece: this.board[fromRow][fromCol],
      playerColor: this.myColor
    };

    // Animate the move
    this.animateOwnMove(fromRow, fromCol, toRow, toCol);
    
    // Update board array
    const pieceType = this.board[fromRow][fromCol];
    this.board[toRow][toCol] = pieceType;
    this.board[fromRow][fromCol] = null;

    // Check for king promotion
    const wasPromoted = this.checkKingPromotion(toRow, toCol);
    if (wasPromoted) {
      this.updatePieceTexture(toRow, toCol, true);
      this.kingsMadeCount++;
    }

    // Send move to server
    this.socket?.emit('makeMove', { roomId: this.roomId, move });
    
    this.movesCount++;
    this.deselectPiece();
  }

  private animateOwnMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const piece = this.pieces[fromRow][fromCol];
    if (!piece) return;

    const targetX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    const targetY = this.BOARD_OFFSET_Y + toRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

    this.tweens.add({
      targets: piece,
      x: targetX,
      y: targetY,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.pieces[toRow][toCol] = piece;
        this.pieces[fromRow][fromCol] = null;
      }
    });
  }

  private animateOpponentMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const piece = this.pieces[fromRow][fromCol];
    if (!piece) return;

    const targetX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    const targetY = this.BOARD_OFFSET_Y + toRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

    this.tweens.add({
      targets: piece,
      x: targetX,
      y: targetY,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.pieces[toRow][toCol] = piece;
        this.pieces[fromRow][fromCol] = null;
      }
    });
  }

  private removePiece(row: number, col: number) {
    const piece = this.pieces[row][col];
    if (piece) {
      this.tweens.add({
        targets: piece,
        scale: 0,
        alpha: 0,
        duration: 150,
        onComplete: () => {
          piece.destroy();
          this.pieces[row][col] = null;
        }
      });
    }
  }

  private checkKingPromotion(row: number, col: number): boolean {
    const piece = this.board[row][col];
    if (!piece) return false;

    if (piece === 'red' && row === 0) {
      this.board[row][col] = 'king_red';
      return true;
    } else if (piece === 'black' && row === 7) {
      this.board[row][col] = 'king_black';
      return true;
    }
    return false;
  }

  private highlightValidMoves() {
    this.validMoves.forEach(move => {
      this.squares[move.row][move.col].setFillStyle(0x44ff44, 0.5);
    });
  }

  private clearHighlights() {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          this.squares[row][col].setFillStyle(0x8b4513);
        }
      }
    }
  }

  private updatePieceInteractivity() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = this.pieces[row]?.[col];
        if (piece && piece.active) {
          const pieceColor = this.board[row]?.[col]?.includes('red') ? 'red' : 'black';
          
          if (pieceColor === this.myColor && this.gameActive && this.myTurn) {
            piece.setInteractive({ useHandCursor: true });
            piece.on('pointerdown', () => this.onPieceClick(row, col));
            piece.on('pointerover', () => piece.setTint(0xffffaa));
            piece.on('pointerout', () => piece.clearTint());
          } else {
            piece.disableInteractive();
            piece.clearTint();
          }
        }
      }
    }
  }

  private getSquareName(row: number, col: number): string {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return `${letters[col]}${8 - row}`;
  }

  private updateTurnText() {
    if (!this.gameActive) {
      this.turnText.setText('Waiting for game to start...');
      return;
    }

    if (this.myTurn) {
      this.turnText.setText('🔴 YOUR TURN');
      this.turnText.setColor('#00ff00');
      this.messageText.setText('Select a piece to move');
    } else {
      this.turnText.setText('⚫ OPPONENT\'S TURN');
      this.turnText.setColor('#ff6666');
      this.messageText.setText('Waiting for opponent...');
    }
  }

  private async resign() {
    if (!this.gameActive) return;

    this.gameActive = false;
    this.socket?.emit('playerResigned', { roomId: this.roomId });
    this.showGameOver('You resigned');
  }

  private showGameOver(message: string) {
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, 360, 640);

    this.add.text(180, 280, 'GAME OVER', {
      fontSize: '32px',
      color: '#ffff00',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(180, 330, message, {
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(180, 380, `Moves: ${this.movesCount}`, {
      fontSize: '14px',
      color: '#cccccc'
    }).setOrigin(0.5);

    this.add.text(180, 410, `Captured: ${this.piecesCapturedCount}`, {
      fontSize: '14px',
      color: '#ffaa00'
    }).setOrigin(0.5);

    this.add.text(180, 440, `Kings: ${this.kingsMadeCount}`, {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);

    const returnBtn = this.add.text(180, 500, 'RETURN TO MENU', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    returnBtn.on('pointerdown', () => {
      this.socket?.disconnect();
      this.scene.start('CheckersStartScene');
    });
  }

  shutdown() {
    this.socket?.disconnect();
  }
}