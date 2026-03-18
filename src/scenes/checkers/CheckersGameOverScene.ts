// src/scenes/checkers/CheckersGameOverScene.ts
import Phaser from 'phaser';
import { 
    CheckersUserData,
    updateCheckersStats,
    addCheckersWinnings,
    saveCheckersGame,
    updateCheckersWalletBalance
} from '../../firebase/checkersService';

export class CheckersGameOverScene extends Phaser.Scene {
    private userData!: CheckersUserData;
    private username: string = '';
    private uid: string = '';
    private winner: 'red' | 'black' = 'red';
    private playerColor: 'red' | 'black' = 'red';
    private piecesCaptured: number = 0;
    private kingsMade: number = 0;
    private moves: number = 0;
    private gameDuration: number = 0;
    
    constructor() {
        super({ key: 'CheckersGameOverScene' });
    }
    
   // In CheckersGameOverScene.ts, update the init method:
init(data: { 
    userData: CheckersUserData | null; 
    username?: string; 
    uid?: string;
    winner: 'red' | 'black';
    playerColor: 'red' | 'black';
    piecesCaptured: number;
    kingsMade: number;
    moves: number;
    gameDuration: number;
}) {
    console.log('♟️ CheckersGameOverScene initialized with data:', data);
    
    if (!data || (!data.userData && !data.uid)) {
        console.error('❌ No user data provided to GameOverScene');
        this.scene.start('CheckersStartScene');
        return;
    }
    
    this.userData = data.userData || {
        username: data.username || 'Player',
        displayName: data.username || 'Player',
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        // Add other default values as needed
    } as CheckersUserData;
    
    this.username = data.username || this.userData.username || '';
    this.uid = data.uid || this.userData.uid || '';
    this.winner = data.winner;
    this.playerColor = data.playerColor;
    this.piecesCaptured = data.piecesCaptured || 0;
    this.kingsMade = data.kingsMade || 0;
    this.moves = data.moves || 0;
    this.gameDuration = data.gameDuration || 0;
    
    // Make sure we have a UID
    if (!this.uid) {
        console.error('❌ No UID available in GameOverScene');
    }
    
    // Store the game result in database immediately
    this.storeGameResult();
}
    
    private async storeGameResult() {
        try {
            if (!this.uid) {
                console.error('❌ Cannot save game result: No UID available');
                return;
            }

            const playerWon = this.playerColor === this.winner;
            console.log(`💾 Saving Checkers game for UID: ${this.uid}, won: ${playerWon}`);
            
            // 1. Update stats
            await updateCheckersStats(
                this.uid,
                playerWon,
                this.piecesCaptured,
                this.kingsMade,
                this.moves
            );
            
            // 2. If player won, add winnings ($0.50 per win)
            if (playerWon) {
                await addCheckersWinnings(
                    this.uid,
                    0.50,
                    `Checkers victory! Captured ${this.piecesCaptured} pieces, ${this.kingsMade} kings`
                );
                console.log('💰 Added $0.50 to winnings');
            }
            
            // 3. Save game history
            await saveCheckersGame({
                winner: this.winner,
                playerRed: this.playerColor === 'red' ? this.username : 'AI',
                playerBlack: this.playerColor === 'black' ? this.username : 'AI',
                moves: this.moves,
                piecesCaptured: this.piecesCaptured,
                date: new Date().toISOString(),
                timestamp: Date.now()
            });
            
            console.log('✅ Checkers game saved successfully');
            
        } catch (error) {
            console.error('❌ Error saving Checkers game:', error);
        }
    }
    
