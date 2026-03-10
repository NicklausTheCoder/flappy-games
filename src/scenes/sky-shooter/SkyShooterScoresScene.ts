import Phaser from 'phaser';

export class SkyShooterScoresScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SkyShooterScoresScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#0a0a4a');
        
        this.add.text(180, 120, '🏆 HIGH SCORES', {
            fontSize: '28px',
            color: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }
}
