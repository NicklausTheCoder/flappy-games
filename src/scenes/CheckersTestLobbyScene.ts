// src/scenes/checkers/CheckersTestLobbyScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

export class CheckersTestLobbyScene extends Phaser.Scene {
  // Socket connection
  private socket: Socket | null = null;
  private roomId: string = '';
  private myColor: 'red' | 'black' = 'red';
  private isHost: boolean = true;
  
  // UI Elements
  private statusText!: Phaser.GameObjects.Text;
  private roomIdText!: Phaser.GameObjects.Text;
  private connectionStatus!: Phaser.GameObjects.Text;
  private player1Ready!: Phaser.GameObjects.Text;
  private player2Ready!: Phaser.GameObjects.Text;
  private player1Name!: Phaser.GameObjects.Text;
  private player2Name!: Phaser.GameObjects.Text;
  private readyButton!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  
  // Game state
  private opponentName: string = 'Waiting...';
  private opponentReady: boolean = false;
  private myReady: boolean = false;
  private countdown: number = 3;
  private countdownTimer: Phaser.Time.TimerEvent | null = null;
  private gameStarting: boolean = false;
  
  // Constants
  private readonly BOARD_SIZE = 8;
  private readonly SQUARE_SIZE = 34;
  private readonly BOARD_OFFSET_X = 28;
  private readonly BOARD_OFFSET_Y = 150;

  constructor() {
    super({ key: 'CheckersTestLobbyScene' });
  }

