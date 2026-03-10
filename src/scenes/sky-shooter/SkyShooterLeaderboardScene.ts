import Phaser from 'phaser';

export class SkyShooterLeaderboardScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SkyShooterLeaderboardScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#0a0a4a');
        
        this.add.text(180, 120, '🏆 LEADERBOARD', {
            fontSize: '28px',
            color: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }
}
