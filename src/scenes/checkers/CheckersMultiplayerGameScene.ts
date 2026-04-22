// src/scenes/checkers/CheckersMultiplayerGameScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
import { ref, get, update, set } from 'firebase/database';
import { db } from '../../firebase/init';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';

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
    capturedPiece?: { row: number; col: number } | null;
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

    // Socket.IO (replaces Firebase real-time listeners)
    private socket!: Socket;
    private socketConnected: boolean = false;

    // Game state
    private board: (string | null)[][] = [];
    private currentPlayer: 'red' | 'black' = 'red';
    private myTurn: boolean = false;
    private gameActive: boolean = true;
    private gameWinner: string | null = null;
    private moveInProgress: boolean = false;

    // Ping (via socket, same pattern as BallCrush)
    private pingText!: Phaser.GameObjects.Text;
    private currentPing: number = 0;
    private pingHistory: number[] = [];

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

    // Game stats
    private gameStartTime: number = 0;
    private movesCount: number = 0;
    private piecesCapturedCount: number = 0;
    private kingsMadeCount: number = 0;

    // Constants
    private readonly BOARD_SIZE = 8;
    private readonly SQUARE_SIZE = 38;
    private readonly BOARD_OFFSET_X = 28;
    private readonly BOARD_OFFSET_Y = 110;
    private gameFullyLoaded: boolean = false;

    // Inactivity timer
    private inactivityTimer: number = 0;
    private inactivityCountdown: number = 0;
    private inactivityText!: Phaser.GameObjects.Text;
    private readonly INACTIVITY_LIMIT = 15;
    private isInactivityWarningShown: boolean = false;

    // Visual effects
    private logBuffer: { message: string; additionalData?: any; timestamp: number }[] = [];
    private logBatchInterval: number = 0;
    private selectedGlow: Phaser.GameObjects.Graphics | null = null;

    // Board flip for black player
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
        this.storeLog('🎮 Checkers Multiplayer Game Started:', data);

        this.username = data.username;
        this.uid = data.uid;
        this.userData = data.userData || null;
        this.lobbyId = data.lobbyId;

        if (data.playerColor) {
            this.myColor = data.playerColor;
        } else if (data.lobby && data.lobby.players && data.lobby.players[this.uid]) {
            this.myColor = data.lobby.players[this.uid].color || 'red';
        }

        this.isBoardFlipped = (this.myColor === 'black');

        this.storeLog(`🎨 My color: ${this.myColor === 'red' ? 'RED (HOST)' : 'BLACK (JOINER)'}`);
        this.storeLog(`🔄 Board flipped: ${this.isBoardFlipped}`);
    }

    async create() {
        this.cameras.main.setBackgroundColor('#2c3e50');

        this.initializeArrays();
        this.createBoard();
        this.createUI();

        this.gameStartTime = Date.now();
        this.movesCount = 0;
        this.piecesCapturedCount = 0;
        this.kingsMadeCount = 0;

        await this.initializeLogsPath();
        this.startLogBatching();

        // Load opponent info and initial board from Firebase (one-time read only)
        await this.initializeGameState();

        // Connect socket — all real-time events go through here
        this.connectSocket();

        // Set player online status in Firebase
        await checkersMultiplayer.setPlayerOnline(this.uid, true);
        await checkersMultiplayer.setPlayerGameStatus(this.uid, true, this.lobbyId);

        this.updateTurnDisplay();
        this.createPingDisplay();
        this.createConnectionQualityIndicator();

        setTimeout(() => {
            this.startInactivityTimer();
            this.storeLog('⏰ Inactivity timer started');
        }, 2000);

        this.storeLog('✅ Game scene ready');
        setTimeout(() => { this.gameFullyLoaded = true; }, 8000);
    }

    // =========== SOCKET.IO CONNECTION ===========

    private connectSocket() {
        this.socket = io(SERVER_URL, { transports: ['websocket'] });

        this.socket.on('connect', () => {
            this.socketConnected = true;
            this.storeLog(`🔌 Socket connected: ${this.socket.id}`);

            // Join the checkers game room
            this.socket.emit('checkers:joinRoom', {
                roomId: this.lobbyId,
                uid: this.uid,
                username: this.username,
                color: this.myColor,
            });
        });

        // Ping (same pattern as BallCrush)
        this.socket.on('ping_check', () => {
            this.socket.emit('pong_check');
        });

        // Opponent made a move — apply it locally
        this.socket.on('checkers:opponentMove', async (move: GameMove) => {
            this.storeLog('📥 Opponent move received via socket:', move);
            await this.applyOpponentMove(move);
        });

        // Our move was accepted by the server
        this.socket.on('checkers:moveConfirmed', (data: { newCurrentColor: 'red' | 'black' }) => {
            this.storeLog('✅ Move confirmed by server');
            this.currentPlayer = data.newCurrentColor;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.updateTurnDisplay();
            this.moveInProgress = false;

            // Reset inactivity since it's now opponent's turn
            this.resetInactivityTimer();

            setTimeout(() => this.checkWinCondition(), 100);
        });

        // Move was rejected (invalid, out of turn, etc.)
        this.socket.on('checkers:moveRejected', (data: { reason?: string }) => {
            this.storeLog('❌ Move rejected by server:', data);
            this.showStatusMessage('Move rejected!', 1500);
            this.moveInProgress = false;
            // Re-render to ensure visuals match actual state
            this.renderAllPieces();
        });

        // Game over signal from server
        this.socket.on('checkers:gameOver', (data: { winnerUid: string; reason?: string }) => {
            this.storeLog('🏆 Game over received:', data);
            if (this.gameWinner) return; // already handled
            this.gameWinner = data.winnerUid;
            this.gameActive = false;
            const won = data.winnerUid === this.uid;
            let msg = won ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
            if (data.reason === 'inactivity') msg = won ? 'YOU WIN! (Opponent timed out)' : 'TIME\'S UP! You lost due to inactivity';
            if (data.reason === 'resign') msg = won ? 'YOU WIN! (Opponent resigned)' : 'You resigned';
            if (data.reason === 'disconnect') msg = won ? 'OPPONENT DISCONNECTED — YOU WIN!' : 'You disconnected';
            this.showGameOver(msg);
        });

        // Opponent disconnected from socket
        this.socket.on('checkers:opponentDisconnected', () => {
            this.storeLog('⚠️ Opponent socket disconnected');
            if (!this.gameActive || this.gameWinner || !this.gameFullyLoaded) return;
            this.gameWinner = this.uid;
            this.gameActive = false;
            this.showGameOver('OPPONENT DISCONNECTED — YOU WIN!');
        });

        // Server sent current board state (for resync on reconnect)
        this.socket.on('checkers:boardSync', (data: { board: any; currentColor: 'red' | 'black' }) => {
            this.storeLog('🔄 Board sync received from server');
            this.board = data.board;
            this.currentPlayer = data.currentColor;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.renderAllPieces();
            this.updateTurnDisplay();
        });

        this.socket.on('disconnect', () => {
            this.socketConnected = false;
            this.storeLog('🔌 Socket disconnected');
        });

        this.socket.on('connect_error', (err) => {
            this.storeLog('Socket connection error:', err.message);
            this.showStatusMessage('Connection error — retrying...', 2000);
        });
    }

    // =========== BOARD INITIALIZATION ===========

    private initializeArrays() {
        this.board = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
        this.squares = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
        this.pieces = Array(this.BOARD_SIZE);
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            this.pieces[i] = Array(this.BOARD_SIZE).fill(null);
        }
    }

    private createBoard() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
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

    private setupInitialBoard() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                this.board[row][col] = null;
            }
        }

        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                if ((row + col) % 2 === 1) {
                    if (row < 3) {
                        this.board[row][col] = 'black';
                    } else if (row > 4) {
                        this.board[row][col] = 'red';
                    }
                }
            }
        }

        this.storeLog('✅ Board initialized with red at bottom (rows 5-7), black at top (rows 0-2)');
    }

    private async initializeGameState() {
        // One-time Firebase read to get lobby/opponent info and initial board
        const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
        const snapshot = await get(gameStateRef);

        if (!snapshot.exists()) {
            this.setupInitialBoard();

            // Write initial board to Firebase (once, for reconnect recovery)
            await update(gameStateRef, {
                board: this.board,
                currentPlayer: 'red',
                lastUpdated: Date.now(),
                gameId: this.lobbyId,
                players: [this.uid],
                lastMoveTimestamp: 0
            });

            this.currentPlayer = 'red';
            this.myTurn = (this.myColor === 'red');
        } else {
            const state = snapshot.val();
            this.board = state.board;

            // Ensure board is always 8x8
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

            if (state.winner) {
                this.gameWinner = state.winner;
                this.gameActive = false;
                const winnerText = state.winner === this.uid ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
                this.showGameOver(winnerText);
            }
        }

        // Get opponent info
        const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
        if (lobby) {
            const opponentId = lobby.playerIds.find((id: string) => id !== this.uid);
            if (opponentId) {
                this.opponent = lobby.players[opponentId];
                const opponentRole = this.opponent!.color === 'red' ? 'RED' : 'BLACK';
                this.opponentNameText.setText(`⚫ ${opponentRole}: ${this.opponent!.displayName} (Top)`);
            }
        }

        this.renderAllPieces();
    }

    // =========== INACTIVITY TIMER ===========

    private startInactivityTimer() {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer);
        }

        this.inactivityCountdown = this.INACTIVITY_LIMIT;
        this.isInactivityWarningShown = false;
        this.inactivityText.setVisible(false);

        this.inactivityTimer = window.setInterval(() => {
            if (this.myTurn && this.gameActive && !this.moveInProgress && !this.gameWinner) {
                this.inactivityCountdown--;

                if (this.inactivityCountdown <= 10 && !this.isInactivityWarningShown) {
                    this.isInactivityWarningShown = true;
                    this.inactivityText.setVisible(true);
                    this.showStatusMessage(`⚠️ ${this.inactivityCountdown} seconds to move!`, 1000);
                }

                if (this.inactivityCountdown <= 10) {
                    let color = '#ffaa00';
                    if (this.inactivityCountdown <= 5) color = '#ff0000';
                    if (this.inactivityCountdown <= 3) color = '#ff6600';

                    this.inactivityText.setText(`⏰ Move in: ${this.inactivityCountdown}s`);
                    this.inactivityText.setColor(color);
                    this.inactivityText.setVisible(true);
                }

                if (this.inactivityCountdown <= 0) {
                    this.storeLog(`⏰ Player inactive for ${this.INACTIVITY_LIMIT} seconds`);
                    clearInterval(this.inactivityTimer);
                    this.inactivityTimer = 0;
                    this.inactivityText.setVisible(false);
                    this.handleInactivityLoss();
                }
            } else {
                if (this.inactivityCountdown !== this.INACTIVITY_LIMIT) {
                    this.resetInactivityTimer();
                }
            }
        }, 1000);
    }

    private resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer);
            this.inactivityTimer = 0;
        }
        this.inactivityCountdown = this.INACTIVITY_LIMIT;
        this.isInactivityWarningShown = false;
        this.inactivityText.setVisible(false);
    }

    private async handleInactivityLoss() {
        if (!this.gameActive || this.gameWinner) return;

        this.storeLog(`⏰ Inactivity loss — notifying server`);
        this.gameActive = false;

        // Tell server we timed out (server will emit checkers:gameOver to both players)
        this.socket.emit('checkers:inactivity', { roomId: this.lobbyId, uid: this.uid });

        // Also update Firebase directly as a fallback
        if (this.opponent?.uid) {
            try {
                const gameStateRef = ref(db, `games/checkers/${this.lobbyId}`);
                await update(gameStateRef, {
                    winner: this.opponent.uid,
                    finishedAt: Date.now(),
                    winnerColor: this.myColor === 'red' ? 'black' : 'red',
                    winReason: 'inactivity'
                });
                await checkersMultiplayer.endGame(this.lobbyId, this.opponent.uid);
            } catch (error) {
                this.storeLog('Error recording inactivity loss:', error);
            }
        }

        this.showGameOver('TIME\'S UP! You lost due to inactivity');
        this.cleanup();
    }

    // =========== UI ===========

    private createUI() {
        this.inactivityText = this.add.text(180, 550, '', {
            fontSize: '14px',
            color: '#ffaa00',
            backgroundColor: '#000000',
            padding: { x: 8, y: 4 }
        }).setOrigin(0.5).setVisible(false);

        const myColorText = this.myColor === 'red' ? '🔴 RED' : '⚫ BLACK';
        this.myNameText = this.add.text(180, 620, `${myColorText}: ${this.username} (Bottom)`, {
            fontSize: '14px',
            color: this.myColor === 'red' ? '#ff8888' : '#8888ff'
        }).setOrigin(0.5);

        this.opponentNameText = this.add.text(180, 20, `⚫ ${this.myColor === 'red' ? 'JOINER (BLACK)' : 'HOST (RED)'}: Waiting...`, {
            fontSize: '14px',
            color: '#888888'
        }).setOrigin(0.5);

        this.turnText = this.add.text(180, 70, '', {
            fontSize: '20px',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.statusText = this.add.text(180, 100, '', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);

        this.resignButton = this.add.text(280, 30, '🏳️ RESIGN', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 8, y: 4 }
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.resignGame());

        const backBtn = this.add.text(20, 30, '← BACK', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#666666',
            padding: { x: 8, y: 4 }
        })
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.leaveGame());

        this.winnerText = this.add.text(180, 300, '', {
            fontSize: '32px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setVisible(false);
    }

    // =========== RENDERING ===========

    private transformRowForDisplay(row: number): number {
        if (this.isBoardFlipped) {
            return this.BOARD_SIZE - 1 - row;
        }
        return row;
    }

    private transformRowForGame(row: number): number {
        if (this.isBoardFlipped) {
            return this.BOARD_SIZE - 1 - row;
        }
        return row;
    }

    private renderAllPieces() {
        this.storeLog('📍 Rendering all pieces...');

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

        for (let actualRow = 0; actualRow < this.BOARD_SIZE; actualRow++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const pieceType = this.board[actualRow]?.[col] ?? null;
                if (pieceType) {
                    const visualRow = this.transformRowForDisplay(actualRow);
                    this.createPiece(actualRow, visualRow, col, pieceType);
                }
            }
        }

        this.storeLog('✅ All pieces rendered');
    }

    private createPiece(actualRow: number, visualRow: number, col: number, pieceType: string) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

        const isRed = pieceType.includes('red');
        const isKing = pieceType.includes('king');
        const texture = isKing ? (isRed ? 'red_king' : 'black_king') : (isRed ? 'red_normal' : 'black_normal');

        if (!this.textures.exists(texture)) {
            this.storeLog(`❌ Texture not found: ${texture}`);
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

        if (!this.pieces[actualRow]) {
            this.pieces[actualRow] = Array(this.BOARD_SIZE).fill(null);
        }
        this.pieces[actualRow][col] = piece;
    }

    // =========== INPUT HANDLING ===========

    private onPieceClick(actualRow: number, col: number) {
        this.storeLog(`🔍 onPieceClick - actualRow: ${actualRow}, col: ${col}`);

        if (!this.myTurn || !this.gameActive) {
            this.showStatusMessage('Not your turn!', 1000);
            return;
        }

        const piece = this.board[actualRow][col];
        if (!piece) return;

        const isMyPiece = (piece.includes('red') && this.myColor === 'red') ||
            (piece.includes('black') && this.myColor === 'black');

        if (!isMyPiece) {
            this.showStatusMessage('That\'s not your piece!', 1000);
            return;
        }

        this.clearHighlights();
        this.removeSelectedGlow();

        this.selectedPiece = { row: actualRow, col };
        this.validMoves = this.getValidMoves(actualRow, col);
        this.highlightValidMoves();

        const visualRow = this.transformRowForDisplay(actualRow);
        this.addSelectedGlow(visualRow, col);

        if (this.validMoves.length === 0) {
            this.showStatusMessage('No valid moves for this piece!', 1000);
        } else {
            this.showStatusMessage(`${this.validMoves.length} valid moves - tap a highlighted square`, 1000);
        }
    }

    private onSquareClick(actualRow: number, col: number, visualRow: number) {
        this.storeLog(`🔍 onSquareClick - actualRow: ${actualRow}, col: ${col}`);

        if (!this.myTurn || !this.selectedPiece || !this.gameActive || this.moveInProgress) {
            return;
        }

        if (!this.validateMove(this.selectedPiece.row, this.selectedPiece.col, actualRow, col)) {
            this.selectedPiece = null;
            this.clearHighlights();
            this.removeSelectedGlow();
            return;
        }

        const isValid = this.validMoves.some(move => move.row === actualRow && move.col === col);

        if (isValid) {
            this.storeLog(`✅ Making move from [${this.selectedPiece.row},${this.selectedPiece.col}] to [${actualRow},${col}]`);
            this.makeMove(this.selectedPiece.row, this.selectedPiece.col, actualRow, col);
        } else {
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

    // =========== MOVE EXECUTION ===========

    private async makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        if (this.moveInProgress) return;

        this.resetInactivityTimer();

        this.moveInProgress = true;
        this.movesCount++;

        const isCapture = Math.abs(toRow - fromRow) > 1;
        let capturedPieces: { row: number; col: number }[] = [];

        if (isCapture) {
            const rowDir = Math.sign(toRow - fromRow);
            const colDir = Math.sign(toCol - fromCol);
            const distance = Math.abs(toRow - fromRow);

            for (let step = 1; step < distance; step++) {
                const checkRow = fromRow + (rowDir * step);
                const checkCol = fromCol + (colDir * step);
                const pieceAtPath = this.board[checkRow][checkCol];

                if (pieceAtPath) {
                    const isOpponent = (this.myColor === 'red') ? pieceAtPath.includes('black') : pieceAtPath.includes('red');
                    if (isOpponent) {
                        capturedPieces.push({ row: checkRow, col: checkCol });
                        this.piecesCapturedCount++;
                    }
                }
            }
        }

        const piece = this.board[fromRow][fromCol];
        let isKingPromotion = false;
        if ((piece === 'red' && toRow === 0) || (piece === 'black' && toRow === 7)) {
            isKingPromotion = true;
            this.kingsMadeCount++;
        }

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

        // Animate locally first for responsiveness
        await this.animateMove(fromRow, fromCol, toRow, toCol, capturedPiece, isKingPromotion);

        // Update local board state
        this.board[toRow][toCol] = this.board[fromRow][fromCol];
        this.board[fromRow][fromCol] = null;

        for (const cap of capturedPieces) {
            this.board[cap.row][cap.col] = null;
        }

        if (isKingPromotion) {
            this.board[toRow][toCol] = `king_${piece}`;
        }

        // Clear selection
        this.selectedPiece = null;
        this.validMoves = [];
        this.clearHighlights();
        this.removeSelectedGlow();

        // Send move to server via socket
        // moveInProgress stays true until checkers:moveConfirmed arrives
        if (this.socketConnected) {
            this.socket.emit('checkers:makeMove', {
                roomId: this.lobbyId,
                move,
            });
            this.storeLog(`📤 Move sent to server via socket`);
        } else {
            // Fallback: if socket is down, release the lock
            this.storeLog('⚠️ Socket not connected — releasing move lock');
            this.moveInProgress = false;
            const newCurrentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
            this.currentPlayer = newCurrentPlayer;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.updateTurnDisplay();
        }

        await this.syncBoardToVisuals();
        this.showStatusMessage('Move sent!', 500);
    }

    private async applyOpponentMove(move: GameMove) {
        this.moveInProgress = true;

        this.storeLog(`🎯 Applying opponent move from [${move.fromRow},${move.fromCol}] to [${move.toRow},${move.toCol}]`);

        // Update board state in memory
        const piece = this.board[move.fromRow][move.fromCol];
        this.board[move.toRow][move.toCol] = piece;
        this.board[move.fromRow][move.fromCol] = null;

        if (move.capturedPiece) {
            this.board[move.capturedPiece.row][move.capturedPiece.col] = null;
        }

        let isKingPromotion = move.isKingPromotion || false;
        if (!isKingPromotion && move.piece) {
            if ((move.piece === 'red' && move.toRow === 0) || (move.piece === 'black' && move.toRow === 7)) {
                this.board[move.toRow][move.toCol] = `king_${move.piece}`;
                isKingPromotion = true;

                const visualRow = this.transformRowForDisplay(move.toRow);
                this.addPromotionEffect(visualRow, move.toCol);
            }
        }

        await this.animateMove(
            move.fromRow, move.fromCol,
            move.toRow, move.toCol,
            move.capturedPiece,
            isKingPromotion
        );

        // Turn switches
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        this.myTurn = (this.currentPlayer === this.myColor);
        this.updateTurnDisplay();

        this.selectedPiece = null;
        this.validMoves = [];
        this.clearHighlights();
        this.removeSelectedGlow();

        this.storeLog(`🎯 Opponent move applied. Now it's ${this.currentPlayer}'s turn. My turn: ${this.myTurn}`);

        this.renderAllPieces();
        this.moveInProgress = false;

        // Start inactivity timer now that it's my turn
        if (this.myTurn) {
            this.resetInactivityTimer();
            this.startInactivityTimer();
        }

        setTimeout(() => this.checkWinCondition(), 100);
    }

    // =========== ANIMATION ===========

    private animateMove(fromRow: number, fromCol: number, toRow: number, toCol: number, capturedPiece: any, promoted: boolean): Promise<void> {
        return new Promise((resolve) => {
            const piece = this.pieces[fromRow]?.[fromCol];
            if (!piece) {
                resolve();
                return;
            }

            const toVisualRow = this.transformRowForDisplay(toRow);
            const fromVisualRow = this.transformRowForDisplay(fromRow);

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
                    if (this.pieces[fromRow]) {
                        this.pieces[fromRow][fromCol] = null;
                    }
                    if (!this.pieces[toRow]) {
                        this.pieces[toRow] = [];
                    }
                    this.pieces[toRow][toCol] = movingPiece;
                    movingPiece.setDepth(1);
                    (movingPiece as any).actualRow = toRow;

                    if (capturedPiece) {
                        this.removePiece(capturedPiece.row, capturedPiece.col);
                    }

                    if (promoted) {
                        const pieceType = this.board[toRow][toCol];
                        const isRed = pieceType?.includes('red');
                        const newTexture = isRed ? 'red_king' : 'black_king';
                        movingPiece.setTexture(newTexture);
                        movingPiece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
                        this.addPromotionEffect(toVisualRow, toCol);

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

    // =========== GAME LOGIC ===========

    private getValidMoves(row: number, col: number): { row: number; col: number }[] {
        const moves: { row: number; col: number }[] = [];
        const piece = this.board[row][col];

        if (!piece) return moves;

        const isKing = piece.includes('king');
        const isRed = piece.includes('red');

        this.storeLog(`\n📊 Calculating moves for ${piece} at [${row},${col}]`);

        let directions: number[][] = [];
        if (isKing) {
            directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        } else if (isRed) {
            directions = [[-1, -1], [-1, 1]];
        } else {
            directions = [[1, -1], [1, 1]];
        }

        const captureMoves = this.getCaptureMoves(row, col, piece, isKing, isRed);
        if (captureMoves.length > 0) {
            return captureMoves;
        }

        for (const [rowDir, colDir] of directions) {
            let steps = 1;
            while (true) {
                const newRow = row + rowDir * steps;
                const newCol = col + colDir * steps;

                if (newRow < 0 || newRow >= this.BOARD_SIZE || newCol < 0 || newCol >= this.BOARD_SIZE) break;

                if (!this.board[newRow][newCol]) {
                    moves.push({ row: newRow, col: newCol });
                    steps++;
                } else {
                    break;
                }

                if (!isKing) break;
            }
        }

        return moves;
    }

    private getCaptureMoves(row: number, col: number, piece: string, isKing: boolean, isRed: boolean): { row: number; col: number }[] {
        const captureMoves: { row: number; col: number }[] = [];
        const allDirections = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

        for (const [rowDir, colDir] of allDirections) {
            if (isKing) {
                let step = 1;
                let foundCapture = false;

                while (true) {
                    const jumpRow = row + rowDir * (step + 1);
                    const jumpCol = col + colDir * (step + 1);
                    const midRow = row + rowDir * step;
                    const midCol = col + colDir * step;

                    if (jumpRow < 0 || jumpRow >= this.BOARD_SIZE || jumpCol < 0 || jumpCol >= this.BOARD_SIZE) break;

                    if (!this.board[jumpRow][jumpCol]) {
                        const midPiece = this.board[midRow][midCol];
                        if (midPiece) {
                            const isOpponent = isRed ? midPiece.includes('black') : midPiece.includes('red');
                            if (isOpponent) {
                                captureMoves.push({ row: jumpRow, col: jumpCol });
                                foundCapture = true;
                                break;
                            }
                        }
                    }
                    step++;
                }
                if (foundCapture) continue;
            } else {
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
                            }
                        }
                    }
                }
            }
        }

        return captureMoves;
    }

    private isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
    }

    private validateMove(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
        if (!this.board[fromRow][fromCol]) return false;
        if (this.board[toRow][toCol]) return false;

        const piece = this.board[fromRow][fromCol];
        const isMyPiece = (piece.includes('red') && this.myColor === 'red') ||
            (piece.includes('black') && this.myColor === 'black');
        return isMyPiece;
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

        if (redPieces === 0) {
            winner = this.myColor === 'black' ? this.uid : this.opponent?.uid;
        }
        if (blackPieces === 0) {
            winner = this.myColor === 'red' ? this.uid : this.opponent?.uid;
        }

        if (!winner) {
            const opponentColor = this.currentPlayer;
            let hasMoves = false;

            for (let row = 0; row < this.BOARD_SIZE; row++) {
                for (let col = 0; col < this.BOARD_SIZE; col++) {
                    const piece = this.board[row][col];
                    if (!piece || !piece.includes(opponentColor)) continue;
                    const moves = this.getValidMoves(row, col);
                    if (moves.length > 0) { hasMoves = true; break; }
                }
                if (hasMoves) break;
            }

            if (!hasMoves) {
                winner = this.myColor === opponentColor ? this.opponent?.uid : this.uid;
            }
        }

        if (winner) {
            this.storeLog('🏆 WIN DETECTED locally:', winner);
            // Notify server — it will broadcast checkers:gameOver to both players
            this.socket.emit('checkers:declareWin', {
                roomId: this.lobbyId,
                winnerUid: winner,
            });
        }
    }

    private checkKingPromotion(row: number, col: number, piece: string | null): boolean {
        if (piece === 'red' && row === 0) {
            this.promoteToKing(row, col, 'red');
            return true;
        } else if (piece === 'black' && row === 7) {
            this.promoteToKing(row, col, 'black');
            return true;
        }
        return false;
    }

    private promoteToKing(row: number, col: number, color: string) {
        const piece = this.pieces[row][col];
        if (!piece) return;

        this.kingsMadeCount++;
        this.board[row][col] = `king_${color}`;

        const newTexture = `${color}_king`;
        if (this.textures.exists(newTexture)) {
            piece.setTexture(newTexture);
            piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);

            const visualRow = this.transformRowForDisplay(row);
            this.addPromotionEffect(visualRow, col);
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

    private async syncBoardToVisuals() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const pieceOnBoard = this.board[row][col];
                const pieceVisual = this.pieces[row]?.[col];

                if (pieceOnBoard && !pieceVisual) {
                    const visualRow = this.transformRowForDisplay(row);
                    this.createPiece(row, visualRow, col, pieceOnBoard);
                } else if (!pieceOnBoard && pieceVisual) {
                    pieceVisual.destroy();
                    this.pieces[row][col] = null;
                }
            }
        }
    }

    // =========== GAME ACTIONS ===========

    private async resignGame() {
        const confirmed = confirm('Are you sure you want to resign?');
        if (!confirmed) return;

        this.gameActive = false;

        // Tell server via socket
        this.socket.emit('checkers:resign', { roomId: this.lobbyId, uid: this.uid });

        // Firebase fallback
        await update(ref(db, `lobbies/${this.lobbyId}`), {
            status: 'finished',
            winner: this.opponent?.uid || '',
            finishedAt: Date.now()
        });
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
            this.storeLog('Error awarding winnings:', error);
        }
    }

    // =========== PING DISPLAY ===========

    private createPingDisplay() {
        this.pingText = this.add.text(340, 10, 'Ping: --- ms', {
            fontSize: '10px',
            color: '#00ff00',
            backgroundColor: '#000000',
            padding: { x: 4, y: 2 }
        }).setOrigin(1, 0);

        // Socket-based ping measurement (same as BallCrush)
        this.socket.on('ping_check', () => {
            const start = Date.now();
            this.socket.emit('pong_check');
            const ping = Date.now() - start;

            this.pingHistory.push(ping);
            if (this.pingHistory.length > 5) this.pingHistory.shift();
            const avg = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
            this.currentPing = avg;

            let color = '#00ff00';
            if (avg > 150) color = '#ffff00';
            if (avg > 300) color = '#ff6600';
            if (avg > 500) color = '#ff0000';

            this.pingText.setText(`Ping: ${avg} ms`);
            this.pingText.setColor(color);
        });
    }

    private createConnectionQualityIndicator() {
        const qualityDot = this.add.circle(20, 20, 8, 0x00ff00);

        this.time.addEvent({
            delay: 1000,
            callback: () => {
                if (!this.gameActive) return;

                let color = 0x00ff00;
                let tooltip = 'Excellent connection';

                if (this.currentPing > 150) { color = 0xffff00; tooltip = 'Fair connection'; }
                if (this.currentPing > 300) { color = 0xff6600; tooltip = 'Poor connection'; }
                if (this.currentPing > 500) { color = 0xff0000; tooltip = 'Very poor connection'; }

                qualityDot.setFillStyle(color);
                qualityDot.setInteractive({ useHandCursor: true });
                qualityDot.on('pointerover', () => {
                    this.showStatusMessage(`Connection: ${tooltip} (${this.currentPing}ms)`, 1500);
                });
            },
            loop: true
        });
    }

    // =========== UI HELPERS ===========

    private highlightValidMoves() {
        this.validMoves.forEach(move => {
            if (this.squares[move.row] && this.squares[move.row][move.col]) {
                const square = this.squares[move.row][move.col];
                square.setFillStyle(0x44ff44, 0.5);
                this.tweens.add({
                    targets: square,
                    alpha: 0.7,
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                });
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
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer);
            this.inactivityTimer = 0;
        }
        this.inactivityText.setVisible(false);
        this.gameActive = false;

        const playerWon = message.includes('YOU WIN');
        let winnerColor: 'red' | 'black';
        if (playerWon) {
            winnerColor = this.myColor;
        } else {
            winnerColor = this.myColor === 'red' ? 'black' : 'red';
        }

        this.scene.start('CheckersGameOverScene', {
            userData: this.userData,
            username: this.username,
            uid: this.uid,
            winner: winnerColor,
            playerColor: this.myColor,
            piecesCaptured: this.piecesCapturedCount,
            kingsMade: this.kingsMadeCount,
            moves: this.movesCount,
            gameDuration: Math.floor((Date.now() - this.gameStartTime) / 1000)
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

    // =========== LOGGING ===========

    private storeLog(message: string, additionalData?: any) {
        if (!message || typeof message !== 'string') return;

        let safeData = null;
        if (additionalData !== undefined) {
            try {
                safeData = this.sanitizeForFirebase(additionalData);
            } catch (e) {
                safeData = { error: 'Data could not be serialized' };
            }
        }

        this.logBuffer.push({ message, additionalData: safeData, timestamp: Date.now() });

        if (this.logBuffer.length >= 50) {
            this.flushLogs();
        }
    }

    private startLogBatching() {
        console.log('Starting log batching...');
        this.logBatchInterval = window.setInterval(() => {
            if (this.logBuffer.length > 0) {
                this.flushLogs();
            }
        }, 10000);
    }

    private async flushLogs() {
        if (this.logBuffer.length === 0) return;

        const logsToSend = [...this.logBuffer];
        this.logBuffer = [];

        try {
            const updates: any = {};
            for (const log of logsToSend) {
                const logKey = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
                const sanitizedAdditionalData = this.sanitizeForFirebase(log.additionalData);
                const logEntry = {
                    timestamp: log.timestamp,
                    userId: this.uid,
                    lobbyId: this.lobbyId,
                    message: log.message,
                    myColor: this.myColor,
                    currentPlayer: this.currentPlayer,
                    myTurn: this.myTurn,
                    gameActive: this.gameActive,
                    additionalData: sanitizedAdditionalData || null
                };
                updates[`game_logs/${this.lobbyId}/${this.uid}/${logKey}`] = logEntry;
            }

            const { update: fbUpdate, ref: fbRef } = await import('firebase/database');
            await fbUpdate(fbRef(db), updates);

            if (Math.random() < 0.2) {
                this.cleanupOldLogs();
            }
        } catch (error) {
            console.error('Failed to flush logs:', error);
            this.logBuffer = [...logsToSend, ...this.logBuffer];
        }
    }

    private sanitizeForFirebase(data: any, seen = new WeakSet()): any {
        if (data === undefined || data === null) return null;
        if (typeof data !== 'object') return data;
        if (seen.has(data)) return '[Circular Reference]';
        seen.add(data);

        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeForFirebase(item, seen));
        }

        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined) continue;
            sanitized[key] = this.sanitizeForFirebase(value, seen);
        }
        return Object.keys(sanitized).length > 0 ? sanitized : null;
    }

    private async initializeLogsPath() {
        try {
            const logsRef = ref(db, `game_logs/${this.lobbyId}/${this.uid}`);
            const snapshot = await get(logsRef);

            if (!snapshot.exists()) {
                await set(logsRef, {
                    initialized: true,
                    createdAt: Date.now(),
                    gameId: this.lobbyId,
                    playerId: this.uid,
                    playerColor: this.myColor
                });
            }
        } catch (error) {
            console.error('Failed to initialize logs path:', error);
        }
    }

    private async cleanupOldLogs() {
        try {
            const logsRef = ref(db, `game_logs/${this.lobbyId}/${this.uid}`);
            const snapshot = await get(logsRef);

            if (snapshot.exists()) {
                const logs = snapshot.val();
                const logKeys = Object.keys(logs).sort();

                if (logKeys.length > 1000) {
                    const toDelete = logKeys.slice(0, logKeys.length - 1000);
                    const deleteUpdates: any = {};
                    for (const key of toDelete) {
                        deleteUpdates[`game_logs/${this.lobbyId}/${this.uid}/${key}`] = null;
                    }
                    const { update: fbUpdate, ref: fbRef } = await import('firebase/database');
                    await fbUpdate(fbRef(db), deleteUpdates);
                }
            }
        } catch (error) {
            this.storeLog('Error cleaning up logs:', error);
        }
    }

    private flushLogsOnShutdown() {
        if (this.logBatchInterval) {
            clearInterval(this.logBatchInterval);
            this.logBatchInterval = 0;
        }
        if (this.logBuffer.length > 0) {
            this.flushLogs();
        }
    }

    // =========== CLEANUP ===========

    private cleanup() {
        this.flushLogsOnShutdown();

        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer);
            this.inactivityTimer = 0;
        }

        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }

        checkersMultiplayer.setPlayerOnline(this.uid, false).catch(err => console.error(err));
        checkersMultiplayer.setPlayerGameStatus(this.uid, false).catch(err => console.error(err));
    }

    shutdown() { this.cleanup(); }
}