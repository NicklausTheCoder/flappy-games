// src/scenes/checkers/CheckersTestSkillScene.ts
import Phaser from 'phaser';
import { CheckersUserData } from '../../firebase/checkersService';
import { checkersMultiplayer, CheckersGameState } from '../../firebase/checkersMultiplayertwo';

export class CheckersTestSkillScene extends Phaser.Scene {
  // ─── Tracking ───────────────────────────────────────────────────────────────
  private gameStartTime: number = 0;
  private movesCount: number = 0;
  private piecesCapturedCount: number = 0;
  private kingsMadeCount: number = 0;

  // ─── Auth ────────────────────────────────────────────────────────────────────
  private username: string = '';
  private uid: string = '';
  private userData: CheckersUserData | null = null;

  // ─── Online multiplayer ──────────────────────────────────────────────────────
  private gameId: string = '';
  private myColor: 'red' | 'black' = 'red';
  private unsubscribeGame: (() => void) | null = null;
  private heartbeatTimer: Phaser.Time.TimerEvent | null = null;
  private opponentLastSeen: number = Date.now();
  private readonly DISCONNECT_TIMEOUT_MS = 15_000; // 15 s

  // ─── Game state (local mirror — truth lives in Firebase) ─────────────────────
  private board: (string | null)[][] = [];
  private currentPlayer: 'red' | 'black' = 'red';
  private selectedPiece: { row: number; col: number } | null = null;
  private validMoves: { row: number; col: number }[] = [];
  private gameActive: boolean = false; // stays false until both players present

  // ─── Visual elements ─────────────────────────────────────────────────────────
  private squares: Phaser.GameObjects.Rectangle[][] = [];
  private pieces: (Phaser.GameObjects.Image | null)[][] = [];
  private crowns: (Phaser.GameObjects.Image | null)[][] = [];
  private turnText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private player1NameText!: Phaser.GameObjects.Text;
  private player2NameText!: Phaser.GameObjects.Text;
  private waitingOverlay!: Phaser.GameObjects.Container;

  // ─── Board constants (mobile 360×640) ────────────────────────────────────────
  private readonly BOARD_SIZE = 8;
  private readonly SQUARE_SIZE = 38;
  private readonly BOARD_OFFSET_X = 28;
  private readonly BOARD_OFFSET_Y = 110;

