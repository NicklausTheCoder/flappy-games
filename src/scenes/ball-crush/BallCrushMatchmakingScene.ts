// src/scenes/ball-crush/BallCrushMatchmakingScene.ts
import Phaser from 'phaser';
import { multiplayer } from '../../firebase/multiplayerQueries';

export class BallCrushMatchmakingScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private searchTime: number = 0;
  private searchTimer!: Phaser.Time.TimerEvent;
  private cancelled: boolean = false;
  
  constructor() {
    super({ key: 'BallCrushMatchmakingScene' });
  }
  
  init(data: { username: string; uid: string }) {
    this.username = data.username;
    this.uid = data.uid;
  }
  
  async create() {
    this.cameras.main.setBackgroundColor('#1a3a1a');
    this.addBackgroundBalls();
    
    // Title
    this.add.text(180, 150, '⚽ FINDING OPPONENT', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);
    
    // Loading animation
    const loadingCircle = this.add.graphics();
    
    // Search text
    const searchText = this.add.text(180, 250, 'Searching', {
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Cancel button
    const cancelBtn = this.add.text(180, 400, '❌ CANCEL', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 20, y: 10 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    cancelBtn.on('pointerdown', () => {
      this.cancelSearch();
    });
    
    // Animate dots
    let dots = 0;
    this.searchTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        dots = (dots + 1) % 4;
        searchText.setText('Searching' + '.'.repeat(dots));
        this.searchTime += 0.5;
        
        // Add a subtle pulse to the search text
        this.tweens.add({
          targets: searchText,
          scale: 1.05,
          duration: 200,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });
      },
      loop: true
    });
    
    // Create a bouncing ball animation
    this.createBouncingBall();
    
    // Join matchmaking queue
    await multiplayer.joinQueue(this.uid, this.username);
    
    // Poll for match found
    this.checkForMatch();
  }
  
  private createBouncingBall() {
    // Create a bouncing ball in the center
    const ball = this.add.circle(180, 320, 25, 0xffaa00, 0.8);
    
    // Bounce animation
    this.tweens.add({
      targets: ball,
      y: 290,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Bounce.easeOut'
    });
    
    // Pulse animation
    this.tweens.add({
      targets: ball,
      scale: 1.2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    
    // Add inner circle
    const innerBall = this.add.circle(180, 320, 15, 0xffffff, 0.5);
    
    this.tweens.add({
      targets: innerBall,
      y: 290,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Bounce.easeOut'
    });
  }
  
  private async checkForMatch() {
    // For demo, simulate finding a match after 5 seconds
    this.time.delayedCall(5000, async () => {
      if (!this.cancelled) {
        // Create a mock lobby for testing
        const lobbyId = await multiplayer.createLobby(this.uid, 'opponent_uid_here');
        
        this.searchTimer.destroy();
        this.scene.start('BallCrushLobbyScene', {
          username: this.username,
          uid: this.uid,
          lobbyId: lobbyId
        });
      }
    });
  }
  
  private async cancelSearch() {
    this.cancelled = true;
    this.searchTimer.destroy();
    await multiplayer.leaveQueue(this.uid);
    this.scene.start('BallCrushStartScene', {
      username: this.username,
      uid: this.uid
    });
  }
  
  private addBackgroundBalls() {
    // Add floating balls in the background
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(20, 340);
      const y = Phaser.Math.Between(20, 620);
      const size = Phaser.Math.Between(10, 30);
      const alpha = Phaser.Math.FloatBetween(0.05, 0.15);
      
      const ball = this.add.circle(x, y, size, 0xffaa00, alpha);
      
      // Add floating animation
      this.tweens.add({
        targets: ball,
        y: y + 15,
        x: x + (i % 2 === 0 ? 10 : -10),
        duration: 3000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    
    // Add some small particles
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const size = Phaser.Math.Between(2, 5);
      
      const dot = this.add.circle(x, y, size, 0xffaa00, 0.2);
      
      // Random movement
      this.tweens.add({
        targets: dot,
        x: x + Phaser.Math.Between(-20, 20),
        y: y + Phaser.Math.Between(-20, 20),
        duration: 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }
  
  // Override update to add a loading spinner
  update() {
    // You can add a custom loading spinner here if needed
  }
}