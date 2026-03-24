// src/scenes/ball-crush/BallCrushStartScene.ts
import Phaser from 'phaser';

export class BallCrushStartScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';

  constructor() {
    super({ key: 'BallCrushStartScene' });
  }

  init(data: { username: string; uid?: string; displayName?: string; avatar?: string }) {
    console.log('📥 BallCrushStartScene received:', data);
    
    if (data) {
      this.username = data.username || '';
      this.uid = data.uid || '';
    }
  }

  create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a3a1a');

    // Construction icon
    this.add.text(180, 180, '🚧', {
      fontSize: '80px'
    }).setOrigin(0.5);

    // Title
    this.add.text(180, 260, 'BALL CRUSH', {
      fontSize: '32px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Coming Soon message
    this.add.text(180, 320, 'COMING SOON', {
      fontSize: '28px',
      color: '#ffff00',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Description
    this.add.text(180, 380, 'This game mode is under development', {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(180, 410, 'Check back soon!', {
      fontSize: '12px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // Back button - goes to external games page
    const backBtn = this.add.text(180, 500, '← BACK TO GAMES', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 20, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      // Navigate to external games page
      window.location.href = 'https://wintapgames.com/games';
    });
    
    // Animation for construction icon
    this.tweens.add({
      targets: this.add.text(180, 180, '🚧', { fontSize: '80px' }),
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
}