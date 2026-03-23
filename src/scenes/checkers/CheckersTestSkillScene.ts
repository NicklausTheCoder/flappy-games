// src/scenes/checkers/CheckersTestSkillScene.ts
import Phaser from 'phaser';
import { CheckersUserData } from '../../firebase/checkersService';

export class CheckersTestSkillScene extends Phaser.Scene {
    // Add these properties to your CheckersGameScene class
    private gameStartTime: number = 0;
    private movesCount: number = 0;
    private piecesCapturedCount: number = 0;
    private kingsMadeCount: number = 0;
    private username: string = '';
    private uid: string = '';
    private userData: CheckersUserData | null = null;
    
    // Game state
    private board: (string | null)[][] = [];
    private currentPlayer: 'red' | 'black' = 'red';
    private selectedPiece: { row: number; col: number } | null = null;
    private validMoves: { row: number; col: number }[] = [];
    private gameActive: boolean = true;

    // REMOVED AI properties - now for 2 players
    // private isAIPlaying: boolean = true;
    // private aiThinking: boolean = false;
    // private aiMoveDelay: number = 800;

    // Visual elements
    private squares: Phaser.GameObjects.Rectangle[][] = [];
    private pieces: (Phaser.GameObjects.Image | null)[][] = [];
    private crowns: (Phaser.GameObjects.Image | null)[][] = [];
    private turnText!: Phaser.GameObjects.Text;
    private messageText!: Phaser.GameObjects.Text;
    private player1NameText!: Phaser.GameObjects.Text;
    private player2NameText!: Phaser.GameObjects.Text;

    // Constants for mobile (360x640)
    private readonly BOARD_SIZE = 8;
    private readonly SQUARE_SIZE = 38;
    private readonly BOARD_OFFSET_X = 28;
    private readonly BOARD_OFFSET_Y = 110;

    constructor() {
        super({ key: 'CheckersTestSkillScene' });
    }

    init(data: { username: string; uid: string; userData: CheckersUserData }) {
        console.log('♟️ Checkers 2-Player game started for:', data.username);

        if (!data || !data.username || !data.uid) {
            console.error('❌ No username or UID provided to CheckersTestSkillScene');
            this.scene.start('CheckersStartScene');
            return;
        }

        this.username = data.username;
        this.uid = data.uid;
        this.userData = data.userData;

        // Initialize counters
        this.gameStartTime = Date.now();
        this.movesCount = 0;
        this.piecesCapturedCount = 0;
        this.kingsMadeCount = 0;

        console.log('👤 Playing as Red (Bottom):', this.username);
        console.log('👤 Black player (Top): Player 2');
    }

    preload() {
        // Load checker piece images
        this.load.image('red_normal', 'assets/checkers/red_normal.jpg');
        this.load.image('red_king', 'assets/checkers/red_king.jpg');
        this.load.image('black_normal', 'assets/checkers/black_normal.jpg');
        this.load.image('black_king', 'assets/checkers/black_king.jpg');
    }

    create() {
        console.log('🎮 Creating 2-player checkers game...');

        // Set background
        this.cameras.main.setBackgroundColor('#2a2a2a');

        // Initialize empty board
        this.initializeBoard();

        // Create the checkerboard
        this.createBoard();

        // Place pieces
        this.placePieces();

        // Create UI
        this.createUI();

        // Setup input
        this.setupInput();

        // Show current turn
        this.updateTurnText();

        console.log('✅ 2-Player checkers game created');
    }

