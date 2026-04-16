// src/scenes/ballcrush/BallCrushGameOverScene.ts
import Phaser from 'phaser';
import { updateBallCrushProfileStats } from '../../firebase/ballCrushSimple';

export class BallCrushGameOverScene extends Phaser.Scene {
    private score: number = 0;
    private won: boolean = false;
    private winnerUsername: string = '';
    private uid: string = '';
    private username: string = '';
    private gameDuration: number = 0;

    constructor() {
        super({ key: 'BallCrushGameOverScene' });
    }
    
    init(data: { 
        score: number; 
        won: boolean; 
        winnerUsername: string; 
        uid: string; 
        username: string;
        duration: number;
    }) {
        this.score = data.score;
        this.won = data.won;
        this.winnerUsername = data.winnerUsername;
        this.uid = data.uid;
        this.username = data.username;
        this.gameDuration = data.duration;
        
        // Store the game result immediately
        this.storeGameResult();
    }
    
    private async storeGameResult() {
        if (!this.uid) {
            console.error('❌ No UID available for saving game result');
            return;
        }

        try {
            // Update stats (wins/losses, high score, etc.)
            await updateBallCrushProfileStats(this.uid, this.score, this.won, this.gameDuration);
            
         
        } catch (error) {
            console.error('❌ Error saving game result:', error);
        }
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        // Game over title
        this.add.text(180, 100, 'GAME OVER', {
            fontSize: '36px',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        // Result text
        const resultText = this.won ? '🏆 YOU WIN!' : `💔 ${this.winnerUsername} WINS!`;
        const resultColor = this.won ? '#ffff00' : '#ff6666';
        
        this.add.text(180, 160, resultText, {
            fontSize: '24px',
            color: resultColor,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Score display
        this.add.text(180, 210, `Score: ${this.score}`, {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Winnings popup if won
        if (this.won) {
            const winningsPopup = this.add.text(180, 260, '+$1.50', {
                fontSize: '28px',
                color: '#00ff00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: winningsPopup,
                y: 230,
                alpha: 0,
                duration: 2000,
                ease: 'Power2',
                onComplete: () => winningsPopup.destroy()
            });
        }
        
        // Play again button
        const playAgainBtn = this.add.text(180, 350, 'PLAY AGAIN', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 30, y: 15 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        playAgainBtn.on('pointerdown', () => {
            this.scene.start('BallCrushGameScene', { 
                username: this.username,
                uid: this.uid 
            });
        });
        
        // Menu button
        const menuBtn = this.add.text(180, 420, 'MAIN MENU', {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        menuBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene', { 
                username: this.username,
                uid: this.uid 
            });
        });
    }
}