// src/scenes/sky-shooter/SkyShooterLobbyScene.ts
import Phaser from 'phaser';
import { multiplayer, Lobby } from '../../firebase/multiplayerQueries';

export class SkyShooterLobbyScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: Lobby | null = null;
  private unsubscribe: (() => void) | null = null;
  
  // UI Elements
  private statusText!: Phaser.GameObjects.Text;
  private player1Text!: Phaser.GameObjects.Text;
  private player2Text!: Phaser.GameObjects.Text;
  private player1Ready!: Phaser.GameObjects.Text;
  private player2Ready!: Phaser.GameObjects.Text;
  private readyButton!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private countdown: number = 3;
  
  constructor() {
    super({ key: 'SkyShooterLobbyScene' });
  }
  
  init(data: { username: string; uid: string; lobbyId: string }) {
    console.log('🎮 LobbyScene initialized', data);
    
    this.username = data.username;
    this.uid = data.uid;
    this.lobbyId = data.lobbyId;
  }
  
  async create() {
    // Background
    this.cameras.main.setBackgroundColor('#0a0a2a');
    this.addStars();
    
    // Title
    this.add.text(180, 50, '🚀 BATTLE LOBBY', {
      fontSize: '28px',
      color: '#00ffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Create lobby UI
    this.createLobbyUI();
    
    // Subscribe to lobby changes
    this.unsubscribe = multiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      this.onLobbyUpdate(lobby);
    });
  }
  
  private createLobbyUI() {
    // Player 1 card
    const player1Card = this.add.graphics();
    player1Card.fillStyle(0x000044, 0.8);
    player1Card.fillRoundedRect(20, 120, 150, 200, 15);
    player1Card.lineStyle(2, 0x00ffff);
    player1Card.strokeRoundedRect(20, 120, 150, 200, 15);
    
    // Player 2 card
    const player2Card = this.add.graphics();
    player2Card.fillStyle(0x000044, 0.8);
    player2Card.fillRoundedRect(190, 120, 150, 200, 15);
    player2Card.lineStyle(2, 0x00ffff);
    player2Card.strokeRoundedRect(190, 120, 150, 200, 15);
    
    // Player 1 avatar
    this.add.text(60, 150, '🚀', { fontSize: '48px' });
    this.player1Text = this.add.text(50, 210, 'Waiting...', {
      fontSize: '14px',
      color: '#888888'
    });
    
    this.player1Ready = this.add.text(80, 250, '⏳ Not Ready', {
      fontSize: '12px',
      color: '#ff6666'
    });
    
    // Player 2 avatar
    this.add.text(230, 150, '🚀', { fontSize: '48px' });
    this.player2Text = this.add.text(220, 210, 'Waiting...', {
      fontSize: '14px',
      color: '#888888'
    });
    
    this.player2Ready = this.add.text(250, 250, '⏳ Not Ready', {
      fontSize: '12px',
      color: '#ff6666'
    });
    
    // Status text
    this.statusText = this.add.text(180, 350, 'Waiting for players...', {
      fontSize: '16px',
      color: '#ffff00'
    }).setOrigin(0.5);
    
    // Ready button
    this.readyButton = this.add.text(180, 420, '✅ READY', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 30, y: 15 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    this.readyButton.on('pointerdown', () => {
      this.setReady();
    });
    
    // Countdown text (hidden initially)
    this.countdownText = this.add.text(180, 500, '', {
      fontSize: '48px',
      color: '#00ffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);
    
    // Back button
    const backBtn = this.add.text(40, 580, '← LEAVE', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 15, y: 8 }
    })
    .setInteractive({ useHandCursor: true });
    
    backBtn.on('pointerdown', () => {
      this.leaveLobby();
    });
  }
  
  private onLobbyUpdate(lobby: Lobby | null) {
    if (!lobby) {
      this.statusText.setText('❌ Lobby closed');
      this.time.delayedCall(2000, () => {
        this.scene.start('SkyShooterStartScene', { 
          username: this.username,
          uid: this.uid 
        });
      });
      return;
    }
    
    this.lobby = lobby;
    
    // Update player displays
    const players = Object.values(lobby.players);
    
    if (players.length >= 1) {
      const player1 = players[0];
      this.player1Text.setText(player1.displayName);
      this.player1Ready.setText(player1.isReady ? '✅ Ready' : '⏳ Not Ready');
      this.player1Ready.setColor(player1.isReady ? '#00ff00' : '#ff6666');
    }
    
    if (players.length >= 2) {
      const player2 = players[1];
      this.player2Text.setText(player2.displayName);
      this.player2Ready.setText(player2.isReady ? '✅ Ready' : '⏳ Not Ready');
      this.player2Ready.setColor(player2.isReady ? '#00ff00' : '#ff6666');
    }
    
    // Update status based on lobby state
    switch(lobby.status) {
      case 'waiting':
        this.statusText.setText('⏳ Waiting for players to ready up...');
        break;
      case 'ready':
        this.statusText.setText('✅ All players ready! Starting soon...');
        this.startCountdown();
        break;
      case 'playing':
        this.statusText.setText('🎮 Game in progress!');
        this.time.delayedCall(1000, () => {
          this.scene.start('SkyShooterGameScene', { 
            username: this.username,
            uid: this.uid,
            lobbyId: this.lobbyId,
            lobby: lobby
          });
        });
        break;
    }
  }
  
  private async setReady() {
    if (!this.lobby) return;
    
    this.readyButton.setStyle({ backgroundColor: '#888888' });
    this.readyButton.disableInteractive();
    this.readyButton.setText('✅ READY!');
    
    await multiplayer.setPlayerReady(this.lobbyId, this.uid, true);
  }
  
  private startCountdown() {
    this.countdown = 3;
    this.countdownText.setVisible(true);
    
    const countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;
        this.countdownText.setText(this.countdown.toString());
        
        if (this.countdown <= 0) {
          countdownTimer.destroy();
          this.countdownText.setVisible(false);
        }
      },
      repeat: 2
    });
  }
  
  private async leaveLobby() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    await multiplayer.playerLeave(this.lobbyId, this.uid);
    
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
  
  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}