    private initializeBoard() {
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

    private placePieces() {
        console.log('📍 Placing pieces on board...');

        // Place black pieces (top of board) - Player 2 (Black)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                if ((row + col) % 2 === 1) {
                    this.createPiece(row, col, 'black', false);
                    this.board[row][col] = 'black';
                    console.log(`   Black piece at [${row},${col}]`);
                }
            }
        }

        // Place red pieces (bottom of board) - Player 1 (Red)
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < this.BOARD_SIZE; col++) {
                if ((row + col) % 2 === 1) {
                    this.createPiece(row, col, 'red', false);
                    this.board[row][col] = 'red';
                    console.log(`   Red piece at [${row},${col}]`);
                }
            }
        }
    }

    private createPiece(row: number, col: number, color: 'red' | 'black', isKing: boolean) {
        const x = this.BOARD_OFFSET_X + col * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const y = this.BOARD_OFFSET_Y + row * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

        const texture = isKing ? `${color}_king` : `${color}_normal`;
        const piece = this.add.image(x, y, texture);
        piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);

        // Make pieces interactive for BOTH colors now
        piece.setInteractive({ useHandCursor: true });
        piece.on('pointerdown', () => this.onPieceClick(row, col));
        piece.on('pointerover', () => this.onPieceHover(row, col, true));
        piece.on('pointerout', () => this.onPieceHover(row, col, false));

        this.pieces[row][col] = piece;
        this.crowns[row][col] = null;
    }

    private createUI() {
        // Turn indicator
        this.turnText = this.add.text(
            180,
            20,
            `${this.currentPlayer === 'red' ? '🔴 RED' : '⚫ BLACK'} Player's Turn`,
            { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }
        ).setOrigin(0.5);

        // Player names
        this.player1NameText = this.add.text(
            180,
            620,
            `🔴 ${this.username} (Bottom)`,
            { fontSize: '12px', color: '#ff8888' }
        ).setOrigin(0.5);

        this.player2NameText = this.add.text(
            180,
            15,
            `⚫ Player 2 (Top)`,
            { fontSize: '12px', color: '#8888ff' }
        ).setOrigin(0.5);

        // Message area
        this.messageText = this.add.text(
            180,
            610,
            `${this.currentPlayer === 'red' ? 'Red' : 'Black'} player's turn - tap your piece`,
            { fontSize: '14px', color: '#ffff00' }
        ).setOrigin(0.5);
    }

    private setupInput() {
        if (this.input.keyboard) {
            this.input.keyboard.on('keydown-ESC', () => this.deselectPiece());
        }
    }

    private onPieceClick(row: number, col: number) {
        // Don't allow clicks if game is over
        if (!this.gameActive) {
            return;
        }

        console.log('\n========== PIECE CLICKED ==========');
        console.log(`📍 Position: [${row},${col}]`);
        console.log(`👤 Current player: ${this.currentPlayer}`);
        console.log(`📦 Piece at position: "${this.board[row][col]}"`);
        console.log(`🎯 Selected piece:`, this.selectedPiece);

        const piece = this.board[row][col];

        if (piece) {
            console.log(`   Piece owner: ${piece}`);
            console.log(`   Does piece belong to current player? ${piece.includes(this.currentPlayer)}`);

            // Check if it's your turn and the piece belongs to you
            if (piece.includes(this.currentPlayer)) {
                console.log('✅ Your piece - selecting it');
                this.selectPiece(row, col);
            }
            // If it's opponent's piece and you have a piece selected (attempting capture)
            else if (this.selectedPiece) {
                console.log('⚔️ Attempting to capture opponent piece');
                console.log(`   Selected piece: [${this.selectedPiece.row},${this.selectedPiece.col}]`);
                console.log(`   Target piece: [${row},${col}]`);
                this.tryMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
            }
            // If it's opponent's piece and it's their turn
            else {
                console.log('❌ Opponent piece clicked with no selected piece');
                this.messageText.setText(`It's ${this.currentPlayer === 'red' ? 'RED' : 'BLACK'} player's turn`);
            }
        } else {
            console.log('❌ Clicked on empty square (should not happen via piece click)');
        }
        console.log('====================================\n');
    }

    private onSquareClick(row: number, col: number) {
        // Don't allow clicks if game is over
        if (!this.gameActive) {
            return;
        }

        console.log('\n========== SQUARE CLICKED ==========');
        console.log(`📍 Position: [${row},${col}]`);
        console.log(`👤 Current player: ${this.currentPlayer}`);
        console.log(`🎯 Selected piece:`, this.selectedPiece);

        if (!this.selectedPiece) {
            console.log('❌ No piece selected');
            return;
        }

        // Make sure it's still your turn
        const selectedPieceColor = this.board[this.selectedPiece.row][this.selectedPiece.col];
        console.log(`   Selected piece color: "${selectedPieceColor}"`);

        if (!selectedPieceColor?.includes(this.currentPlayer)) {
            console.log('❌ Selected piece no longer belongs to current player');
            this.deselectPiece();
            this.messageText.setText(`It's ${this.currentPlayer === 'red' ? 'RED' : 'BLACK'} player's turn`);
            return;
        }

        // Try to move selected piece to this square
        console.log(`   Attempting move from [${this.selectedPiece.row},${this.selectedPiece.col}] to [${row},${col}]`);
        this.tryMove(this.selectedPiece.row, this.selectedPiece.col, row, col);
        console.log('====================================\n');
    }

    private selectPiece(row: number, col: number) {
        console.log(`\n🔍 Selecting piece at [${row},${col}]`);

        this.deselectPiece();
        this.selectedPiece = { row, col };
        this.validMoves = this.getValidMoves(row, col);
        console.log(`   Valid moves:`, this.validMoves.map(m => `[${m.row},${m.col}]`).join(', ') || 'none');

        this.highlightValidMoves();
        this.messageText.setText(`Selected ${this.getSquareName(row, col)}`);
    }

    private deselectPiece() {
        if (this.selectedPiece) {
            console.log(`\n🔽 Deselecting piece at [${this.selectedPiece.row},${this.selectedPiece.col}]`);
            this.selectedPiece = null;
        }

        this.clearMoveHighlights();
        this.validMoves = [];
    }

    private tryMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        console.log(`\n🔄 Trying move from [${fromRow},${fromCol}] to [${toRow},${toCol}]`);

        const isValid = this.validMoves.some(move => move.row === toRow && move.col === toCol);
        console.log(`   Is valid move? ${isValid}`);

        if (isValid) {
            console.log('✅ Valid move - executing');
            this.executeMove(fromRow, fromCol, toRow, toCol);
        } else {
            if (!this.selectedPiece) {
                console.log('❌ No piece selected');
                this.messageText.setText('Select your piece first');
                return;
            }

            const targetPiece = this.board[toRow][toCol];
            console.log(`   Target piece: "${targetPiece}"`);

            if (targetPiece && targetPiece.includes(this.currentPlayer)) {
                console.log('✅ Clicked on own piece - selecting it instead');
                this.selectPiece(toRow, toCol);
                return;
            }

            console.log('❌ Invalid move');
            this.messageText.setText('❌ Invalid move!');

            this.squares[toRow][toCol].setFillStyle(0xff4444, 0.5);
            this.time.delayedCall(300, () => {
                this.squares[toRow][toCol].setFillStyle((toRow + toCol) % 2 === 1 ? 0x8b4513 : 0xdeb887);
            });
        }
    }

    private executeMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        console.log(`\n🎬 Executing move from [${fromRow},${fromCol}] to [${toRow},${toCol}]`);
        this.movesCount++;
        
        const piece = this.board[fromRow][fromCol];
        console.log(`   Moving piece: "${piece}"`);

        this.board[fromRow][fromCol] = null;
        this.board[toRow][toCol] = piece;

        const pieceObj = this.pieces[fromRow][fromCol];

        if (pieceObj) {
            pieceObj.disableInteractive();
        }

        const targetX = this.BOARD_OFFSET_X + toCol * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;
        const targetY = this.BOARD_OFFSET_Y + toRow * this.SQUARE_SIZE + this.SQUARE_SIZE / 2;

        this.tweens.add({
            targets: pieceObj,
            x: targetX,
            y: targetY,
            duration: 200,
            ease: 'Power2',
            onComplete: () => {
                this.pieces[fromRow][fromCol] = null;
                this.pieces[toRow][toCol] = pieceObj;

                if (this.crowns[fromRow][fromCol]) {
                    const crown = this.crowns[fromRow][fromCol];
                    this.crowns[fromRow][fromCol] = null;
                    this.crowns[toRow][toCol] = crown;

                    this.tweens.add({
                        targets: crown,
                        x: targetX,
                        y: targetY - 8,
                        duration: 200,
                        ease: 'Power2'
                    });
                }

                // Re-enable interactivity at the new position for BOTH colors
                if (pieceObj) {
                    pieceObj.setInteractive({ useHandCursor: true });
                    pieceObj.off('pointerdown');
                    pieceObj.off('pointerover');
                    pieceObj.off('pointerout');
                    pieceObj.on('pointerdown', () => this.onPieceClick(toRow, toCol));
                    pieceObj.on('pointerover', () => this.onPieceHover(toRow, toCol, true));
                    pieceObj.on('pointerout', () => this.onPieceHover(toRow, toCol, false));
                }

                // Check for captures
                const isKing = piece?.includes('king');
                const rowDiff = Math.abs(toRow - fromRow);
                const colDiff = Math.abs(toCol - fromCol);

                if (rowDiff > 1 || colDiff > 1) {
                    console.log(`   Capture detected! Removing pieces along the path`);

                    const rowDir = toRow > fromRow ? 1 : -1;
                    const colDir = toCol > fromCol ? 1 : -1;

                    for (let step = 1; step < rowDiff; step++) {
                        const captureRow = fromRow + (rowDir * step);
                        const captureCol = fromCol + (colDir * step);

                        if (this.board[captureRow][captureCol]) {
                            console.log(`   Capturing piece at [${captureRow},${captureCol}]`);
                            this.capturePiece(captureRow, captureCol);
                        }
                    }
                }

                // Check for king promotion
                this.checkKingPromotion(toRow, toCol, piece);

                // Switch turns
                console.log(`   Switching turns from ${this.currentPlayer} to ${this.currentPlayer === 'red' ? 'black' : 'red'}`);
                this.switchTurn();

                // Check win condition
                this.checkWinCondition();

                console.log('✅ Move completed\n');
            }
        });

        this.deselectPiece();
    }

    private capturePiece(row: number, col: number) {
        console.log(`💥 Capturing piece at [${row},${col}]`);
        this.piecesCapturedCount++;
        
        this.board[row][col] = null;

        if (this.crowns[row][col]) {
            this.crowns[row][col]?.destroy();
            this.crowns[row][col] = null;
        }

        const piece = this.pieces[row][col];
        if (piece) {
            piece.disableInteractive();

            this.tweens.add({
                targets: piece,
                scale: 0,
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    piece.destroy();
                    this.pieces[row][col] = null;
                }
            });
        }

        this.messageText.setText('🔥 Captured!');
    }

    private checkKingPromotion(row: number, col: number, piece: string | null) {
        if (piece === 'red' && row === 0) {
            console.log(`👑 Promoting red piece to king at [${row},${col}]`);
            this.promoteToKing(row, col, 'red');
        }
        else if (piece === 'black' && row === 7) {
            console.log(`👑 Promoting black piece to king at [${row},${col}]`);
            this.promoteToKing(row, col, 'black');
        }
    }

    private promoteToKing(row: number, col: number, color: string) {
        const piece = this.pieces[row][col];
        if (!piece) return;
        
        this.kingsMadeCount++;
        this.board[row][col] = `king_${color}`;
        piece.setTexture(`${color}_king`);
        piece.setDisplaySize(this.SQUARE_SIZE * 0.8, this.SQUARE_SIZE * 0.8);
        this.messageText.setText(`👑 ${color.toUpperCase()} KING!`);
    }

    private switchTurn() {
        this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
        console.log(`🔄 Turn switched to: ${this.currentPlayer}`);
        this.updateTurnText();
    }

    private updateTurnText() {
        this.turnText.setText(
            `${this.currentPlayer === 'red' ? '🔴 RED' : '⚫ BLACK'} Player's Turn`
        );
        this.messageText.setText(
            `${this.currentPlayer === 'red' ? 'Red' : 'Black'} player's turn - tap your piece`
        );
    }

    private getValidMoves(row: number, col: number): { row: number; col: number }[] {
        const moves: { row: number; col: number }[] = [];
        const piece = this.board[row][col];

        console.log(`\n📊 Calculating valid moves for piece at [${row},${col}] (${piece})`);

        if (!piece) {
            console.log('   No piece at this position');
            return moves;
        }

        const isKing = piece.includes('king');
        console.log(`   Is king? ${isKing}`);
        console.log(`   Piece color: ${piece.includes('red') ? 'red' : 'black'}`);

        const allDirections = [
            { rowDir: -1, colDir: -1 },
            { rowDir: -1, colDir: 1 },
            { rowDir: 1, colDir: -1 },
            { rowDir: 1, colDir: 1 }
        ];

        let allowedDirections: { rowDir: number; colDir: number }[] = [];

        if (isKing) {
            allowedDirections = allDirections;
            console.log(`   King - using all 4 directions`);
        } else {
            const direction = piece.includes('red') ? -1 : 1;
            allowedDirections = allDirections.filter(dir => dir.rowDir === direction);
            console.log(`   Regular piece - using direction: ${direction}`);
        }

        for (const dir of allowedDirections) {
            if (!isKing) {
                const newRow = row + dir.rowDir;
                const newCol = col + dir.colDir;

                if (this.isValidSquare(newRow, newCol) && !this.board[newRow][newCol]) {
                    console.log(`   ✅ Valid regular move: [${newRow},${newCol}]`);
                    moves.push({ row: newRow, col: newCol });
                }

                const jumpRow = row + dir.rowDir * 2;
                const jumpCol = col + dir.colDir * 2;
                const midRow = row + dir.rowDir;
                const midCol = col + dir.colDir;

                if (this.isValidSquare(jumpRow, jumpCol)) {
                    const midPiece = this.board[midRow][midCol];
                    const jumpEmpty = !this.board[jumpRow][jumpCol];

                    if (midPiece && jumpEmpty) {
                        const isOpponent = midPiece.includes(this.currentPlayer === 'red' ? 'black' : 'red');

                        if (isOpponent) {
                            console.log(`   ✅ Valid capture: [${jumpRow},${jumpCol}] over [${midRow},${midCol}]`);
                            moves.push({ row: jumpRow, col: jumpCol });
                        }
                    }
                }
            }
            else {
                let steps = 1;
                let foundOpponent = false;
                let opponentRow = -1;
                let opponentCol = -1;

                while (true) {
                    const newRow = row + dir.rowDir * steps;
                    const newCol = col + dir.colDir * steps;

                    if (!this.isValidSquare(newRow, newCol)) break;

                    const targetSquare = this.board[newRow][newCol];

                    if (!targetSquare) {
                        if (!foundOpponent) {
                            console.log(`   ✅ Valid king move: [${newRow},${newCol}]`);
                            moves.push({ row: newRow, col: newCol });
                            steps++;
                        }
                        else {
                            console.log(`   ✅ Valid king capture: [${newRow},${newCol}] over [${opponentRow},${opponentCol}]`);
                            moves.push({ row: newRow, col: newCol });
                            break;
                        }
                    }
                    else {
                        const isOpponent = targetSquare.includes(this.currentPlayer === 'red' ? 'black' : 'red');

                        if (isOpponent) {
                            if (foundOpponent) {
                                console.log(`   ❌ Second opponent piece at [${newRow},${newCol}] - stop`);
                                break;
                            }

                            foundOpponent = true;
                            opponentRow = newRow;
                            opponentCol = newCol;
                            console.log(`   🔍 Found opponent piece at [${newRow},${newCol}]`);
                            steps++;
                        } else {
                            console.log(`   ❌ Blocked by own piece at [${newRow},${newCol}]`);
                            break;
                        }
                    }
                }
            }
        }

        console.log(`   Total valid moves: ${moves.length}`);
        return moves;
    }

    private isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
    }

    private highlightValidMoves() {
        console.log(`🎨 Highlighting ${this.validMoves.length} valid moves`);
        this.validMoves.forEach(move => {
            const square = this.squares[move.row][move.col];
            square.setFillStyle(0x44ff44, 0.5);
        });
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

    private onSquareHover(row: number, col: number, isOver: boolean) {
        if (!this.gameActive) return;

        const square = this.squares[row][col];
        if (!square) return;

        if (isOver && !this.board[row][col]) {
            square.setFillStyle(0xaa6d3b);
        } else if (!isOver && (row + col) % 2 === 1) {
            square.setFillStyle(0x8b4513);
        }
    }

    private onPieceHover(row: number, col: number, isOver: boolean) {
        if (!this.gameActive) return;

        const piece = this.pieces[row][col];
        if (!piece) return;

        // Highlight pieces for BOTH players now
        if (isOver && this.board[row][col]?.includes(this.currentPlayer)) {
            piece.setTint(0xffffaa);
        } else {
            piece.clearTint();
        }
    }

    private getSquareName(row: number, col: number): string {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        return `${letters[col]}${8 - row}`;
    }

    private checkWinCondition() {
        const redPieces = this.board.flat().filter(p => p && p.includes('red')).length;
        const blackPieces = this.board.flat().filter(p => p && p.includes('black')).length;

        console.log(`🏁 Checking win condition - Red: ${redPieces}, Black: ${blackPieces}`);

        if (redPieces === 0) {
            console.log('🎉 BLACK WINS!');
            this.gameOver('⚫ BLACK PLAYER WINS!');
        } else if (blackPieces === 0) {
            console.log('🎉 RED WINS!');
            this.gameOver('🔴 RED PLAYER WINS!');
        }
    }

    private gameOver(message: string) {
        this.gameActive = false;

        const gameOverText = this.add.text(180, 280, message, {
            fontSize: '28px',
            color: '#ffff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(180, 320, '📊 2-PLAYER MODE', {
            fontSize: '14px',
            color: '#888888'
        }).setOrigin(0.5);

        this.add.text(180, 370, 'Tap to play again', {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(180, 400, '← Back to menu', {
            fontSize: '12px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        this.input.once('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const y = pointer.y;
            if (y > 380) {
                this.goBack();
            } else {
                this.restartGame();
            }
        });
    }

    private restartGame() {
        console.log('🔄 Restarting 2-player game...');

        this.children.removeAll(true);

        this.board = [];
        this.squares = [];
        this.pieces = [];
        this.crowns = [];
        this.selectedPiece = null;
        this.validMoves = [];
        this.currentPlayer = 'red';
        this.gameActive = true;

        this.gameStartTime = Date.now();
        this.movesCount = 0;
        this.piecesCapturedCount = 0;
        this.kingsMadeCount = 0;

        this.create();
    }

    private goBack() {
        console.log('🔙 Returning to Checkers start scene');
        this.scene.start('CheckersStartScene', {
            username: this.username,
            uid: this.uid
        });
    }
}