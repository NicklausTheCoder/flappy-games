// src/scenes/sky-shooter/SkyShooterMatchmakingScene.ts
import Phaser from 'phaser';
import { multiplayer } from '../../firebase/multiplayerQueries';

export class SkyShooterMatchmakingScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private searchTime: number = 0;
  private searchTimer!: Phaser.Time.TimerEvent;
  private cancelled: boolean = false;
  
  constructor() {
    super({ key: 'SkyShooterMatchmakingScene' });
  }
  
  init(data: { username: string; uid: string }) {
    this.username = data.username;
    this.uid = data.uid;
  }
  
  async create() {
    this.cameras.main.setBackgroundColor('#0a0a2a');
    this.addStars();
    
    // Title
    this.add.text(180, 150, '🎮 FINDING OPPONENT', {
      fontSize: '24px',
      color: '#00ffff',
      fontStyle: 'bold'
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
      },
      loop: true
    });
    
    // Join matchmaking queue
    await multiplayer.joinQueue(this.uid, this.username);
    
    // Poll for match found
    this.checkForMatch();
  }
  
  private async checkForMatch() {
    // In a real implementation, you'd listen to Firebase for lobby creation
    // This is a simplified version - you'd use onValue to watch for your lobby
    
    // For demo, simulate finding a match after 5 seconds
    this.time.delayedCall(5000, async () => {
      if (!this.cancelled) {
        // Create a mock lobby for testing
        const lobbyId = await multiplayer.createLobby(this.uid, 'opponent_uid_here');
        
        this.searchTimer.destroy();
        this.scene.start('SkyShooterLobbyScene', {
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
    this.scene.start('SkyShooterStartScene', {
      username: this.username,
      uid: this.uid
    });
  }
  
  private addStars() {
    if (!this.textures.exists('white')) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(2, 2, 1);
      graphics.generateTexture('white', 4, 4);
    }
    
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const size = Phaser.Math.Between(1, 2);
      const alpha = Phaser.Math.FloatBetween(0.3, 0.8);
      this.add.image(x, y, 'white').setScale(size).setAlpha(alpha);
    }
  }
}