  constructor() {
    super({ key: 'CheckersTestSkillScene' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  init(data: { username: string; uid: string; userData: CheckersUserData }) {
    if (!data?.username || !data?.uid) {
      console.error('❌ No username/uid — redirecting to start');
      this.scene.start('CheckersStartScene');
      return;
    }

    this.username = data.username;
    this.uid = data.uid;
    this.userData = data.userData;

    this.gameStartTime = Date.now();
    this.movesCount = 0;
    this.piecesCapturedCount = 0;
    this.kingsMadeCount = 0;
  }

  preload() {
    this.load.image('red_normal', 'assets/checkers/red_normal.jpg');
    this.load.image('red_king', 'assets/checkers/red_king.jpg');
    this.load.image('black_normal', 'assets/checkers/black_normal.jpg');
    this.load.image('black_king', 'assets/checkers/black_king.jpg');
  }

  async create() {
    this.cameras.main.setBackgroundColor('#2a2a2a');

    this.initializeArrays();
    this.createBoard();
    this.createUI();
    this.setupInput();

    // Show "connecting…" while Firebase call resolves
    this.showWaitingOverlay('🔌 Connecting…');

    try {
      const { gameId, color } = await checkersMultiplayer.findOrCreateGame(
        this.uid,
        this.username
      );

      this.gameId = gameId;
      this.myColor = color;

      console.log(`✅ I am ${color.toUpperCase()} in game ${gameId}`);

      // Subscribe to live game state
      this.unsubscribeGame = checkersMultiplayer.subscribeToGame(
        gameId,
        (state) => this.onGameStateChanged(state)
      );

      // Send heartbeats every 5 s so opponent can detect disconnect
      this.heartbeatTimer = this.time.addEvent({
        delay: 5_000,
        loop: true,
        callback: () => {
          checkersMultiplayer.heartbeat(this.uid, this.gameId, this.myColor);
        }
      });

      this.updatePlayerLabels();

      if (color === 'red') {
        this.showWaitingOverlay('⏳ Waiting for opponent…');
      } else {
        this.hideWaitingOverlay();
      }

    } catch (err) {
      console.error('❌ Failed to connect to game:', err);
      this.showWaitingOverlay('❌ Connection failed.\nTap to retry.');
      this.input.once('pointerdown', () => this.scene.restart());
    }
  }

  // Called by Phaser when the scene shuts down
  shutdown() {
    this.cleanup();
  }

  destroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.unsubscribeGame) {
      this.unsubscribeGame();
      this.unsubscribeGame = null;
    }
    if (this.heartbeatTimer) {
      this.heartbeatTimer.destroy();
      this.heartbeatTimer = null;
    }
    if (this.gameId && this.myColor) {
      checkersMultiplayer.setOffline(this.uid, this.gameId, this.myColor);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Firebase → Local sync
  // ═══════════════════════════════════════════════════════════════════════════

  private onGameStateChanged(state: CheckersGameState | null) {
    if (!state) return;

    // ── Game finished ────────────────────────────────────────────────────────
    if (state.status === 'finished' && state.winner) {
      this.gameActive = false;
      const iWon = state.winner === this.myColor;
      this.gameOver(
        iWon
          ? `🎉 YOU WIN! (${this.myColor.toUpperCase()})`
          : `😞 YOU LOSE! (${state.winner.toUpperCase()} wins)`
      );
      return;
    }

    // ── Waiting for second player ────────────────────────────────────────────
    if (state.status === 'waiting') {
      this.showWaitingOverlay('⏳ Waiting for opponent…');
      return;
    }

    // ── Game is playing ──────────────────────────────────────────────────────
    if (state.status === 'playing') {
      this.hideWaitingOverlay();
      this.gameActive = true;

      // Track opponent last-seen for disconnect detection
      const opponentColor = this.myColor === 'red' ? 'black' : 'red';
      const opponentData = state.players[opponentColor];
      if (opponentData) {
        this.opponentLastSeen = opponentData.lastSeen || Date.now();
        this.updatePlayerLabels(
          state.players.red?.username,
          state.players.black?.username
        );
      }

      // Mirror board & turn from Firebase
      this.board = state.board;
      this.currentPlayer = state.currentTurn;

      // Re-render all pieces from the authoritative board
      this.renderBoardFromState();
      this.updateTurnText();

      // Clear any pending selection (e.g. after we just moved)
      this.deselectPiece();

      // Check for opponent disconnect
      if (opponentData && Date.now() - opponentData.lastSeen > this.DISCONNECT_TIMEOUT_MS) {
        this.handleOpponentDisconnect();
      }
    }
  }

  // ─── Re-render all pieces from this.board ───────────────────────────────────
  private renderBoardFromState() {
    // Destroy existing piece objects
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if (this.pieces[row][col]) {
          this.pieces[row][col]!.destroy();
          this.pieces[row][col] = null;
        }
        if (this.crowns[row][col]) {
          this.crowns[row][col]!.destroy();
          this.crowns[row][col] = null;
        }
      }
    }

    // Recreate from board state
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const cell = this.board[row][col];
        if (!cell) continue;

        const isKing = cell.includes('king');
        const color = cell.includes('red') ? 'red' : 'black';
        this.createPiece(row, col, color, isKing);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Board setup
  // ═══════════════════════════════════════════════════════════════════════════

  private initializeArrays() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      this.board[row] = [];
      this.squares[row] = [];
      this.pieces[row] = [];
      this.crowns[row] = [];
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        this.board[row][col] = null;
        this.pieces[row][col] = null;
        this.crowns[row][col] = null;
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
          square.on('pointerover', () => this.onSquareHover(row, col, true));
          square.on('pointerout', () => this.onSquareHover(row, col, false));
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

  private createPiece(row: number, col: number, color: 'red' | 'black', isKing: boolean) {
    const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
    const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

    const texture = isKing ? `${color}_king` : `${color}_normal`;
    const piece = this.add.image(x, y, texture);
    piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);

    piece.setInteractive({ useHandCursor: true });
    piece.on('pointerdown', () => this.onPieceClick(row, col));
    piece.on('pointerover', () => this.onPieceHover(row, col, true));
    piece.on('pointerout', () => this.onPieceHover(row, col, false));

    this.pieces[row][col] = piece;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════════════════

  private createUI() {
    this.turnText = this.add.text(180, 20, '', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.player2NameText = this.add.text(180, 52, '⚫ Opponent', {
      fontSize: '12px', color: '#8888ff'
    }).setOrigin(0.5);

    this.player1NameText = this.add.text(180, 628, `🔴 ${this.username}`, {
      fontSize: '12px', color: '#ff8888'
    }).setOrigin(0.5);

    this.messageText = this.add.text(180, 612, 'Connecting…', {
      fontSize: '14px', color: '#ffff00'
    }).setOrigin(0.5);

    // Back button
    const backBtn = this.add.text(16, 630, '← Back', {
      fontSize: '12px', color: '#aaaaaa'
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.goBack());
  }

  private updatePlayerLabels(redName?: string, blackName?: string) {
    if (this.myColor === 'red') {
      this.player1NameText?.setText(`🔴 ${this.username} (You)`);
      this.player2NameText?.setText(`⚫ ${blackName ?? 'Waiting…'}`);
    } else {
      this.player1NameText?.setText(`⚫ ${this.username} (You)`);
      this.player2NameText?.setText(`🔴 ${redName ?? 'Opponent'}`);
    }
  }

  private showWaitingOverlay(msg: string) {
    if (this.waitingOverlay) {
      (this.waitingOverlay.getAt(1) as Phaser.GameObjects.Text)?.setText(msg);
      this.waitingOverlay.setVisible(true);
      return;
    }

    const bg = this.add.rectangle(180, 320, 320, 180, 0x000000, 0.75);
    const text = this.add.text(180, 320, msg, {
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 280 }
    }).setOrigin(0.5);

    this.waitingOverlay = this.add.container(0, 0, [bg, text]);
    this.waitingOverlay.setDepth(10);
  }

  private hideWaitingOverlay() {
    this.waitingOverlay?.setVisible(false);
  }

  private setupInput() {
    this.input.keyboard?.on('keydown-ESC', () => this.deselectPiece());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Input handlers
  // ═══════════════════════════════════════════════════════════════════════════

  private isMyTurn(): boolean {
    return this.gameActive && this.currentPlayer === this.myColor;
  }

  private onPieceClick(row: number, col: number) {
    if (!this.isMyTurn()) {
      this.messageText.setText("⏳ Wait for your turn!");
      return;
    }

    const piece = this.board[row][col];
    if (!piece) return;

    if (piece.includes(this.myColor)) {
      this.selectPiece(row, col);
    } else if (this.selectedPiece) {
      this.tryMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
    }
  }

  private onSquareClick(row: number, col: number) {
    if (!this.isMyTurn()) return;
    if (!this.selectedPiece) return;

    this.tryMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Move logic (runs locally, then writes result to Firebase)
  // ═══════════════════════════════════════════════════════════════════════════

  private selectPiece(row: number, col: number) {
    this.deselectPiece();
    this.selectedPiece = { row, col };
    this.validMoves = this.getValidMoves(row, col);
    this.highlightValidMoves();
    this.messageText.setText(`Selected ${this.getSquareName(row, col)}`);
  }

  private deselectPiece() {
    this.selectedPiece = null;
    this.clearMoveHighlights();
    this.validMoves = [];
  }

  private tryMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    const isValid = this.validMoves.some(m => m.row === toRow && m.col === toCol);

    if (isValid) {
      this.executeMove(fromRow, fromCol, toRow, toCol);
      return;
    }

    const targetPiece = this.board[toRow][toCol];
    if (targetPiece?.includes(this.myColor)) {
      this.selectPiece(toRow, toCol);
      return;
    }

    this.messageText.setText('❌ Invalid move!');
    this.flashSquare(toRow, toCol, 0xff4444);
  }

  private executeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    this.movesCount++;

    // Deep copy board to mutate locally
    const newBoard: (string | null)[][] = this.board.map(r => [...r]);

    const piece = newBoard[fromRow][fromCol];
    newBoard[fromRow][fromCol] = null;
    newBoard[toRow][toCol] = piece;

    // Handle captures
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (rowDiff > 1 || colDiff > 1) {
      const rowDir = toRow > fromRow ? 1 : -1;
      const colDir = toCol > fromCol ? 1 : -1;
      for (let step = 1; step < rowDiff; step++) {
        const cr = fromRow + rowDir * step;
        const cc = fromCol + colDir * step;
        if (newBoard[cr][cc]) {
          newBoard[cr][cc] = null;
          this.piecesCapturedCount++;
        }
      }
    }

    // King promotion
    if (piece === 'red' && toRow === 0) {
      newBoard[toRow][toCol] = 'king_red';
      this.kingsMadeCount++;
    } else if (piece === 'black' && toRow === 7) {
      newBoard[toRow][toCol] = 'king_black';
      this.kingsMadeCount++;
    }

    // Check win condition on new board
    const redLeft = newBoard.flat().filter(p => p?.includes('red')).length;
    const blackLeft = newBoard.flat().filter(p => p?.includes('black')).length;
    const winner: 'red' | 'black' | null =
      redLeft === 0 ? 'black' : blackLeft === 0 ? 'red' : null;

    const nextTurn: 'red' | 'black' = this.myColor === 'red' ? 'black' : 'red';

    // Push to Firebase — the subscription will update local state
    checkersMultiplayer.submitMove(
      this.gameId,
      this.uid,
      newBoard,
      nextTurn,
      { fromRow, fromCol, toRow, toCol },
      winner
    ).catch(err => {
      console.error('❌ Failed to submit move:', err);
      this.messageText.setText('❌ Network error — try again');
    });

    this.deselectPiece();
    this.messageText.setText('✅ Move sent…');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Move calculation (same logic as original)
  // ═══════════════════════════════════════════════════════════════════════════

  private getValidMoves(row: number, col: number): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const piece = this.board[row][col];
    if (!piece) return moves;

    const isKing = piece.includes('king');
    const allDirections = [
      { rowDir: -1, colDir: -1 }, { rowDir: -1, colDir: 1 },
      { rowDir: 1, colDir: -1 }, { rowDir: 1, colDir: 1 }
    ];

    let dirs = isKing
      ? allDirections
      : allDirections.filter(d => d.rowDir === (piece.includes('red') ? -1 : 1));

    const opponentColor = this.myColor === 'red' ? 'black' : 'red';

    for (const dir of dirs) {
      if (!isKing) {
        // Simple move
        const nr = row + dir.rowDir;
        const nc = col + dir.colDir;
        if (this.inBounds(nr, nc) && !this.board[nr][nc]) {
          moves.push({ row: nr, col: nc });
        }
        // Jump
        const jr = row + dir.rowDir * 2;
        const jc = col + dir.colDir * 2;
        const mr = row + dir.rowDir;
        const mc = col + dir.colDir;
        if (this.inBounds(jr, jc) && !this.board[jr][jc]) {
          const mid = this.board[mr][mc];
          if (mid?.includes(opponentColor)) {
            moves.push({ row: jr, col: jc });
          }
        }
      } else {
        // King sliding
        let steps = 1;
        let foundOpponent = false;
        while (true) {
          const nr = row + dir.rowDir * steps;
          const nc = col + dir.colDir * steps;
          if (!this.inBounds(nr, nc)) break;
          const target = this.board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
            if (foundOpponent) break;
            steps++;
          } else if (target.includes(opponentColor) && !foundOpponent) {
            foundOpponent = true;
            steps++;
          } else {
            break;
          }
        }
      }
    }
    return moves;
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Visual helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private highlightValidMoves() {
    this.validMoves.forEach(m => this.squares[m.row][m.col].setFillStyle(0x44ff44, 0.5));
  }

  private clearMoveHighlights() {
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          this.squares[row][col].setFillStyle(0x8b4513);
        }
      }
    }
  }

