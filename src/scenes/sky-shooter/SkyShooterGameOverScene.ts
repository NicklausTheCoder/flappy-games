import Phaser from 'phaser';

export class SkyShooterGameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SkyShooterGameOverScene' });
    }
    
    init(data: { score: number; username: string }) {
        console.log('💀 Game Over - Score:', data.score);
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#0a0a4a');
        
        this.add.text(180, 150, 'GAME OVER', {
            fontSize: '36px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }
}
