// src/scenes/checkers/CheckersMultiplayerGameScene.ts
import Phaser from 'phaser';
import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
import { ref, onValue, off, update, get } from 'firebase/database';
import { db } from '../../firebase/init';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

interface CheckersPlayer {
    uid: string;
    username: string;
    displayName: string;
    avatar: string;
    color?: 'red' | 'black';
    isReady: boolean;
}

interface GameMove {
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    capturedPiece?: { row: number; col: number } | null;  // Allow null
    piece: string;
    timestamp: number;
    playerUid: string;
    isKingPromotion?: boolean;
}

export class CheckersMultiplayerGameScene extends Phaser.Scene {
    // Player info
    private uid: string = '';
    private username: string = '';
    private lobbyId: string = '';
    private myColor: 'red' | 'black' = 'red';
    private opponent: CheckersPlayer | null = null;
    private userData: any = null;

    // Game state
    private board: (string | null)[][] = [];
    private currentPlayer: 'red' | 'black' = 'red';
    private myTurn: boolean = false;
    private gameActive: boolean = true;
    private gameWinner: string | null = null;
    private moveInProgress: boolean = false;
    private lastProcessedMoveTimestamp: number = 0;

    // Visual elements
    private squares: Phaser.GameObjects.Rectangle[][] = [];
    private pieces: (Phaser.GameObjects.Image | null)[][] = [];
    private selectedPiece: { row: number; col: number } | null = null;
    private validMoves: { row: number; col: number }[] = [];

    // UI Elements
    private turnText!: Phaser.GameObjects.Text;
    private opponentNameText!: Phaser.GameObjects.Text;
    private myNameText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private resignButton!: Phaser.GameObjects.Text;
    private winnerText!: Phaser.GameObjects.Text;

    // Firebase listeners
    private gameStateUnsubscribe: (() => void) | null = null;

    // Constants
    private readonly BOARD_SIZE = 8;
    private readonly SQUARE_SIZE = 38;
    private readonly BOARD_OFFSET_X = 28;
    private readonly BOARD_OFFSET_Y = 110;

    // Visual effects
    private selectedGlow: Phaser.GameObjects.Graphics | null = null;

    // Flag to indicate if board should be flipped for black player
    private isBoardFlipped: boolean = false;

    constructor() {
        super({ key: 'CheckersMultiplayerGameScene' });
    }

    init(data: {
        username: string;
        uid: string;
        userData?: any;
        lobbyId: string;
        lobby?: any;
        playerColor?: 'red' | 'black';
    }) {
        console.log('🎮 Checkers Multiplayer Game Started:', data);

        this.username = data.username;
        this.uid = data.uid;
        this.userData = data.userData || null;
        this.lobbyId = data.lobbyId;

        if (data.playerColor) {
            this.myColor = data.playerColor;
        } else if (data.lobby && data.lobby.players && data.lobby.players[this.uid]) {
            this.myColor = data.lobby.players[this.uid].color || 'red';
        }

        // Flip board for black player so they see their pieces at the bottom
        this.isBoardFlipped = (this.myColor === 'black');

        console.log(`🎨 My color: ${this.myColor === 'red' ? 'RED (HOST)' : 'BLACK (JOINER)'}`);
        console.log(`🔄 Board flipped: ${this.isBoardFlipped}`);
    }

    async create() {
        // Background
        this.cameras.main.setBackgroundColor('#2c3e50');

        // Initialize arrays
        this.initializeArrays();

        // Create board squares
        this.createBoard();

        // Create UI
        this.createUI();

        // Load or initialize game state
        await this.initializeGameState();

        // Subscribe to game state changes - only listen for new moves
        this.subscribeToGameMoves();

        // Set player online status
        await checkersMultiplayer.setPlayerOnline(this.uid, true);
        await checkersMultiplayer.setPlayerGameStatus(this.uid, true, this.lobbyId);

        // Update turn display
        this.updateTurnDisplay();

        console.log('✅ Game scene ready');
    }

