import Phaser from 'phaser';

export class BallCrushLeaderboardScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushLeaderboardScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 120, 'LEADERBOARD', {
            fontSize: '28px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Back button
        const backBtn = this.add.text(60, 550, 'BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 10, y: 5 }
        })
        .setInteractive({ useHandCursor: true });
        
        backBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene');
        });
    }
}
