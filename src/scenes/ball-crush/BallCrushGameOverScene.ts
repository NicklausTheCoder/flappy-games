// src/scenes/ballcrush/BallCrushGameOverScene.ts
import Phaser from 'phaser';
import { updateBallCrushProfileStats } from '../../firebase/ballCrushSimple';
import { ballCrushMultiplayer } from '../../firebase/ballCrushMultiplayer';

export class BallCrushGameOverScene extends Phaser.Scene {
    private score: number = 0;
    private won: boolean = false;
    private winnerUsername: string = '';
    private uid: string = '';
    private username: string = '';
    private gameDuration: number = 0;
    private lobbyId: string = '';
    private winnerUid: string = '';

    constructor() {
        super({ key: 'BallCrushGameOverScene' });
    }
    
    init(data: { 
        score: number; 
        won: boolean; 
        winnerUsername: string; 
        winnerUid: string;
        uid: string; 
        username: string;
        duration: number;
        lobbyId: string;
    }) {
        this.score = data.score;
        this.won = data.won;
        this.winnerUsername = data.winnerUsername;
        this.winnerUid = data.winnerUid;
        this.uid = data.uid;
        this.username = data.username;
        this.gameDuration = data.duration;
        this.lobbyId = data.lobbyId;
        
        this.storeGameResult();
    }
    
    private async storeGameResult() {
        if (!this.uid) {
            console.error('❌ No UID available for saving game result');
            return;
        }

        try {
            const promises: Promise<any>[] = [
                updateBallCrushProfileStats(this.uid, this.score, this.won, this.gameDuration)
            ];

            // Finalize lobby status if we have a lobbyId and winnerUid
            if (this.lobbyId && this.winnerUid) {
                promises.push(ballCrushMultiplayer.endGame(this.lobbyId, this.winnerUid));
            }

            await Promise.all(promises);
        } catch (error) {
            console.error('❌ Error saving game result:', error);
        }
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 100, 'GAME OVER', {
            fontSize: '36px',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        
        const resultText = this.won ? '🏆 YOU WIN!' : `💔 ${this.winnerUsername} WINS!`;
        const resultColor = this.won ? '#ffff00' : '#ff6666';
        
        this.add.text(180, 160, resultText, {
            fontSize: '24px',
            color: resultColor,
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.add.text(180, 210, `Score: ${this.score}`, {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
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