    private initializeArrays() {
        // Initialize board array
        this.board = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

        // Initialize squares array
        this.squares = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

        // Initialize pieces array with empty rows
        this.pieces = Array(this.BOARD_SIZE);
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            this.pieces[i] = Array(this.BOARD_SIZE).fill(null);
        }
    }
    private createBoard() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                // For flipped view, we need to map the visual row to actual board row
                const visualRow = row;
                const actualRow = this.isBoardFlipped ? (this.BOARD_SIZE - 1 - row) : row;

                const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE;
                const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE;

                const isPlayable = (actualRow + col) % 2 === 1;
                const color = isPlayable ? 0x8b4513 : 0xdeb887;

                const square = this.add.rectangle(
                    x + this.SQUARE_SIZE / 2,
                    y + this.SQUARE_SIZE / 2,
                    this.SQUARE_SIZE,
                    this.SQUARE_SIZE,
                    color
                );

                square.setStrokeStyle(1, 0x000000);
                square.setInteractive({ useHandCursor: true });

                // Store coordinates
                (square as any).actualRow = actualRow;
                (square as any).col = col;
                (square as any).visualRow = visualRow;

                square.on('pointerdown', () => {
                    const clickedActualRow = (square as any).actualRow;
                    const clickedCol = (square as any).col;
                    const clickedVisualRow = (square as any).visualRow;
                    this.onSquareClick(clickedActualRow, clickedCol, clickedVisualRow);
                });

                this.squares[actualRow][col] = square;
            }
        }
    }
    private createUI() {
        // Opponent info (top)
        this.opponentNameText = this.add.text(180, 20, '⚫ Waiting for opponent...', {
            fontSize: '16px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // My info (bottom) - always show at bottom of screen
        const myColorText = this.myColor === 'red' ? '🔴 HOST (RED)' : '⚫ JOINER (BLACK)';
        const myPosition = this.myColor === 'red' ? '(Bottom)' : '(Bottom)';
        this.myNameText = this.add.text(180, 620, `${myColorText}: ${this.username} ${myPosition}`, {
            fontSize: '14px',
            color: this.myColor === 'red' ? '#ff8888' : '#8888ff'
        }).setOrigin(0.5);

        // Opponent info (top)
        this.opponentNameText = this.add.text(180, 20, `⚫ ${this.myColor === 'red' ? 'JOINER (BLACK)' : 'HOST (RED)'}: Waiting...`, {
            fontSize: '14px',
            color: '#888888'
        }).setOrigin(0.5);

        // Turn indicator
        this.turnText = this.add.text(180, 70, '', {
            fontSize: '20px',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Status text
        this.statusText = this.add.text(180, 100, '', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);

        // Resign button
        this.resignButton = this.add.text(300, 10, '🏳️ RESIGN', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 8, y: 4 }
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.resignGame());

        // Back button
        const backBtn = this.add.text(20, 10, '← BACK', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#666666',
            padding: { x: 8, y: 4 }
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.leaveGame());

        // Winner text (initially hidden)
        this.winnerText = this.add.text(180, 300, '', {
            fontSize: '32px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setVisible(false);
    }

    // Replace the setupInitialBoard method with this fixed version

    private setupInitialBoard() {
        // Clear the board first
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                this.board[row][col] = null;
            }
        }

        // Place pieces: Red at bottom (rows 5-7), Black at top (rows 0-2)
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                // Only place on dark squares
                if ((row + col) % 2 === 1) {
                    if (row < 3) {
                        // Top rows - Black pieces
                        this.board[row][col] = 'black';
                        console.log(`📍 Black piece at actual[${row},${col}]`);
                    } else if (row > 4) {
                        // Bottom rows - Red pieces
                        this.board[row][col] = 'red';
                        console.log(`📍 Red piece at actual[${row},${col}]`);
                    }
                }
            }
        }

        console.log('✅ Board initialized with red at bottom (rows 5-7), black at top (rows 0-2)');
    }

    private async initializeGameState() {
        const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
        const snapshot = await get(gameStateRef);

        if (!snapshot.exists()) {
            // Set up initial board
            this.setupInitialBoard();

            // Initialize new game state
            await update(gameStateRef, {
                board: this.board,
                currentPlayer: 'red', // Red goes first
                lastUpdated: Date.now(),
                gameId: this.lobbyId,
                players: [this.uid],
                lastMoveTimestamp: 0
            });

            this.currentPlayer = 'red';
            this.myTurn = (this.myColor === 'red');

            // Get opponent info
            const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
            if (lobby) {
                const opponentId = lobby.playerIds.find(id => id !== this.uid);
                if (opponentId) {
                    this.opponent = lobby.players[opponentId];
                    const opponentRole = this.opponent.color === 'red' ? 'HOST (RED)' : 'JOINER (BLACK)';
                    this.opponentNameText.setText(`⚫ ${opponentRole}: ${this.opponent.displayName} (Top)`);
                }
            }
        } else {
            // Load existing game state
            const state = snapshot.val();
            this.board = state.board;

            // 🛠️ HARD FIX: Ensure board is always 8x8
            for (let row = 0; row < this.BOARD_SIZE; row++) {
                if (!this.board[row]) {
                    this.board[row] = Array(this.BOARD_SIZE).fill(null);
                } else {
                    for (let col = 0; col < this.BOARD_SIZE; col++) {
                        if (this.board[row][col] === undefined) {
                            this.board[row][col] = null;
                        }
                    }
                }
            }
            this.currentPlayer = state.currentPlayer;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.lastProcessedMoveTimestamp = state.lastMoveTimestamp || 0;

            if (state.winner) {
                this.gameWinner = state.winner;
                this.gameActive = false;
                const winnerText = state.winner === this.uid ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
                this.showGameOver(winnerText);
            }

            // Get opponent info
            const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
            if (lobby) {
                const opponentId = lobby.playerIds.find(id => id !== this.uid);
                if (opponentId) {
                    this.opponent = lobby.players[opponentId];
                    const opponentRole = this.opponent.color === 'red' ? 'HOST (RED)' : 'JOINER (BLACK)';
                    this.opponentNameText.setText(`⚫ ${opponentRole}: ${this.opponent.displayName} (Top)`);
                }
            }
        }

        // Render all pieces initially
        this.renderAllPieces();
    }

    private transformRowForDisplay(row: number): number {
        // Convert actual board row to visual row
        if (this.isBoardFlipped) {
            const flipped = this.BOARD_SIZE - 1 - row;
            console.log(`   transformRowForDisplay: actual ${row} -> visual ${flipped} (flipped)`);
            return flipped;
        }
        console.log(`   transformRowForDisplay: actual ${row} -> visual ${row} (not flipped)`);
        return row;
    }

    private transformRowForGame(row: number): number {
        // Convert visual row to actual board row
        if (this.isBoardFlipped) {
            return this.BOARD_SIZE - 1 - row;
        }
        return row;
    }

    private renderAllPieces() {
        console.log('📍 Rendering all pieces...');
        console.log('My color:', this.myColor);
        console.log('Board flipped:', this.isBoardFlipped);

        // Clear existing pieces
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            if (this.pieces[row]) {
                for (let col = 0; col < this.BOARD_SIZE; col++) {
                    const piece = this.pieces[row][col];
                    if (piece) {
                        piece.destroy();
                        this.pieces[row][col] = null;
                    }
                }
            }
        }

        // Create pieces based on board state
        for (let actualRow = 0; actualRow < this.BOARD_SIZE; actualRow++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const pieceType = this.board[actualRow]?.[col] ?? null;
                if (pieceType) {
                    const visualRow = this.transformRowForDisplay(actualRow);
                    this.createPiece(actualRow, visualRow, col, pieceType);
                    console.log(`   Created ${pieceType} piece at actual[${actualRow},${col}] -> visual[${visualRow},${col}]`);
                }
            }
        }

        console.log('✅ All pieces rendered');
    }
    private createPiece(actualRow: number, visualRow: number, col: number, pieceType: string) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

        const isRed = pieceType.includes('red');
        const isKing = pieceType.includes('king');
        const texture = isKing ? (isRed ? 'red_king' : 'black_king') : (isRed ? 'red_normal' : 'black_normal');

        if (!this.textures.exists(texture)) {
            console.error(`❌ Texture not found: ${texture}`);
            return;
        }

        const piece = this.add.image(x, y, texture);
        piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
        piece.setDepth(1);

        (piece as any).actualRow = actualRow;
        (piece as any).col = col;

        const isMyPiece = (isRed && this.myColor === 'red') || (!isRed && this.myColor === 'black');

        if (this.gameActive && isMyPiece) {
            piece.setInteractive({ useHandCursor: true });
            piece.on('pointerdown', () => this.onPieceClick(actualRow, col));
            piece.on('pointerover', () => this.onPieceHover(actualRow, col, true));
            piece.on('pointerout', () => this.onPieceHover(actualRow, col, false));
        }

        // FIXED: Always initialize the row before setting the piece
        if (!this.pieces[actualRow]) {
            this.pieces[actualRow] = Array(this.BOARD_SIZE).fill(null);
        }
        this.pieces[actualRow][col] = piece;
    }

    private subscribeToGameMoves() {
        const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);

        this.gameStateUnsubscribe = onValue(gameStateRef, async (snapshot) => {
            if (!snapshot.exists() || !this.gameActive) return;

            const state = snapshot.val();

            // Check if game has ended
            if (state.winner && state.winner !== this.gameWinner) {
                this.gameWinner = state.winner;
                this.gameActive = false;
                const winnerText = state.winner === this.uid ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
                this.showGameOver(winnerText);
                if (state.winner === this.uid) {
                    await this.awardWinnings();
                }
                return;
            }

            // Check for new move - ONLY process if it's NOT our move
            const lastMoveTimestamp = state.lastMoveTimestamp || 0;
            if (lastMoveTimestamp > this.lastProcessedMoveTimestamp) {
                const lastMove = state.lastMove;

                // ONLY apply if it's not our move (opponent's move)
                if (lastMove && lastMove.playerUid !== this.uid && !this.moveInProgress) {
                    console.log('📥 Opponent move detected:', lastMove);
                    await this.applyOpponentMove(lastMove);
                    this.lastProcessedMoveTimestamp = lastMoveTimestamp;
                } else if (lastMove && lastMove.playerUid === this.uid) {
                    // This was our move, just update the timestamp
                    this.lastProcessedMoveTimestamp = lastMoveTimestamp;
                }
            }

            // ONLY update currentPlayer if it's NOT the result of our own move
            // and we're not in the middle of a move
            if (this.currentPlayer !== state.currentPlayer && !this.moveInProgress) {
                this.currentPlayer = state.currentPlayer;
                this.myTurn = (this.currentPlayer === this.myColor);
                this.updateTurnDisplay();
            }
        });
    }

    private async applyOpponentMove(move: GameMove) {
        this.moveInProgress = true;

        console.log(`🎯 Applying opponent move from [${move.fromRow},${move.fromCol}] to [${move.toRow},${move.toCol}]`);

        // Update board state in memory FIRST
        const piece = this.board[move.fromRow][move.fromCol];
        this.board[move.toRow][move.toCol] = piece;
        this.board[move.fromRow][move.fromCol] = null;

        // Handle capture
        if (move.capturedPiece) {
            this.board[move.capturedPiece.row][move.capturedPiece.col] = null;
        }

        // Handle king promotion
        // Handle king promotion
        let isKingPromotion = move.isKingPromotion || false;
        if (!isKingPromotion && move.piece) {
            if ((move.piece === 'red' && move.toRow === 0) || (move.piece === 'black' && move.toRow === 7)) {
                this.board[move.toRow][move.toCol] = `king_${move.piece}`;
                isKingPromotion = true;

                // Add visual promotion effect for opponent's king
                const visualRow = this.transformRowForDisplay(move.toRow);
                this.addPromotionEffect(visualRow, move.toCol);
            }
        }

        // Animate the opponent's move - this will update visual pieces
        await this.animateMove(
            move.fromRow, move.fromCol,
            move.toRow, move.toCol,
            move.capturedPiece,
            isKingPromotion
        );

        // Update turn
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        this.myTurn = (this.currentPlayer === this.myColor);
        this.updateTurnDisplay();

        // Clear any pending selection
        this.selectedPiece = null;
        this.validMoves = [];
        this.clearHighlights();
        this.removeSelectedGlow();

        console.log(`🎯 Opponent move applied. Now it's ${this.currentPlayer}'s turn. My turn: ${this.myTurn}`);

        // Force a re-render of the pieces to ensure visual sync
        this.renderAllPieces();

        this.moveInProgress = false;

        // Check for win condition
        setTimeout(() => {
            this.checkWinCondition();
        }, 100);
    }
    // Replace the onPieceClick method with this fixed version

    private onPieceClick(actualRow: number, col: number) {
        console.log(`🔍 onPieceClick - actualRow: ${actualRow}, col: ${col}`);
        console.log(`   myTurn: ${this.myTurn}, gameActive: ${this.gameActive}, moveInProgress: ${this.moveInProgress}`);

        if (!this.myTurn || !this.gameActive) {
            this.showStatusMessage('Not your turn!', 1000);
            return;
        }

        const piece = this.board[actualRow][col];
        if (!piece) {
            console.log('   No piece at this position');
            return;
        }

        console.log(`   Piece: ${piece}, myColor: ${this.myColor}`);

        // Check if it's my piece
        const isMyPiece = (piece.includes('red') && this.myColor === 'red') ||
            (piece.includes('black') && this.myColor === 'black');

        if (!isMyPiece) {
            console.log(`   Not my piece! My color: ${this.myColor}`);
            this.showStatusMessage('That\'s not your piece!', 1000);
            return;
        }

        // Clear previous selection
        this.clearHighlights();
        this.removeSelectedGlow();

        // Select the piece
        this.selectedPiece = { row: actualRow, col };
        this.validMoves = this.getValidMoves(actualRow, col);
        console.log(`   Valid moves found: ${this.validMoves.length}`, this.validMoves);
        this.highlightValidMoves();

        // Add glow at visual position
        const visualRow = this.transformRowForDisplay(actualRow);
        this.addSelectedGlow(visualRow, col);

        if (this.validMoves.length === 0) {
            this.showStatusMessage('No valid moves for this piece!', 1000);
        } else {
            this.showStatusMessage(`${this.validMoves.length} valid moves - tap a highlighted square`, 1000);
        }
    }
    // Replace the onSquareClick method

    private onSquareClick(actualRow: number, col: number, visualRow: number) {
        console.log(`🔍 onSquareClick - actualRow: ${actualRow}, col: ${col}, visualRow: ${visualRow}`);
        console.log(`   myTurn: ${this.myTurn}, selectedPiece: ${this.selectedPiece ? `[${this.selectedPiece.row},${this.selectedPiece.col}]` : 'null'}`);

        if (!this.myTurn || !this.selectedPiece || !this.gameActive || this.moveInProgress) {
            console.log('   Cannot move - conditions not met');
            return;
        }

        // Check if this is a valid move
        const isValid = this.validMoves.some(move => move.row === actualRow && move.col === col);
        console.log(`   Is valid move? ${isValid}`);
        console.log(`   Valid moves:`, this.validMoves);

        if (isValid) {
            console.log(`✅ Making move from [${this.selectedPiece.row},${this.selectedPiece.col}] to [${actualRow},${col}]`);
            this.makeMove(this.selectedPiece.row, this.selectedPiece.col, actualRow, col);
        } else {
            console.log('❌ Invalid move!');
            this.showStatusMessage('Invalid move!', 800);
            this.selectedPiece = null;
            this.clearHighlights();
            this.removeSelectedGlow();
        }
    }

    private onPieceHover(actualRow: number, col: number, isOver: boolean) {
        if (!this.gameActive) return;

        const piece = this.pieces[actualRow]?.[col];
        if (!piece) return;

        if (isOver && this.board[actualRow][col]?.includes(this.currentPlayer)) {
            piece.setTint(0xffffaa);
        } else {
            piece.clearTint();
        }
    }

    // Replace the makeMove method with this fixed version

    private async makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        if (this.moveInProgress) return;
        this.moveInProgress = true;

        // Check if this is a capture move
        const isCapture = Math.abs(toRow - fromRow) > 1;
        let capturedPieces: { row: number; col: number }[] = [];

        if (isCapture) {
            // For captures, find ALL pieces along the path that could be captured
            const rowDir = Math.sign(toRow - fromRow);
            const colDir = Math.sign(toCol - fromCol);
            const distance = Math.abs(toRow - fromRow);

            // Check each square along the path for possible captures
            for (let step = 1; step < distance; step++) {
                const checkRow = fromRow + (rowDir * step);
                const checkCol = fromCol + (colDir * step);
                const pieceAtPath = this.board[checkRow][checkCol];

                if (pieceAtPath) {
                    // Found a piece along the path - it's a capture
                    const isOpponent = (this.myColor === 'red') ? pieceAtPath.includes('black') : pieceAtPath.includes('red');
                    if (isOpponent) {
                        capturedPieces.push({ row: checkRow, col: checkCol });
                    }
                }
            }
        }

        // Check for king promotion
        const piece = this.board[fromRow][fromCol];
        let isKingPromotion = false;
        if ((piece === 'red' && toRow === 0) || (piece === 'black' && toRow === 7)) {
            isKingPromotion = true;
        }

        // Create move object (use the first captured piece for backward compatibility)
        const capturedPiece = capturedPieces.length > 0 ? capturedPieces[0] : null;
        const move: GameMove = {
            fromRow,
            fromCol,
            toRow,
            toCol,
            capturedPiece,
            piece: piece!,
            timestamp: Date.now(),
            playerUid: this.uid,
            isKingPromotion
        };

        // Animate the move locally first
        await this.animateMove(fromRow, fromCol, toRow, toCol, capturedPiece, isKingPromotion);

        // Update local board state
        this.board[toRow][toCol] = this.board[fromRow][fromCol];
        this.board[fromRow][fromCol] = null;

        // Remove ALL captured pieces
        for (const cap of capturedPieces) {
            this.board[cap.row][cap.col] = null;
        }

        if (isKingPromotion) {
            this.board[toRow][toCol] = `king_${piece}`;
        }
        const promoted = this.checkKingPromotion(toRow, toCol, piece);
        if (promoted) {
            // Update the board if promotion happened
            this.board[toRow][toCol] = `king_${piece}`;
        }
        // Save move to Firebase
        const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
        const newCurrentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';

        try {
            await update(gameStateRef, {
                board: this.board,
                currentPlayer: newCurrentPlayer,
                lastMove: move,
                lastMoveTimestamp: move.timestamp,
                lastUpdated: Date.now()
            });

            // Update local turn
            this.currentPlayer = newCurrentPlayer;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.updateTurnDisplay();
            this.showStatusMessage('Move sent!', 500);

            // Clear selection after move
            this.selectedPiece = null;
            this.validMoves = [];
            this.clearHighlights();
            this.removeSelectedGlow();

            console.log(`✅ Move completed! Now it's ${this.currentPlayer}'s turn. My turn: ${this.myTurn}`);

            // Check for win condition
            setTimeout(() => {
                this.checkWinCondition();
            }, 100);

        } catch (error) {
            console.error('Error making move:', error);
            this.showStatusMessage('Failed to make move!', 1500);
            const snapshot = await get(gameStateRef);
            if (snapshot.exists()) {
                this.board = snapshot.val().board;
                this.renderAllPieces();
            }
        } finally {
            this.moveInProgress = false;
        }
    }
    private animateMove(fromRow: number, fromCol: number, toRow: number, toCol: number, capturedPiece: any, promoted: boolean): Promise<void> {
        return new Promise((resolve) => {
            const piece = this.pieces[fromRow]?.[fromCol];
            if (!piece) {
                resolve();
                return;
            }

            // Convert actual coordinates to visual coordinates for animation
            const fromVisualRow = this.transformRowForDisplay(fromRow);
            const toVisualRow = this.transformRowForDisplay(toRow);

            const targetX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
            const targetY = this.BOARD_OFFSET_Y + toVisualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

            piece.setDepth(10);

            const movingPiece = piece;

            this.tweens.add({
                targets: movingPiece,
                x: targetX,
                y: targetY,
                duration: 200,
                ease: 'Power2',
                onComplete: () => {
                    // Update pieces array - clear old position
                    if (this.pieces[fromRow]) {
                        this.pieces[fromRow][fromCol] = null;
                    }

                    // Set new position
                    if (!this.pieces[toRow]) {
                        this.pieces[toRow] = [];
                    }
                    this.pieces[toRow][toCol] = movingPiece;

                    movingPiece.setDepth(1);

                    // Update stored actual coordinates
                    (movingPiece as any).actualRow = toRow;

                    // Remove captured piece visually
                    if (capturedPiece) {
                        this.removePiece(capturedPiece.row, capturedPiece.col);
                    }

                    // Handle promotion - update texture
                    if (promoted) {
                        const pieceType = this.board[toRow][toCol];
                        const isRed = pieceType?.includes('red');
                        const newTexture = isRed ? 'red_king' : 'black_king';
                        movingPiece.setTexture(newTexture);
                        movingPiece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
                        this.addPromotionEffect(toVisualRow, toCol);

                        // Also update the board state to ensure it's a king
                        if (!pieceType?.includes('king')) {
                            this.board[toRow][toCol] = `${isRed ? 'red' : 'black'}_king`;
                        }
                    }

                    this.addMoveTrail(fromVisualRow, fromCol, toVisualRow, toCol);
                    resolve();
                }
            });
        });
    }
    private checkKingPromotion(row: number, col: number, piece: string | null): boolean {
        if (piece === 'red' && row === 0) {
            console.log(`👑 Promoting red piece to king at [${row},${col}]`);
            this.promoteToKing(row, col, 'red');
            return true;
        }
        else if (piece === 'black' && row === 7) {
            console.log(`👑 Promoting black piece to king at [${row},${col}]`);
            this.promoteToKing(row, col, 'black');
            return true;
        }
        return false;
    }

    private promoteToKing(row: number, col: number, color: string) {
        const piece = this.pieces[row][col];
        if (!piece) return;

        // Update board state
        this.board[row][col] = `king_${color}`;

        // Update texture immediately
        const newTexture = `${color}_king`;
        if (this.textures.exists(newTexture)) {
            piece.setTexture(newTexture);
            piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);

            // Add a visual effect
            const visualRow = this.transformRowForDisplay(row);
            this.addPromotionEffect(visualRow, col);

            console.log(`✅ ${color} piece promoted to king at [${row},${col}]`);
        } else {
            console.error(`❌ King texture not found: ${newTexture}`);
        }

        this.showStatusMessage(`👑 ${color.toUpperCase()} KING!`, 1500);
    }
    private removePiece(row: number, col: number) {
        const piece = this.pieces[row]?.[col];
        if (piece) {
            this.tweens.add({
                targets: piece,
                scale: 0,
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    piece.destroy();
                    if (this.pieces[row]) {
                        this.pieces[row][col] = null;
                    }
                }
            });
        }
    }

    // src/scenes/checkers/CheckersMultiplayerGameScene.ts
    // Keep all your existing code, just replace the getValidMoves method with this fixed version

    // Make sure your getValidMoves method has good logging

    private getValidMoves(row: number, col: number): { row: number; col: number }[] {
        const moves: { row: number; col: number }[] = [];
        const piece = this.board[row][col];

        if (!piece) return moves;

        const isKing = piece.includes('king');
        const isRed = piece.includes('red');

        console.log(`\n📊 Calculating moves for ${piece} at [${row},${col}]`);
        console.log(`   isKing: ${isKing}, isRed: ${isRed}`);

        // Directions for movement
        let directions: number[][] = [];

        if (isKing) {
            // Kings can move in all 4 directions
            directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            console.log(`   King moves in all 4 directions`);
        } else if (isRed) {
            directions = [[-1, -1], [-1, 1]]; // Red moves up
            console.log(`   Red moves up`);
        } else {
            directions = [[1, -1], [1, 1]]; // Black moves down
            console.log(`   Black moves down`);
        }

        // Check for captures first
        const captureMoves: { row: number; col: number }[] = [];

        for (const [rowDir, colDir] of directions) {
            if (isKing) {
                // For kings, check all possible jumps along the diagonal
                let step = 1;
                let foundCapture = false;

                while (true) {
                    const jumpRow = row + rowDir * (step + 1);
                    const jumpCol = col + colDir * (step + 1);
                    const midRow = row + rowDir * step;
                    const midCol = col + colDir * step;

                    // Check if jump is within board
                    if (jumpRow < 0 || jumpRow >= this.BOARD_SIZE || jumpCol < 0 || jumpCol >= this.BOARD_SIZE) {
                        break;
                    }

                    // Check if landing square is empty
                    if (!this.board[jumpRow][jumpCol]) {
                        const midPiece = this.board[midRow][midCol];
                        // Check if there's a piece to capture
                        if (midPiece) {
                            const isOpponent = isRed ? midPiece.includes('black') : midPiece.includes('red');
                            if (isOpponent) {
                                captureMoves.push({ row: jumpRow, col: jumpCol });
                                foundCapture = true;
                                console.log(`      ✅ Valid king capture: [${jumpRow},${jumpCol}] over [${midRow},${midCol}]`);
                                break; // Can only capture one piece per direction
                            }
                        }
                    }
                    step++;
                }

                if (foundCapture) continue;
            } else {
                // Regular pieces capture logic
                const jumpRow = row + rowDir * 2;
                const jumpCol = col + colDir * 2;
                const midRow = row + rowDir;
                const midCol = col + colDir;

                if (jumpRow >= 0 && jumpRow < this.BOARD_SIZE && jumpCol >= 0 && jumpCol < this.BOARD_SIZE) {
                    if (!this.board[jumpRow][jumpCol]) {
                        const midPiece = this.board[midRow][midCol];
                        if (midPiece) {
                            const isOpponent = isRed ? midPiece.includes('black') : midPiece.includes('red');
                            if (isOpponent) {
                                captureMoves.push({ row: jumpRow, col: jumpCol });
                                console.log(`      ✅ Valid capture: [${jumpRow},${jumpCol}]`);
                            }
                        }
                    }
                }
            }
        }

        // If there are captures, only return those
        if (captureMoves.length > 0) {
            console.log(`   Returning ${captureMoves.length} capture moves`);
            return captureMoves;
        }

        // Regular moves - for kings, can move multiple squares
        for (const [rowDir, colDir] of directions) {
            let steps = 1;

            while (true) {
                const newRow = row + rowDir * steps;
                const newCol = col + colDir * steps;

                // Check if within board
                if (newRow < 0 || newRow >= this.BOARD_SIZE || newCol < 0 || newCol >= this.BOARD_SIZE) {
                    break;
                }

                // Check if square is empty
                if (!this.board[newRow][newCol]) {
                    moves.push({ row: newRow, col: newCol });
                    console.log(`   ✅ Valid regular move: [${newRow},${newCol}]`);
                    steps++;
                } else {
                    // Blocked by another piece
                    console.log(`   ❌ Blocked by piece at [${newRow},${newCol}]`);
                    break;
                }

                // For non-kings, only move one square
                if (!isKing) {
                    break;
                }
            }
        }

        console.log(`   Total valid moves: ${moves.length}`);
        return moves;
    }
    // Also fix the isValidSquare method to ensure it's working correctly
    private isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
    }



    private async checkWinCondition() {
        let redPieces = 0;
        let blackPieces = 0;

        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const piece = this.board[row][col];
                if (!piece) continue;

                if (piece.includes('red')) redPieces++;
                if (piece.includes('black')) blackPieces++;
            }
        }

        let winner = null;

        // 🧩 1. No pieces
        if (redPieces === 0) {
            winner = this.myColor === 'black' ? this.uid : this.opponent?.uid;
        }

        if (blackPieces === 0) {
            winner = this.myColor === 'red' ? this.uid : this.opponent?.uid;
        }

        // 🧠 2. No valid moves
        if (!winner) {
            const opponentColor = this.currentPlayer;
            let hasMoves = false;

            for (let row = 0; row < this.BOARD_SIZE; row++) {
                for (let col = 0; col < this.BOARD_SIZE; col++) {
                    const piece = this.board[row][col];
                    if (!piece || !piece.includes(opponentColor)) continue;

                    const moves = this.getValidMoves(row, col);
                    if (moves.length > 0) {
                        hasMoves = true;
                        break;
                    }
                }
                if (hasMoves) break;
            }

            if (!hasMoves) {
                winner = this.myColor === opponentColor ? this.opponent?.uid : this.uid;
            }
        }

        if (winner) {
            console.log('🏆 WIN DETECTED:', winner);

            const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
            await update(gameStateRef, {
                winner: winner,
                finishedAt: Date.now()
            });

            await checkersMultiplayer.endGame(this.lobbyId, winner);
        }
    }

    private async awardWinnings() {
        try {
            const success = await updateCheckersWalletBalance(this.uid, 2.00, 'win', 'Checkers game victory');
            if (success) {
                this.showStatusMessage('+$2.00 WON!', 2000);
                const winPopup = this.add.text(180, 250, '+$2.00', {
                    fontSize: '36px', color: '#ffff00', fontStyle: 'bold',
                    stroke: '#000000', strokeThickness: 4
                }).setOrigin(0.5);
                this.tweens.add({
                    targets: winPopup, y: 200, alpha: 0, duration: 2000,
                    onComplete: () => winPopup.destroy()
                });
            }
        } catch (error) {
            console.error('Error awarding winnings:', error);
        }
    }

    private async resignGame() {
        const confirmed = confirm('Are you sure you want to resign?');
        if (!confirmed) return;
        this.gameActive = false;
        await checkersMultiplayer.endGame(this.lobbyId, this.opponent?.uid || '');
        this.showGameOver('You resigned');
    }

    private async leaveGame() {
        if (this.gameActive) {
            const confirmed = confirm('Leave the game? This will count as a loss.');
            if (!confirmed) return;
            await this.resignGame();
        }
        this.cleanup();
        this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username, userData: this.userData });
    }

    private highlightValidMoves() {
        console.log(`🎨 Highlighting ${this.validMoves.length} valid moves`);

        this.validMoves.forEach(move => {
            // Find the square at the actual board position
            if (this.squares[move.row] && this.squares[move.row][move.col]) {
                const square = this.squares[move.row][move.col];
                square.setFillStyle(0x44ff44, 0.5);

                // Add pulsing animation
                this.tweens.add({
                    targets: square,
                    alpha: 0.7,
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    onStart: () => {
                        square.setAlpha(0.7);
                    }
                });

                console.log(`   Highlighted square at [${move.row},${move.col}]`);
            }
        });
    }

    private clearHighlights() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                if (this.squares[row] && this.squares[row][col]) {
                    const isPlayable = (row + col) % 2 === 1;
                    if (isPlayable) {
                        this.squares[row][col].setFillStyle(0x8b4513);
                        this.squares[row][col].setAlpha(1);
                        // Stop any ongoing tweens
                        this.tweens.killTweensOf(this.squares[row][col]);
                    }
                }
            }
        }
    }

    private addSelectedGlow(visualRow: number, col: number) {
        this.selectedGlow = this.add.graphics();
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE;
        this.selectedGlow.lineStyle(3, 0xffd700);
        this.selectedGlow.strokeRoundedRect(x, y, this.SQUARE_SIZE, this.SQUARE_SIZE, 5);
        this.tweens.add({ targets: this.selectedGlow, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
    }

    private removeSelectedGlow() {
        if (this.selectedGlow) {
            this.selectedGlow.destroy();
            this.selectedGlow = null;
        }
    }

    private addMoveTrail(visualFromRow: number, fromCol: number, visualToRow: number, toCol: number) {
        const startX = this.BOARD_OFFSET_X + fromCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const startY = this.BOARD_OFFSET_Y + visualFromRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const endX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const endY = this.BOARD_OFFSET_Y + visualToRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const trail = this.add.graphics();
        trail.lineStyle(4, 0xffd700, 0.8);
        trail.lineBetween(startX, startY, endX, endY);
        this.tweens.add({ targets: trail, alpha: 0, duration: 500, onComplete: () => trail.destroy() });
    }

    private addPromotionEffect(visualRow: number, col: number) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const glow = this.add.circle(x, y, 20, 0xffd700, 0.7);
        this.tweens.add({ targets: glow, scale: 1.5, alpha: 0, duration: 500, onComplete: () => glow.destroy() });
    }

    private updateTurnDisplay() {
        if (!this.gameActive) return;
        let text = '', color = '';
        if (this.myTurn) {
            text = this.myColor === 'red' ? '🔴 YOUR TURN (Red)' : '⚫ YOUR TURN (Black)';
            color = '#00ff00';
        } else {
            text = this.currentPlayer === 'red'
                ? `🔴 ${this.opponent?.displayName || 'Opponent'}'s TURN (Red)`
                : `⚫ ${this.opponent?.displayName || 'Opponent'}'s TURN (Black)`;
            color = '#ff6666';
        }
        this.turnText.setText(text);
        this.turnText.setColor(color);
    }

    private showStatusMessage(msg: string, duration: number) {
        this.statusText.setText(msg);
        this.statusText.setVisible(true);
        this.time.delayedCall(duration, () => { if (this.statusText) this.statusText.setVisible(false); });
    }

    private showGameOver(message: string) {
        this.gameActive = false;
        this.winnerText.setText(message);
        this.winnerText.setVisible(true);
        if (message.includes('YOU WIN')) {
            this.addConfetti();
        }
        this.turnText.setVisible(false);
        this.resignButton.disableInteractive();

        const returnBtn = this.add.text(180, 400, 'RETURN TO MENU', {
            fontSize: '20px', color: '#ffffff', backgroundColor: '#4caf50', padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.cleanup();
            this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username, userData: this.userData });
        });
    }

    private addConfetti() {
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
        for (let i = 0; i < 50; i++) {
            const x = Phaser.Math.Between(50, 310);
            const y = Phaser.Math.Between(100, 540);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Phaser.Math.Between(4, 8);
            const confetti = this.add.rectangle(x, y, size, size, color);
            this.tweens.add({
                targets: confetti, y: y + Phaser.Math.Between(100, 200), x: x + Phaser.Math.Between(-50, 50),
                angle: 360, alpha: 0, duration: 2000, onComplete: () => confetti.destroy()
            });
        }
    }

    private cleanup() {
        if (this.gameStateUnsubscribe) this.gameStateUnsubscribe();
        off(ref(db, `games/checkers/${this.lobbyId}`));
        checkersMultiplayer.setPlayerOnline(this.uid, false).catch(err => console.error(err));
        checkersMultiplayer.setPlayerGameStatus(this.uid, false).catch(err => console.error(err));
    }

    shutdown() { this.cleanup(); }
}