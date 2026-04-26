// src/scenes/checkers/CheckersMultiplayerGameScene.ts
//
// Zero Firebase SDK — all DB access goes through the server.
// Changes from the original:
//   1. initializeGameState()   — reads lobby via api.getLobby() instead of Firebase.
//                                Initial board write removed (server owns board state).
//   2. handleInactivityLoss()  — Firebase fallback write removed; socket event is authoritative.
//   3. resignGame()            — Firebase lobby write removed; server handles via socket.
//   4. flushLogs()             — sends log batch to POST /api/logs/:lobbyId/:uid.
//   5. initializeLogsPath()    — no-op (server creates path on first log write).
//   6. cleanupOldLogs()        — calls DELETE /api/logs/:lobbyId/:uid/cleanup.

import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
import { api } from '../../firebase/api';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';

interface CheckersPlayer {
    uid: string; username: string; displayName: string;
    avatar: string; color?: 'red' | 'black'; isReady: boolean;
}

interface GameMove {
    fromRow: number; fromCol: number; toRow: number; toCol: number;
    capturedPiece?: { row: number; col: number } | null;
    piece: string; timestamp: number; playerUid: string; isKingPromotion?: boolean;
}

export class CheckersMultiplayerGameScene extends Phaser.Scene {
    private uid:      string = '';
    private username: string = '';
    private lobbyId:  string = '';
    private myColor:  'red' | 'black' = 'red';
    private opponent: CheckersPlayer | null = null;
    private userData: any = null;

    private socket!: Socket;
    private socketConnected: boolean = false;

    private board:          (string | null)[][] = [];
    private currentPlayer:  'red' | 'black' = 'red';
    private myTurn:         boolean = false;
    private gameActive:     boolean = true;
    private gameWinner:     string | null = null;
    private moveInProgress: boolean = false;

    private pingText!:    Phaser.GameObjects.Text;
    private currentPing:  number = 0;
    private pingHistory:  number[] = [];

    private squares:       Phaser.GameObjects.Rectangle[][] = [];
    private pieces:        (Phaser.GameObjects.Image | null)[][] = [];
    private selectedPiece: { row: number; col: number } | null = null;
    private validMoves:    { row: number; col: number }[] = [];

    private turnText!:         Phaser.GameObjects.Text;
    private opponentNameText!: Phaser.GameObjects.Text;
    private myNameText!:       Phaser.GameObjects.Text;
    private statusText!:       Phaser.GameObjects.Text;
    private resignButton!:     Phaser.GameObjects.Text;
    private winnerText!:       Phaser.GameObjects.Text;

    private gameStartTime:       number = 0;
    private movesCount:          number = 0;
    private piecesCapturedCount: number = 0;
    private kingsMadeCount:      number = 0;

    private readonly BOARD_SIZE     = 8;
    private readonly SQUARE_SIZE    = 38;
    private readonly BOARD_OFFSET_X = 28;
    private readonly BOARD_OFFSET_Y = 110;
    private gameFullyLoaded: boolean = false;

    private inactivityTimer:          number = 0;
    private inactivityCountdown:      number = 0;
    private inactivityText!:          Phaser.GameObjects.Text;
    private readonly INACTIVITY_LIMIT = 15;
    private isInactivityWarningShown: boolean = false;

    private logBuffer:       { message: string; additionalData?: any; timestamp: number }[] = [];
    private logBatchInterval: number = 0;
    private selectedGlow:    Phaser.GameObjects.Graphics | null = null;
    private isBoardFlipped:  boolean = false;

    constructor() { super({ key: 'CheckersMultiplayerGameScene' }); }

    init(data: {
        username: string; uid: string; userData?: any;
        lobbyId: string; lobby?: any; playerColor?: 'red' | 'black';
    }) {
        this.storeLog('🎮 Checkers Multiplayer Game Started:', data);
        this.username = data.username;
        this.uid      = data.uid;
        this.userData = data.userData || null;
        this.lobbyId  = data.lobbyId;

        if (data.playerColor) {
            this.myColor = data.playerColor;
        } else if (data.lobby?.players?.[this.uid]) {
            this.myColor = data.lobby.players[this.uid].color || 'red';
        }

        this.isBoardFlipped = (this.myColor === 'black');
        this.storeLog(`🎨 My color: ${this.myColor} | Flipped: ${this.isBoardFlipped}`);
    }