    create() {
        // Dark background
        this.cameras.main.setBackgroundColor('#1a1a2e');
        
        const playerWon = this.playerColor === this.winner;
        
        // Game over title
        this.add.text(180, 80, 'GAME OVER', {
            fontSize: '32px',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        // Result card background
        const cardBg = this.add.graphics();
        cardBg.fillStyle(0x16213e, 0.9);
        cardBg.fillRoundedRect(30, 120, 300, 180, 15);
        cardBg.lineStyle(2, playerWon ? 0xffd700 : 0xff4444);
        cardBg.strokeRoundedRect(30, 120, 300, 180, 15);
        
        // Result text
        const resultText = playerWon ? '🏆 YOU WIN!' : '💔 YOU LOSE';
        const resultColor = playerWon ? '#ffd700' : '#ff6666';
        
        this.add.text(180, 150, resultText, {
            fontSize: '28px',
            color: resultColor,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Winner info
        this.add.text(180, 190, `${this.winner === 'red' ? '🔴 RED' : '⚫ BLACK'} WINS`, {
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);
        
        // Stats
        this.add.text(180, 230, `📊 GAME STATS`, {
            fontSize: '16px',
            color: '#ffd700'
        }).setOrigin(0.5);
        
        this.add.text(90, 260, `Pieces captured:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 260, this.piecesCaptured.toString(), {
            fontSize: '16px',
            color: '#00ff00',
            fontStyle: 'bold'
        });
        
        this.add.text(90, 285, `Kings made:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 285, this.kingsMade.toString(), {
            fontSize: '16px',
            color: '#ffff00',
            fontStyle: 'bold'
        });
        
        this.add.text(90, 310, `Total moves:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 310, this.moves.toString(), {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        
        // Winnings if player won
        if (playerWon) {
            const winningsPopup = this.add.text(180, 350, '+$0.50', {
                fontSize: '24px',
                color: '#00ff00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5);
            
            // Animate winnings
            this.tweens.add({
                targets: winningsPopup,
                y: 320,
                alpha: 0,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => winningsPopup.destroy()
            });
        }
        
        // Career stats
        this.add.text(180, 400, `📈 CAREER STATS`, {
            fontSize: '16px',
            color: '#ffd700'
        }).setOrigin(0.5);
        
        this.add.text(90, 430, `Games played:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 430, this.userData.gamesPlayed.toString(), {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        });
        
        this.add.text(90, 455, `Games won:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 455, this.userData.gamesWon.toString(), {
            fontSize: '16px',
            color: '#00ff00',
            fontStyle: 'bold'
        });
        
        const winRate = this.userData.gamesPlayed > 0 
            ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100) 
            : 0;
        
        this.add.text(90, 480, `Win rate:`, {
            fontSize: '14px',
            color: '#cccccc'
        });
        this.add.text(260, 480, `${winRate}%`, {
            fontSize: '16px',
            color: winRate > 50 ? '#00ff00' : '#ffaa00',
            fontStyle: 'bold'
        });
        
        // Play Again button
     
        
        // Menu button
        const menuBtn = this.createButton(180, 580, '🏠 MAIN MENU', '#9C27B0', () => {
            this.scene.start('CheckersStartScene', { 
                username: this.username,
                uid: this.uid,
                userData: this.userData 
            });
        });
    }
    
    private createButton(x: number, y: number, text: string, color: string, callback: () => void): Phaser.GameObjects.Text {
        const button = this.add.text(x, y, text, {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: color,
            padding: { x: 15, y: 8 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        button.on('pointerover', () => {
            button.setStyle({ color: '#ffff00' });
            button.setScale(1.05);
        });
        
        button.on('pointerout', () => {
            button.setStyle({ color: '#ffffff' });
            button.setScale(1);
        });
        
        button.on('pointerdown', callback);
        
        return button;
    }
    
    private async deductAndPlay() {
        if (!this.uid) {
            console.error('❌ Cannot deduct fee: No UID available');
            this.showError('Session error');
            return;
        }

        if (this.userData.balance < 1) {
            this.showInsufficientFunds();
            return;
        }
        
        try {
            const success = await updateCheckersWalletBalance(
                this.uid,
                -1.00,
                'loss',
                'Checkers game entry fee'
            );
            
            if (success) {
                this.userData.balance -= 1;
                this.scene.start('CheckersGameScene', { 
                    username: this.username,
                    uid: this.uid,
                    userData: this.userData 
                });
            } else {
                this.showError('Failed to process payment');
            }
        } catch (error) {
            console.error('Error:', error);
            this.showError('Something went wrong');
        }
    }
    
    private showInsufficientFunds() {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.9);
        popup.fillRoundedRect(40, 250, 280, 120, 10);
        
        this.add.text(180, 280, '⚠️ INSUFFICIENT FUNDS', {
            fontSize: '16px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.add.text(180, 320, 'Need $1 to play', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);
        
        this.time.delayedCall(2000, () => popup.destroy());
    }
    
    private showError(message: string) {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.9);
        popup.fillRoundedRect(40, 250, 280, 80, 10);
        
        this.add.text(180, 290, '❌ ' + message, {
            fontSize: '14px',
            color: '#ff0000'
        }).setOrigin(0.5);
        
        this.time.delayedCall(1500, () => popup.destroy());
    }
}