  private flashSquare(row: number, col: number, color: number) {
    this.squares[row][col].setFillStyle(color, 0.5);
    this.time.delayedCall(300, () => {
      this.squares[row][col].setFillStyle((row + col) % 2 === 1 ? 0x8b4513 : 0xdeb887);
    });
  }

  private onSquareHover(row: number, col: number, isOver: boolean) {
    if (!this.gameActive) return;
    if (isOver && !this.board[row][col]) {
      this.squares[row][col].setFillStyle(0xaa6d3b);
    } else if (!isOver && (row + col) % 2 === 1) {
      this.squares[row][col].setFillStyle(0x8b4513);
    }
  }

  private onPieceHover(row: number, col: number, isOver: boolean) {
    if (!this.gameActive) return;
    const piece = this.pieces[row][col];
    if (!piece) return;
    if (isOver && this.board[row][col]?.includes(this.myColor) && this.isMyTurn()) {
      piece.setTint(0xffffaa);
    } else {
      piece.clearTint();
    }
  }

  private updateTurnText() {
    const isMyTurn = this.currentPlayer === this.myColor;
    this.turnText.setText(
      isMyTurn
        ? `✅ Your turn (${this.myColor.toUpperCase()})`
        : `⏳ ${this.currentPlayer.toUpperCase()} player's turn`
    );
    this.messageText.setText(
      isMyTurn ? 'Tap one of your pieces' : 'Waiting for opponent…'
    );
  }