    async create() {
        this.cameras.main.setBackgroundColor('#2c3e50');
        this.initializeArrays();
        this.createBoard();
        this.createUI();

        this.gameStartTime       = Date.now();
        this.movesCount          = 0;
        this.piecesCapturedCount = 0;
        this.kingsMadeCount      = 0;

        this.startLogBatching();
        await this.initializeGameState();
        this.connectSocket();

        await checkersMultiplayer.setPlayerOnline(this.uid, true);
        await checkersMultiplayer.setPlayerGameStatus(this.uid, true, this.lobbyId);

        this.updateTurnDisplay();
        this.createPingDisplay();
        this.createConnectionQualityIndicator();

        setTimeout(() => { this.startInactivityTimer(); }, 2000);
        this.storeLog('✅ Game scene ready');
        setTimeout(() => { this.gameFullyLoaded = true; }, 8000);
    }

    // =========== SOCKET.IO ===========

    private connectSocket() {
        this.socket = io(SERVER_URL, { transports: ['websocket'] });

        this.socket.on('connect', () => {
            this.socketConnected = true;
            this.storeLog(`🔌 Socket connected: ${this.socket.id}`);
            this.socket.emit('checkers:joinRoom', {
                roomId: this.lobbyId, uid: this.uid,
                username: this.username, color: this.myColor,
            });
        });

        this.socket.on('ping_check', () => { this.socket.emit('pong_check'); });

        this.socket.on('checkers:opponentMove', async (move: GameMove) => {
            this.storeLog('📥 Opponent move received:', move);
            await this.applyOpponentMove(move);
        });

        this.socket.on('checkers:moveConfirmed', (data: { newCurrentColor: 'red' | 'black' }) => {
            this.storeLog('✅ Move confirmed');
            this.currentPlayer = data.newCurrentColor;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.updateTurnDisplay();
            this.moveInProgress = false;
            this.resetInactivityTimer();
            setTimeout(() => this.checkWinCondition(), 100);
        });

        this.socket.on('checkers:moveRejected', (data: { reason?: string }) => {
            this.storeLog('❌ Move rejected:', data);
            this.showStatusMessage('Move rejected!', 1500);
            this.moveInProgress = false;
            this.renderAllPieces();
        });

        this.socket.on('checkers:gameOver', (data: { winnerUid: string; reason?: string }) => {
            this.storeLog('🏆 Game over:', data);
            if (this.gameWinner) return;
            this.gameWinner = data.winnerUid;
            this.gameActive = false;
            const won = data.winnerUid === this.uid;
            let msg = won ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
            if (data.reason === 'inactivity') msg = won ? 'YOU WIN! (Opponent timed out)' : "TIME'S UP! You lost due to inactivity";
            if (data.reason === 'resign')     msg = won ? 'YOU WIN! (Opponent resigned)'  : 'You resigned';
            if (data.reason === 'disconnect') msg = won ? 'OPPONENT DISCONNECTED — YOU WIN!' : 'You disconnected';
            this.showGameOver(msg);
        });

        this.socket.on('checkers:opponentDisconnected', () => {
            this.storeLog('⚠️ Opponent disconnected');
            if (!this.gameActive || this.gameWinner || !this.gameFullyLoaded) return;
            this.gameWinner = this.uid;
            this.gameActive = false;
            this.showGameOver('OPPONENT DISCONNECTED — YOU WIN!');
        });

        this.socket.on('checkers:boardSync', (data: { board: any; currentColor: 'red' | 'black' }) => {
            this.storeLog('🔄 Board sync from server');
            this.board = data.board;
            this.currentPlayer = data.currentColor;
            this.myTurn = (this.currentPlayer === this.myColor);
            this.renderAllPieces();
            this.updateTurnDisplay();
        });

        this.socket.on('disconnect',    () => { this.socketConnected = false; });
        this.socket.on('connect_error', (err) => { this.showStatusMessage('Connection error — retrying...', 2000); });
    }

    // =========== BOARD SETUP ===========

    private initializeArrays() {
        this.board   = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
        this.squares = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
        this.pieces  = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    }

    private createBoard() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const visualRow = row;
                const actualRow = this.isBoardFlipped ? (this.BOARD_SIZE - 1 - row) : row;
                const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE;
                const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE;
                const isPlayable = (actualRow + col) % 2 === 1;

