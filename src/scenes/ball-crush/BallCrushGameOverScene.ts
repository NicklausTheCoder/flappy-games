import Phaser from 'phaser';

export class BallCrushGameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushGameOverScene' });
    }
    
    init(data: { score: number; username: string }) {
        console.log('Game Over - Score:', data.score);
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 150, 'GAME OVER', {
            fontSize: '36px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Play again button
        const playAgainBtn = this.add.text(180, 260, 'PLAY AGAIN', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 30, y: 15 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        playAgainBtn.on('pointerdown', () => {
            this.scene.start('BallCrushGameScene', { username: this.registry.get('username') });
        });
        
        // Menu button
        const menuBtn = this.add.text(180, 340, 'MAIN MENU', {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        menuBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene', { username: this.registry.get('username') });
        });
    }
}