  private getSquareName(row: number, col: number): string {
    return `${'ABCDEFGH'[col]}${8 - row}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Disconnect / end game
  // ═══════════════════════════════════════════════════════════════════════════

  private handleOpponentDisconnect() {
    if (!this.gameActive) return;
    console.log('🔌 Opponent disconnected — forfeiting on their behalf');
    checkersMultiplayer.forfeit(this.gameId, this.myColor === 'red' ? 'black' : 'red');
  }

  private gameOver(message: string) {
    this.gameActive = false;
    this.cleanup();

    this.add.rectangle(180, 310, 300, 200, 0x000000, 0.8).setDepth(20);

    this.add.text(180, 265, message, {
      fontSize: '22px', color: '#ffff00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4, align: 'center',
      wordWrap: { width: 270 }
    }).setOrigin(0.5).setDepth(21);

    this.add.text(180, 330, `Moves: ${this.movesCount} | Captures: ${this.piecesCapturedCount}`, {
      fontSize: '13px', color: '#cccccc'
    }).setOrigin(0.5).setDepth(21);

    const playAgain = this.add.text(180, 375, '🔄 Play again', {
      fontSize: '18px', color: '#44ff44', backgroundColor: '#006600',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(21);
    playAgain.on('pointerdown', () => this.restartGame());

    const back = this.add.text(180, 420, '← Back to menu', {
      fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(21);
    back.on('pointerdown', () => this.goBack());
  }

  private restartGame() {
    this.cleanup();
    this.scene.restart({
      username: this.username,
      uid: this.uid,
      userData: this.userData
    });
  }

  private goBack() {
    this.cleanup();
    this.scene.start('CheckersStartScene', {
      username: this.username,
      uid: this.uid
    });
  }
}