                const square = this.add.rectangle(
                    x + this.SQUARE_SIZE / 2, y + this.SQUARE_SIZE / 2,
                    this.SQUARE_SIZE, this.SQUARE_SIZE,
                    isPlayable ? 0x8b4513 : 0xdeb887
                );
                square.setStrokeStyle(1, 0x000000);
                square.setInteractive({ useHandCursor: true });
                (square as any).actualRow = actualRow;
                (square as any).col       = col;
                (square as any).visualRow = visualRow;
                square.on('pointerdown', () => {
                    this.onSquareClick((square as any).actualRow, (square as any).col, (square as any).visualRow);
                });
                this.squares[actualRow][col] = square;
            }
        }
    }

    private setupInitialBoard() {
        for (let row = 0; row < this.BOARD_SIZE; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                this.board[row][col] = null;
                if ((row + col) % 2 === 1) {
                    if (row < 3)      this.board[row][col] = 'black';
                    else if (row > 4) this.board[row][col] = 'red';
                }
            }
        }
    }

    // FIX 1: reads lobby via api.getLobby() — no Firebase SDK
    private async initializeGameState() {
        const lobby = await checkersMultiplayer.getLobby(this.lobbyId);

        if (!lobby) {
            // New game — set up initial board locally.
            // The server's CheckersGameRoom owns the authoritative board;
            // we'll receive a boardSync if we're reconnecting.
            this.setupInitialBoard();
            this.currentPlayer = 'red';
            this.myTurn = (this.myColor === 'red');
        } else {
            // Check if game is already finished
            if (lobby.status === 'finished' && lobby.winner) {
                this.gameWinner = lobby.winner;
                this.gameActive = false;
                const winnerText = lobby.winner === this.uid ? 'YOU WIN!' : `${this.opponent?.displayName || 'Opponent'} WINS!`;
                this.showGameOver(winnerText);
            }

            // Derive current player from lobby status (socket will correct if wrong)
            this.currentPlayer = 'red';
            this.myTurn = (this.myColor === 'red');

            // Get opponent info from lobby
            const opponentId = lobby.playerIds?.find((id: string) => id !== this.uid);
            if (opponentId && lobby.players?.[opponentId]) {
                this.opponent = lobby.players[opponentId];
            }
        }

        // Get opponent info if not yet set
        if (!this.opponent && lobby) {
            const opponentId = lobby.playerIds?.find((id: string) => id !== this.uid);
            if (opponentId && lobby.players?.[opponentId]) {
                this.opponent = lobby.players[opponentId];
                const opponentRole = this.opponent!.color === 'red' ? 'RED' : 'BLACK';
                this.opponentNameText.setText(`${opponentRole}: ${this.opponent!.displayName} (Top)`);
            }
        } else if (this.opponent) {
            const opponentRole = this.opponent.color === 'red' ? 'RED' : 'BLACK';
            this.opponentNameText.setText(`${opponentRole}: ${this.opponent.displayName} (Top)`);
        }

        this.renderAllPieces();
    }

    // =========== INACTIVITY TIMER ===========

    private startInactivityTimer() {
        if (this.inactivityTimer) clearInterval(this.inactivityTimer);
        this.inactivityCountdown     = this.INACTIVITY_LIMIT;
        this.isInactivityWarningShown = false;
        this.inactivityText.setVisible(false);

        this.inactivityTimer = window.setInterval(() => {
            if (this.myTurn && this.gameActive && !this.moveInProgress && !this.gameWinner) {
                this.inactivityCountdown--;
                if (this.inactivityCountdown <= 10 && !this.isInactivityWarningShown) {
                    this.isInactivityWarningShown = true;
                    this.inactivityText.setVisible(true);
                }
                if (this.inactivityCountdown <= 10) {
                    const color = this.inactivityCountdown <= 3 ? '#ff6600'
                                : this.inactivityCountdown <= 5 ? '#ff0000' : '#ffaa00';
                    this.inactivityText.setText(`⏰ Move in: ${this.inactivityCountdown}s`).setColor(color).setVisible(true);
                }
                if (this.inactivityCountdown <= 0) {
                    clearInterval(this.inactivityTimer); this.inactivityTimer = 0;
                    this.inactivityText.setVisible(false);
                    this.handleInactivityLoss();
                }
            } else if (!this.myTurn && this.inactivityCountdown !== this.INACTIVITY_LIMIT) {
                this.resetInactivityTimer();
            }
        }, 1000);
    }

    private resetInactivityTimer() {
        if (this.inactivityTimer) { clearInterval(this.inactivityTimer); this.inactivityTimer = 0; }
        this.inactivityCountdown     = this.INACTIVITY_LIMIT;
        this.isInactivityWarningShown = false;
        this.inactivityText.setVisible(false);
    }

    // FIX 2: Firebase fallback write removed — socket event is authoritative
    private async handleInactivityLoss() {
        if (!this.gameActive || this.gameWinner) return;
        this.storeLog('⏰ Inactivity loss — notifying server');
        this.gameActive = false;
        this.socket.emit('checkers:inactivity', { roomId: this.lobbyId, uid: this.uid });
        this.showGameOver("TIME'S UP! You lost due to inactivity");
        this.cleanup();
    }

    // =========== UI ===========

    private createUI() {
        this.inactivityText = this.add.text(180, 550, '', {
            fontSize: '14px', color: '#ffaa00', backgroundColor: '#000000', padding: { x: 8, y: 4 },
        }).setOrigin(0.5).setVisible(false);

        this.myNameText = this.add.text(180, 620,
            `${this.myColor === 'red' ? '🔴 RED' : '⚫ BLACK'}: ${this.username} (Bottom)`, {
            fontSize: '14px', color: this.myColor === 'red' ? '#ff8888' : '#8888ff',
        }).setOrigin(0.5);

        this.opponentNameText = this.add.text(180, 20,
            `${this.myColor === 'red' ? 'JOINER (BLACK)' : 'HOST (RED)'}: Waiting...`, {
            fontSize: '14px', color: '#888888',
        }).setOrigin(0.5);

        this.turnText   = this.add.text(180, 70,  '', { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5);
        this.statusText = this.add.text(180, 100, '', { fontSize: '14px', color: '#ffff00'   }).setOrigin(0.5);

        this.resignButton = this.add.text(280, 30, '🏳️ RESIGN', {
            fontSize: '14px', color: '#ffffff', backgroundColor: '#f44336', padding: { x: 8, y: 4 },
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.resignGame());

        this.add.text(20, 30, '← BACK', {
            fontSize: '14px', color: '#ffffff', backgroundColor: '#666666', padding: { x: 8, y: 4 },
        }).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.leaveGame());

        this.winnerText = this.add.text(180, 300, '', {
            fontSize: '32px', color: '#ffd700', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setVisible(false);
    }

    // =========== RENDERING ===========

    private transformRowForDisplay(row: number): number {
        return this.isBoardFlipped ? (this.BOARD_SIZE - 1 - row) : row;
    }

    private renderAllPieces() {
        for (let row = 0; row < this.BOARD_SIZE; row++)
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                this.pieces[row]?.[col]?.destroy();
                if (this.pieces[row]) this.pieces[row][col] = null;
            }

        for (let actualRow = 0; actualRow < this.BOARD_SIZE; actualRow++)
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                const pieceType = this.board[actualRow]?.[col] ?? null;
                if (pieceType) this.createPiece(actualRow, this.transformRowForDisplay(actualRow), col, pieceType);
            }
    }

    private createPiece(actualRow: number, visualRow: number, col: number, pieceType: string) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const isRed  = pieceType.includes('red');
        const isKing = pieceType.includes('king');
        const texture = isKing ? (isRed ? 'red_king' : 'black_king') : (isRed ? 'red_normal' : 'black_normal');

        if (!this.textures.exists(texture)) { this.storeLog(`❌ Missing texture: ${texture}`); return; }

        const piece = this.add.image(x, y, texture).setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8).setDepth(1);
        (piece as any).actualRow = actualRow;
        (piece as any).col = col;

        const isMyPiece = (isRed && this.myColor === 'red') || (!isRed && this.myColor === 'black');
        if (this.gameActive && isMyPiece) {
            piece.setInteractive({ useHandCursor: true });
            piece.on('pointerdown', () => this.onPieceClick(actualRow, col));
            piece.on('pointerover',  () => { if (this.board[actualRow][col]?.includes(this.currentPlayer)) piece.setTint(0xffffaa); });
            piece.on('pointerout',   () => piece.clearTint());
        }

        if (!this.pieces[actualRow]) this.pieces[actualRow] = Array(this.BOARD_SIZE).fill(null);
        this.pieces[actualRow][col] = piece;
    }

    // =========== INPUT ===========

    private onPieceClick(actualRow: number, col: number) {
        if (!this.myTurn || !this.gameActive) { this.showStatusMessage('Not your turn!', 1000); return; }
        const piece = this.board[actualRow][col];
        if (!piece) return;
        const isMyPiece = (piece.includes('red') && this.myColor === 'red') || (piece.includes('black') && this.myColor === 'black');
        if (!isMyPiece) { this.showStatusMessage("That's not your piece!", 1000); return; }

        this.clearHighlights(); this.removeSelectedGlow();
        this.selectedPiece = { row: actualRow, col };
        this.validMoves    = this.getValidMoves(actualRow, col);
        this.highlightValidMoves();
        this.addSelectedGlow(this.transformRowForDisplay(actualRow), col);

        this.showStatusMessage(
            this.validMoves.length === 0 ? 'No valid moves for this piece!' : `${this.validMoves.length} valid moves`, 1000
        );
    }

    private onSquareClick(actualRow: number, col: number, _visualRow: number) {
        if (!this.myTurn || !this.selectedPiece || !this.gameActive || this.moveInProgress) return;

        const isValid = this.validMoves.some(m => m.row === actualRow && m.col === col);
        if (isValid) {
            this.makeMove(this.selectedPiece.row, this.selectedPiece.col, actualRow, col);
        } else {
            this.selectedPiece = null; this.clearHighlights(); this.removeSelectedGlow();
        }
    }

    // =========== MOVE EXECUTION ===========

    private async makeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        if (this.moveInProgress) return;
        this.moveInProgress = true;
        this.movesCount++;
        this.resetInactivityTimer();

        const piece      = this.board[fromRow][fromCol]!;
        const isCapture  = Math.abs(toRow - fromRow) > 1;
        let capturedPiece: { row: number; col: number } | null = null;

        if (isCapture) {
            const rowDir = Math.sign(toRow - fromRow);
            const colDir = Math.sign(toCol - fromCol);
            for (let step = 1; step < Math.abs(toRow - fromRow); step++) {
                const cr = fromRow + rowDir * step;
                const cc = fromCol + colDir * step;
                const p  = this.board[cr][cc];
                if (p && (this.myColor === 'red' ? p.includes('black') : p.includes('red'))) {
                    capturedPiece = { row: cr, col: cc };
                    this.piecesCapturedCount++;
                    break;
                }
            }
        }

        const isKingPromotion = (piece === 'red' && toRow === 0) || (piece === 'black' && toRow === 7);
        if (isKingPromotion) this.kingsMadeCount++;

        const move: GameMove = {
            fromRow, fromCol, toRow, toCol, capturedPiece,
            piece, timestamp: Date.now(), playerUid: this.uid, isKingPromotion,
        };

        await this.animateMove(fromRow, fromCol, toRow, toCol, capturedPiece, isKingPromotion);

        this.board[toRow][toCol]     = isKingPromotion ? `king_${piece}` : piece;
        this.board[fromRow][fromCol] = null;
        if (capturedPiece) this.board[capturedPiece.row][capturedPiece.col] = null;

        this.selectedPiece = null; this.validMoves = [];
        this.clearHighlights(); this.removeSelectedGlow();

        if (this.socketConnected) {
            this.socket.emit('checkers:makeMove', { roomId: this.lobbyId, move });
        } else {
            this.moveInProgress = false;
            this.currentPlayer  = this.currentPlayer === 'red' ? 'black' : 'red';
            this.myTurn         = (this.currentPlayer === this.myColor);
            this.updateTurnDisplay();
        }

        await this.syncBoardToVisuals();
        this.showStatusMessage('Move sent!', 500);
    }

    private async applyOpponentMove(move: GameMove) {
        this.moveInProgress = true;

        const piece           = this.board[move.fromRow][move.fromCol];
        this.board[move.toRow][move.toCol]     = piece;
        this.board[move.fromRow][move.fromCol] = null;
        if (move.capturedPiece) this.board[move.capturedPiece.row][move.capturedPiece.col] = null;

        let isKingPromotion = move.isKingPromotion || false;
        if (!isKingPromotion && move.piece) {
            if ((move.piece === 'red' && move.toRow === 0) || (move.piece === 'black' && move.toRow === 7)) {
                this.board[move.toRow][move.toCol] = `king_${move.piece}`;
                isKingPromotion = true;
                this.addPromotionEffect(this.transformRowForDisplay(move.toRow), move.toCol);
            }
        }

        await this.animateMove(move.fromRow, move.fromCol, move.toRow, move.toCol, move.capturedPiece, isKingPromotion);

        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        this.myTurn        = (this.currentPlayer === this.myColor);
        this.updateTurnDisplay();

        this.selectedPiece = null; this.validMoves = [];
        this.clearHighlights(); this.removeSelectedGlow();

        this.renderAllPieces();
        this.moveInProgress = false;

        if (this.myTurn) { this.resetInactivityTimer(); this.startInactivityTimer(); }
        setTimeout(() => this.checkWinCondition(), 100);
    }

    // =========== ANIMATION ===========

    private animateMove(fromRow: number, fromCol: number, toRow: number, toCol: number, capturedPiece: any, promoted: boolean): Promise<void> {
        return new Promise((resolve) => {
            const piece = this.pieces[fromRow]?.[fromCol];
            if (!piece) { resolve(); return; }

            const toVisualRow   = this.transformRowForDisplay(toRow);
            const fromVisualRow = this.transformRowForDisplay(fromRow);
            const targetX = this.BOARD_OFFSET_X + toCol   * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
            const targetY = this.BOARD_OFFSET_Y + toVisualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

            piece.setDepth(10);
            const movingPiece = piece;

            this.tweens.add({
                targets: movingPiece, x: targetX, y: targetY, duration: 200, ease: 'Power2',
                onComplete: () => {
                    if (this.pieces[fromRow]) this.pieces[fromRow][fromCol] = null;
                    if (!this.pieces[toRow])  this.pieces[toRow] = [];
                    this.pieces[toRow][toCol] = movingPiece;
                    movingPiece.setDepth(1);
                    (movingPiece as any).actualRow = toRow;

                    if (capturedPiece) this.removePiece(capturedPiece.row, capturedPiece.col);

                    if (promoted) {
                        const pt     = this.board[toRow][toCol];
                        const isRed  = pt?.includes('red') ?? movingPiece.texture.key.includes('red');
                        movingPiece.setTexture(isRed ? 'red_king' : 'black_king')
                                   .setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
                        this.addPromotionEffect(toVisualRow, toCol);
                        if (!pt?.includes('king')) this.board[toRow][toCol] = `${isRed ? 'red' : 'black'}_king`;
                    }

                    this.addMoveTrail(fromVisualRow, fromCol, toVisualRow, toCol);
                    resolve();
                },
            });
        });
    }

    // =========== GAME LOGIC ===========

    private getValidMoves(row: number, col: number): { row: number; col: number }[] {
        const piece  = this.board[row][col];
        if (!piece) return [];
        const isKing = piece.includes('king');
        const isRed  = piece.includes('red');

        const captures = this.getCaptureMoves(row, col, piece, isKing, isRed);
        if (captures.length > 0) return captures;

        const dirs = isKing ? [[-1,-1],[-1,1],[1,-1],[1,1]] : isRed ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
        const moves: { row: number; col: number }[] = [];

        for (const [rd, cd] of dirs) {
            let steps = 1;
            while (true) {
                const nr = row + rd * steps, nc = col + cd * steps;
                if (nr < 0 || nr >= this.BOARD_SIZE || nc < 0 || nc >= this.BOARD_SIZE) break;
                if (!this.board[nr][nc]) { moves.push({ row: nr, col: nc }); steps++; }
                else break;
                if (!isKing) break;
            }
        }
        return moves;
    }

    private getCaptureMoves(row: number, col: number, _piece: string, isKing: boolean, isRed: boolean): { row: number; col: number }[] {
        const captures: { row: number; col: number }[] = [];
        for (const [rd, cd] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            if (isKing) {
                for (let step = 1; step < this.BOARD_SIZE; step++) {
                    const midR = row + rd * step, midC = col + cd * step;
                    const jmpR = row + rd * (step + 1), jmpC = col + cd * (step + 1);
                    if (jmpR < 0 || jmpR >= this.BOARD_SIZE || jmpC < 0 || jmpC >= this.BOARD_SIZE) break;
                    const midP = this.board[midR]?.[midC];
                    if (!midP) continue;
                    const isOpp = isRed ? midP.includes('black') : midP.includes('red');
                    if (!isOpp) break;
                    if (!this.board[jmpR]?.[jmpC]) captures.push({ row: jmpR, col: jmpC });
                    break;
                }
            } else {
                const midR = row + rd, midC = col + cd;
                const jmpR = row + rd * 2, jmpC = col + cd * 2;
                if (jmpR < 0 || jmpR >= this.BOARD_SIZE || jmpC < 0 || jmpC >= this.BOARD_SIZE) continue;
                const midP = this.board[midR]?.[midC];
                if (!midP) continue;
                const isOpp = isRed ? midP.includes('black') : midP.includes('red');
                if (isOpp && !this.board[jmpR]?.[jmpC]) captures.push({ row: jmpR, col: jmpC });
            }
        }
        return captures;
    }

    private validateMove(fromRow: number, fromCol: number, _toRow: number, _toCol: number): boolean {
        const piece = this.board[fromRow][fromCol];
        if (!piece) return false;
        return (piece.includes('red') && this.myColor === 'red') || (piece.includes('black') && this.myColor === 'black');
    }

    private async checkWinCondition() {
        if (this.gameWinner || !this.gameActive) return;
        let red = 0, black = 0;
        for (let r = 0; r < this.BOARD_SIZE; r++)
            for (let c = 0; c < this.BOARD_SIZE; c++) {
                const p = this.board[r][c];
                if (p?.includes('red'))   red++;
                if (p?.includes('black')) black++;
            }

        let winner: string | null = null;
        if (red   === 0) winner = this.myColor === 'black' ? this.uid : (this.opponent?.uid ?? null);
        if (black === 0) winner = this.myColor === 'red'   ? this.uid : (this.opponent?.uid ?? null);

        if (!winner) {
            let hasMoves = false;
            outer: for (let r = 0; r < this.BOARD_SIZE; r++)
                for (let c = 0; c < this.BOARD_SIZE; c++) {
                    const p = this.board[r][c];
                    if (!p || !p.includes(this.currentPlayer)) continue;
                    if (this.getValidMoves(r, c).length > 0) { hasMoves = true; break outer; }
                }
            if (!hasMoves) winner = this.currentPlayer === this.myColor ? (this.opponent?.uid ?? null) : this.uid;
        }

        if (winner) {
            this.gameWinner = winner;
            this.socket.emit('checkers:declareWin', { roomId: this.lobbyId, winnerUid: winner });
        }
    }

    private removePiece(row: number, col: number) {
        const piece = this.pieces[row]?.[col];
        if (!piece) return;
        this.tweens.add({ targets: piece, scale: 0, alpha: 0, duration: 200,
            onComplete: () => { piece.destroy(); if (this.pieces[row]) this.pieces[row][col] = null; }
        });
    }

    private async syncBoardToVisuals() {
        for (let r = 0; r < this.BOARD_SIZE; r++)
            for (let c = 0; c < this.BOARD_SIZE; c++) {
                const onBoard  = this.board[r][c];
                const onScreen = this.pieces[r]?.[c];
                if (onBoard && !onScreen)  this.createPiece(r, this.transformRowForDisplay(r), c, onBoard);
                else if (!onBoard && onScreen) { onScreen.destroy(); this.pieces[r][c] = null; }
            }
    }

    // =========== GAME ACTIONS ===========

    // FIX 3: Firebase lobby write removed — server handles via checkers:resign socket event
    private async resignGame() {
        if (!confirm('Are you sure you want to resign?')) return;
        this.gameActive = false;
        this.socket.emit('checkers:resign', { roomId: this.lobbyId, uid: this.uid });
        this.showGameOver('You resigned');
    }

    private async leaveGame() {
        if (this.gameActive) {
            if (!confirm('Leave the game? This will count as a loss.')) return;
            await this.resignGame();
        }
        this.cleanup();
        this.scene.start('CheckersStartScene', { uid: this.uid, username: this.username, userData: this.userData });
    }

    // =========== PING ===========

    private createPingDisplay() {
        this.pingText = this.add.text(340, 10, 'Ping: --- ms', {
            fontSize: '10px', color: '#00ff00', backgroundColor: '#000000', padding: { x: 4, y: 2 },
        }).setOrigin(1, 0);

        this.socket.on('ping_check', () => {
            const start = Date.now();
            this.socket.emit('pong_check');
            const ping = Date.now() - start;
            this.pingHistory.push(ping);
            if (this.pingHistory.length > 5) this.pingHistory.shift();
            const avg = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
            this.currentPing = avg;
            const color = avg > 500 ? '#ff0000' : avg > 300 ? '#ff6600' : avg > 150 ? '#ffff00' : '#00ff00';
            this.pingText.setText(`Ping: ${avg} ms`).setColor(color);
        });
    }

    private createConnectionQualityIndicator() {
        const dot = this.add.circle(20, 20, 8, 0x00ff00);
        this.time.addEvent({
            delay: 1000, loop: true,
            callback: () => {
                if (!this.gameActive) return;
                const c = this.currentPing > 500 ? 0xff0000 : this.currentPing > 300 ? 0xff6600 : this.currentPing > 150 ? 0xffff00 : 0x00ff00;
                dot.setFillStyle(c);
            },
        });
    }

    // =========== UI HELPERS ===========

    private highlightValidMoves() {
        this.validMoves.forEach(({ row, col }) => {
            const sq = this.squares[row]?.[col];
            if (!sq) return;
            sq.setFillStyle(0x44ff44, 0.5);
            this.tweens.add({ targets: sq, alpha: 0.7, duration: 500, yoyo: true, repeat: -1 });
        });
    }

    private clearHighlights() {
        for (let r = 0; r < this.BOARD_SIZE; r++)
            for (let c = 0; c < this.BOARD_SIZE; c++) {
                const sq = this.squares[r]?.[c];
                if (sq && (r + c) % 2 === 1) {
                    sq.setFillStyle(0x8b4513).setAlpha(1);
                    this.tweens.killTweensOf(sq);
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

    private removeSelectedGlow() { this.selectedGlow?.destroy(); this.selectedGlow = null; }

    private addMoveTrail(vfr: number, fc: number, vtr: number, tc: number) {
        const sx = this.BOARD_OFFSET_X + fc * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const sy = this.BOARD_OFFSET_Y + vfr * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const ex = this.BOARD_OFFSET_X + tc * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const ey = this.BOARD_OFFSET_Y + vtr * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const t  = this.add.graphics().setDepth(2);
        t.lineStyle(4, 0xffd700, 0.8); t.lineBetween(sx, sy, ex, ey);
        this.tweens.add({ targets: t, alpha: 0, duration: 500, onComplete: () => t.destroy() });
    }

    private addPromotionEffect(visualRow: number, col: number) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + visualRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const g = this.add.circle(x, y, 20, 0xffd700, 0.7);
        this.tweens.add({ targets: g, scale: 1.5, alpha: 0, duration: 500, onComplete: () => g.destroy() });
    }

    private updateTurnDisplay() {
        if (!this.gameActive) return;
        if (this.myTurn) {
            const label = this.myColor === 'red' ? '🔴 YOUR TURN (Red)' : '⚫ YOUR TURN (Black)';
            this.turnText.setText(label).setColor('#00ff00');
        } else {
            const label = this.currentPlayer === 'red'
                ? `🔴 ${this.opponent?.displayName || 'Opponent'}'s TURN (Red)`
                : `⚫ ${this.opponent?.displayName || 'Opponent'}'s TURN (Black)`;
            this.turnText.setText(label).setColor('#ff6666');
        }
    }

    private showStatusMessage(msg: string, duration: number) {
        this.statusText.setText(msg).setVisible(true);
        this.time.delayedCall(duration, () => this.statusText?.setVisible(false));
    }

    private showGameOver(message: string) {
        if (this.inactivityTimer) { clearInterval(this.inactivityTimer); this.inactivityTimer = 0; }
        this.inactivityText.setVisible(false);
        this.gameActive = false;
        const playerWon    = message.includes('YOU WIN');
        const winnerColor: 'red' | 'black' = playerWon ? this.myColor : (this.myColor === 'red' ? 'black' : 'red');
        this.scene.start('CheckersGameOverScene', {
            userData: this.userData, username: this.username, uid: this.uid,
            winner: winnerColor, playerColor: this.myColor,
            piecesCaptured: this.piecesCapturedCount, kingsMade: this.kingsMadeCount,
            moves: this.movesCount, gameDuration: Math.floor((Date.now() - this.gameStartTime) / 1000),
        });
    }

    // =========== LOGGING — FIX 4,5,6: no Firebase SDK ========================

    private storeLog(message: string, additionalData?: any) {
        if (!message || typeof message !== 'string') return;
        let safeData = null;
        if (additionalData !== undefined) {
            try { safeData = this.sanitizeForFirebase(additionalData); }
            catch { safeData = { error: 'Could not serialize' }; }
        }
        this.logBuffer.push({ message, additionalData: safeData, timestamp: Date.now() });
        if (this.logBuffer.length >= 50) this.flushLogs();
    }

    private startLogBatching() {
        this.logBatchInterval = window.setInterval(() => {
            if (this.logBuffer.length > 0) this.flushLogs();
        }, 10_000);
    }

    // FIX 4: sends logs to REST API instead of Firebase
    private async flushLogs() {
        if (this.logBuffer.length === 0) return;
        const batch = [...this.logBuffer];
        this.logBuffer = [];
        try {
            await api.flushLogs(this.lobbyId, this.uid, batch);
            if (Math.random() < 0.2) this.cleanupOldLogs();
        } catch (err) {
            console.error('Failed to flush logs:', err);
            this.logBuffer = [...batch, ...this.logBuffer];
        }
    }

    private sanitizeForFirebase(data: any, seen = new WeakSet()): any {
        if (data === undefined || data === null) return null;
        if (typeof data !== 'object') return data;
        if (seen.has(data)) return '[Circular]';
        seen.add(data);
        if (Array.isArray(data)) return data.map(i => this.sanitizeForFirebase(i, seen));
        const out: any = {};
        for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = this.sanitizeForFirebase(v, seen);
        return Object.keys(out).length > 0 ? out : null;
    }

    // FIX 5: no-op — server creates the log path on first write
    private async initializeLogsPath() { /* server handles path creation */ }

    // FIX 6: uses REST API instead of Firebase
    private async cleanupOldLogs() {
        try { await api.cleanupLogs(this.lobbyId, this.uid, 1000); }
        catch (err) { this.storeLog('Error cleaning up logs:', err); }
    }

    private flushLogsOnShutdown() {
        if (this.logBatchInterval) { clearInterval(this.logBatchInterval); this.logBatchInterval = 0; }
        if (this.logBuffer.length > 0) this.flushLogs();
    }

    // =========== CLEANUP ===========

    private cleanup() {
        this.flushLogsOnShutdown();
        if (this.inactivityTimer) { clearInterval(this.inactivityTimer); this.inactivityTimer = 0; }
        this.socket?.disconnect();
        checkersMultiplayer.setPlayerOnline(this.uid, false).catch(console.error);
        checkersMultiplayer.setPlayerGameStatus(this.uid, false).catch(console.error);
    }

    shutdown() { this.cleanup(); }
}