  init(data: { roomId: string; myColor: 'red' | 'black'; isHost: boolean; socket?: Socket }) {
    console.log('🎮 CheckersTestLobbyScene initialized:', data);
    
    this.roomId = data.roomId;
    this.myColor = data.myColor;
    this.isHost = data.isHost;
    this.socket = data.socket || null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    // Title
    this.add.text(180, 40, '♟️ CHECKERS LOBBY', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Room code display
    this.roomIdText = this.add.text(180, 80, `Room: ${this.roomId}`, {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    
    // Copy button
    const copyBtn = this.add.text(280, 78, '📋 COPY', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 8, y: 3 }
    }).setInteractive({ useHandCursor: true });
    copyBtn.on('pointerdown', () => {
      navigator.clipboard.writeText(this.roomId);
      copyBtn.setText('✅ COPIED!');
      setTimeout(() => copyBtn.setText('📋 COPY'), 2000);
    });
    
    // Connection status
    this.connectionStatus = this.add.text(180, 110, '🟢 Connected', {
      fontSize: '12px',
      color: '#00ff00'
    }).setOrigin(0.5);
    
    // Create player cards
    this.createPlayerCards();
    
    // Status text
    this.statusText = this.add.text(180, 380, this.isHost ? 'Waiting for opponent...' : 'Waiting for host to start...', {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);
    
    // Countdown text (hidden initially)
    this.countdownText = this.add.text(180, 450, '', {
      fontSize: '48px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);
    
    // Ready button
    this.readyButton = this.add.text(180, 520, '✅ READY UP', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 20, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.setReady());
    
    // Leave button
    const leaveBtn = this.add.text(40, 600, '← LEAVE', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 12, y: 6 }
    })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.leaveLobby());
    
    // Show board preview
    this.createBoardPreview();
    
    // Setup socket listeners
    this.setupSocketListeners();
  }
  
  private createPlayerCards() {
    // Player 1 card (left - Red)
    const p1Bg = this.add.graphics();
    p1Bg.fillStyle(0x16213e, 0.8);
    p1Bg.fillRoundedRect(30, 140, 140, 120, 12);
    p1Bg.lineStyle(2, 0xff3333);
    p1Bg.strokeRoundedRect(30, 140, 140, 120, 12);
    
    // Red piece
    this.add.text(45, 155, '🔴', { fontSize: '48px' });
    
    // Player name
    this.player1Name = this.add.text(45, 210, this.isHost ? 'You (Host)' : 'Opponent', {
      fontSize: '14px',
      color: '#ffffff'
    });
    
    // Ready status
    this.player1Ready = this.add.text(45, 235, this.myReady ? '✅ Ready' : '⏳ Not Ready', {
      fontSize: '12px',
      color: this.myReady ? '#00ff00' : '#ff6666'
    });
    
    // Player 2 card (right - Black)
    const p2Bg = this.add.graphics();
    p2Bg.fillStyle(0x16213e, 0.8);
    p2Bg.fillRoundedRect(190, 140, 140, 120, 12);
    p2Bg.lineStyle(2, 0x666666);
    p2Bg.strokeRoundedRect(190, 140, 140, 120, 12);
    
    // Black piece
    this.add.text(205, 155, '⚫', { fontSize: '48px' });
    
    // Opponent name
    this.player2Name = this.add.text(205, 210, 'Waiting...', {
      fontSize: '14px',
      color: '#888888'
    });
    
    // Opponent ready status
    this.player2Ready = this.add.text(205, 235, '⏳ Waiting', {
      fontSize: '12px',
      color: '#888888'
    });
    
    // Color labels
    this.add.text(100, 270, 'RED', { fontSize: '12px', color: '#ff6666' }).setOrigin(0.5);
    this.add.text(260, 270, 'BLACK', { fontSize: '12px', color: '#666666' }).setOrigin(0.5);
  }
  
  private createBoardPreview() {
    const previewSize = 28;
    const startX = 180 - (previewSize * 4);
    const startY = 300;
    
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const isPlayable = (row + col) % 2 === 1;
        const color = isPlayable ? 0x8b4513 : 0xdeb887;
        const x = startX + col * previewSize;
        const y = startY + row * previewSize;
        
        const square = this.add.rectangle(
          x + previewSize / 2,
          y + previewSize / 2,
          previewSize,
          previewSize,
          color
        );
        square.setStrokeStyle(1, 0x444444);
        
        // Add piece preview
        if (row < 2) {
          // Black pieces at top
          if (isPlayable) {
            this.add.text(x + previewSize / 2, y + previewSize / 2, '⚫', {
              fontSize: '16px'
            }).setOrigin(0.5);
          }
        } else if (row >= 2) {
          // Red pieces at bottom
          if (isPlayable) {
            this.add.text(x + previewSize / 2, y + previewSize / 2, '🔴', {
              fontSize: '16px'
            }).setOrigin(0.5);
          }
        }
      }
    }
  }
  
  private setupSocketListeners() {
    if (!this.socket) return;
    
    this.socket.on('playerJoined', (data) => {
      console.log('👤 Player joined:', data);
      this.opponentName = data.name || 'Player';
      this.player2Name.setText(this.opponentName);
      this.player2Name.setColor('#ffffff');
      this.statusText.setText('Opponent joined! Click READY to start');
      
      // Update card border
      const p2Bg = this.add.graphics();
      p2Bg.fillStyle(0x16213e, 0.8);
      p2Bg.fillRoundedRect(190, 140, 140, 120, 12);
      p2Bg.lineStyle(2, 0xffaa00);
      p2Bg.strokeRoundedRect(190, 140, 140, 120, 12);
    });
    
    this.socket.on('playerReady', (data) => {
      console.log('✅ Player ready:', data);
      this.opponentReady = true;
      this.player2Ready.setText('✅ Ready');
      this.player2Ready.setColor('#00ff00');
      
      if (this.myReady) {
        this.statusText.setText('Both ready! Starting game...');
        this.startCountdown();
      } else {
        this.statusText.setText('Opponent ready! Click READY to start');
      }
    });
    
    this.socket.on('gameStart', (data) => {
      console.log('🎮 Game starting!');
      this.gameStarting = true;
      
      // Go to game scene
      this.time.delayedCall(500, () => {
        this.scene.start('CheckersSocketTestScene', {
          roomId: this.roomId,
          myColor: this.myColor,
          isHost: this.isHost,
          opponentName: this.opponentName,
          socket: this.socket
        });
      });
    });
    
    this.socket.on('playerLeft', () => {
      console.log('👋 Player left');
      this.statusText.setText('Opponent left the lobby');
      this.player2Name.setText('Left');
      this.player2Name.setColor('#ff6666');
      this.player2Ready.setText('❌ Left');
      this.opponentReady = false;
      this.readyButton.setVisible(false);
    });
  }
  
  private async setReady() {
    if (this.myReady) return;
    
    this.myReady = true;
    this.player1Ready.setText('✅ Ready');
    this.player1Ready.setColor('#00ff00');
    
    // Update card border
    const p1Bg = this.add.graphics();
    p1Bg.fillStyle(0x16213e, 0.8);
    p1Bg.fillRoundedRect(30, 140, 140, 120, 12);
    p1Bg.lineStyle(2, 0x00ff00);
    p1Bg.strokeRoundedRect(30, 140, 140, 120, 12);
    
    this.readyButton.setText('✅ READY!');
    this.readyButton.setStyle({ backgroundColor: '#888888' });
    this.readyButton.disableInteractive();
    
    // Notify server
    this.socket?.emit('playerReady', { roomId: this.roomId });
    
    // If opponent is already ready, start countdown
    if (this.opponentReady) {
      this.startCountdown();
    } else {
      this.statusText.setText('Waiting for opponent to ready up...');
    }
  }
  
  private startCountdown() {
    if (this.countdownTimer) return;
    
    this.countdown = 3;
    this.countdownText.setVisible(true);
    this.countdownText.setText('3');
    this.statusText.setText('Game starting in 3...');
    
    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;
        this.countdownText.setText(this.countdown.toString());
        this.statusText.setText(`Game starting in ${this.countdown}...`);
        
        // Bounce effect
        this.tweens.add({
          targets: this.countdownText,
          scale: 1.5,
          duration: 200,
          yoyo: true
        });
        
        if (this.countdown <= 0) {
          this.countdownTimer?.destroy();
          this.countdownText.setVisible(false);
          
          // Notify server to start game
          this.socket?.emit('startGame', { roomId: this.roomId });
        }
      },
      repeat: 2
    });
  }
  
  private leaveLobby() {
    this.socket?.emit('leaveLobby', { roomId: this.roomId });
    this.socket?.disconnect();
    this.scene.start('CheckersStartScene');
  }
  
  shutdown() {
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }
  }
}