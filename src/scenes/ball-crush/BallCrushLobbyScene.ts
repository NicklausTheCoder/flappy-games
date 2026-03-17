// src/scenes/ball-crush/BallCrushLobbyScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer, BallCrushLobby } from '../../firebase/ballCrushMultiplayer';
import { multiGameQueries } from '../../firebase/multiGameQueries';
import { ref, set, get ,remove } from 'firebase/database';
import { db } from '../../firebase/init';


export class BallCrushLobbyScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: BallCrushLobby | null = null;
  private unsubscribe: (() => void) | null = null;
  private isPlayerReady: boolean = false;
  private gameStarted: boolean = false;
  // UI Elements

  private statusText!: Phaser.GameObjects.Text;
  private player1Card!: Phaser.GameObjects.Graphics;
  private player2Card!: Phaser.GameObjects.Graphics;
  private player1Name!: Phaser.GameObjects.Text;
  private player2Name!: Phaser.GameObjects.Text;
  private player1Ready!: Phaser.GameObjects.Text;
  private player2Ready!: Phaser.GameObjects.Text;
  private player1Avatar!: Phaser.GameObjects.Text;
  private player2Avatar!: Phaser.GameObjects.Text;
  private readyButton!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private countdown: number = 3;
  private countdownTimer!: Phaser.Time.TimerEvent;
  private lobbyCodeText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BallCrushLobbyScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string }) {
    console.log('🎮 BallCrush LobbyScene initialized', data);

    this.username = data.username;
    this.uid = data.uid;
    this.lobbyId = data.lobbyId;
    this.isPlayerReady = false;
  }

  async create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a3a1a');
    this.addBackgroundEffects();

    // Title
    this.add.text(180, 40, '⚽ BALL CRUSH LOBBY', {
      fontSize: '28px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Lobby code display
    this.lobbyCodeText = this.add.text(180, 80, `Room: ${this.lobbyId.substring(0, 8)}...`, {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // Create player cards
    this.createPlayerCards();

    // Status text
    this.statusText = this.add.text(180, 350, '⏳ Waiting for opponent to join...', {
      fontSize: '16px',
      color: '#ffff00'
    }).setOrigin(0.5);

    // Ready button (disabled initially)
    this.readyButton = this.add.text(180, 420, '🔒 WAITING FOR OPPONENT', {
      fontSize: '20px',
      color: '#888888',
      backgroundColor: '#444444',
      padding: { x: 20, y: 12 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: false });

    // Countdown text (hidden initially)
    this.countdownText = this.add.text(180, 500, '', {
      fontSize: '48px',
      color: '#ffaa00',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);

    // Back button
    const backBtn = this.add.text(40, 580, '← LEAVE LOBBY', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 10, y: 6 }
    })
      .setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      this.leaveLobby();
    });

    // Subscribe to lobby changes using ballCrushMultiplayer
    this.unsubscribe = ballCrushMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      console.log('📡 Lobby update received:', lobby); // ADD THIS DEBUG LOG
      this.onLobbyUpdate(lobby);
    });

    // Also check if lobby exists
    // Replace the lobby existence check with this:

    // Check if lobby exists, but don't redirect immediately
    // Check if lobby exists
    console.log('🔍 Checking if lobby exists:', this.lobbyId);
    const lobby = await ballCrushMultiplayer.getLobby(this.lobbyId);
    console.log('🔍 getLobby result:', lobby); // ADD THIS DEBUG LOG

    if (!lobby) {
      console.log('⏳ Lobby not found yet, waiting for subscription...');
      this.statusText.setText('⏳ Loading lobby...');

      // Set a timeout to redirect if lobby never appears
      this.time.delayedCall(10000, () => {
        // Only redirect if we still don't have a lobby after 10 seconds
        if (!this.lobby) {
          console.log('❌ Lobby timeout - no lobby data after 10 seconds');
          this.statusText.setText('❌ Lobby timeout');
          this.time.delayedCall(2000, () => {
            this.scene.start('CookieScene', {
              username: this.username,
              uid: this.uid
            });
          });
        }
      });
    }
  }

  private createPlayerCards() {
    // Player 1 card (left)
    this.player1Card = this.add.graphics();
    this.player1Card.fillStyle(0x1a4a1a, 0.8);
    this.player1Card.fillRoundedRect(30, 130, 140, 180, 15);
    this.player1Card.lineStyle(3, 0xffaa00);
    this.player1Card.strokeRoundedRect(30, 130, 140, 180, 15);

    // Player 2 card (right)
    this.player2Card = this.add.graphics();
    this.player2Card.fillStyle(0x1a4a1a, 0.8);
    this.player2Card.fillRoundedRect(190, 130, 140, 180, 15);
    this.player2Card.lineStyle(3, 0xffaa00);
    this.player2Card.strokeRoundedRect(190, 130, 140, 180, 15);

    // Player 1 avatar (ball icon)
    this.player1Avatar = this.add.text(80, 150, '⚽', {
      fontSize: '48px',
      color: '#ffaa00'
    });

    // Player 1 name
    this.player1Name = this.add.text(45, 210, 'You', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold'
    });

    // Player 1 ready status
    this.player1Ready = this.add.text(45, 240, '⏳ Not Ready', {
      fontSize: '12px',
      color: '#ff6666'
    });

    // Player 2 avatar (question mark initially)
    this.player2Avatar = this.add.text(240, 150, '❓', {
      fontSize: '48px',
      color: '#888888'
    });

    // Player 2 name
    this.player2Name = this.add.text(205, 210, 'Waiting...', {
      fontSize: '16px',
      color: '#888888'
    });

    // Player 2 ready status
    this.player2Ready = this.add.text(205, 240, '⏳ Not Ready', {
      fontSize: '12px',
      color: '#888888'
    });
  }

  private onLobbyUpdate(lobby: BallCrushLobby | null) {
    // Add this check at the VERY TOP to prevent errors if scene is shutting down
    if (!this.scene || !this.scene.isActive()) return;

    if (!lobby) {
      // Don't show error immediately - just log it
      console.log('⏳ Waiting for lobby data...');
      this.statusText.setText('⏳ Loading lobby...');
      return; // Don't do anything else, just wait
    }

    // ✅ CHECK IF GAME STARTED - ONLY ONCE AT THE TOP
    if (lobby.status === 'playing' && !this.gameStarted) {
      this.gameStarted = true;
      this.statusText.setText('⚽ Game starting!');
      this.readyButton.setVisible(false);

      // Clear countdown if running
      if (this.countdownTimer) {
        this.countdownTimer.destroy();
      }

      // Navigate to game scene
      this.time.delayedCall(1000, () => {
        this.scene.start('BallCrushGameScene', {
          username: this.username,
          uid: this.uid,
          lobbyId: this.lobbyId,
          lobby: lobby
        });
      });

      // IMPORTANT: Return early so we don't process the rest of the update
      return;
    }

    this.lobby = lobby;

    // Update player displays
    const players = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);

    // Find which player is this user
    const myPlayerIndex = playerIds.indexOf(this.uid);
    const opponentIndex = myPlayerIndex === 0 ? 1 : 0;

    // Update my info (always player 1 card)
    if (lobby.players[this.uid]) {
      this.player1Name.setText(lobby.players[this.uid].displayName || this.username);
      this.player1Ready.setText(lobby.players[this.uid].isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player1Ready.setColor(lobby.players[this.uid].isReady ? '#00ff00' : '#ff6666');

      // Update my avatar color based on ready status
      this.player1Avatar.setColor(lobby.players[this.uid].isReady ? '#00ff00' : '#ffaa00');
    }

    // Update opponent info (player 2 card)
    if (players.length >= 2) {
      const opponent = players[opponentIndex];
      this.player2Name.setText(opponent.displayName);
      this.player2Avatar.setText('⚽');
      this.player2Avatar.setColor(opponent.isReady ? '#00ff00' : '#ffaa00');
      this.player2Ready.setText(opponent.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player2Ready.setColor(opponent.isReady ? '#00ff00' : '#ff6666');

      // Update status based on ready state
      if (players.every(p => p.isReady)) {
        this.statusText.setText('✅ Both players ready! Starting game...');
        this.startCountdown();
      } else {
        this.statusText.setText('⏳ Waiting for both players to ready up...');

        // Enable/disable ready button based on whether I'm ready
        if (!this.isPlayerReady) {
          this.readyButton.setStyle({ backgroundColor: '#4CAF50' });
          this.readyButton.setText('✅ CLICK TO READY UP');
          this.readyButton.setInteractive({ useHandCursor: true });
          this.readyButton.off('pointerdown');
          this.readyButton.on('pointerdown', () => {
            this.setReady();
          });
        } else {
          this.readyButton.setStyle({ backgroundColor: '#888888' });
          this.readyButton.setText('✅ READY! (WAITING)');
          this.readyButton.disableInteractive();
        }
      }
    } else {
      // Only one player
      this.player2Name.setText('Waiting...');
      this.player2Avatar.setText('❓');
      this.player2Ready.setText('⏳ Not Joined');
      this.statusText.setText('⏳ Waiting for opponent to join...');

      this.readyButton.setStyle({ backgroundColor: '#444444' });
      this.readyButton.setText('🔒 WAITING FOR OPPONENT');
      this.readyButton.disableInteractive();
    }

    // Update lobby code display
    this.lobbyCodeText.setText(`Room: ${this.lobbyId.substring(0, 8)}...`);

    // ❌ REMOVE THIS DUPLICATE SECTION (lines 230-250)
    // Check if game started
    // if (lobby.status === 'playing') {
    //   this.statusText.setText('⚽ Game starting!');
    //   this.readyButton.setVisible(false);
    //
    //   // Clear countdown if running
    //   if (this.countdownTimer) {
    //     this.countdownTimer.destroy();
    //   }
    //
    //   // Navigate to game scene
    //   this.time.delayedCall(1000, () => {
    //     this.scene.start('BallCrushGameScene', { 
    //       username: this.username,
    //       uid: this.uid,
    //       lobbyId: this.lobbyId,
    //       lobby: lobby
    //     });
    //   });
    // }
  }

  private async setReady() {
    if (!this.lobby || this.isPlayerReady) return;

    this.isPlayerReady = true;

    this.readyButton.setStyle({ backgroundColor: '#888888' });
    this.readyButton.setText('✅ READY! (WAITING)');
    this.readyButton.disableInteractive();

    // Update ready status in Firebase using ballCrushMultiplayer
    await ballCrushMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);

    // Add a little animation
    this.tweens.add({
      targets: this.player1Card,
      scale: 1.05,
      duration: 200,
      yoyo: true
    });
  }

  private startCountdown() {
    if (this.countdownTimer || this.gameStarted) return; // Add gameStarted check

    this.countdown = 3;
    this.countdownText.setVisible(true);
    this.countdownText.setText('3');

    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;
        this.countdownText.setText(this.countdown.toString());

        // Add a bounce effect
        this.tweens.add({
          targets: this.countdownText,
          scale: 1.5,
          duration: 200,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });

        // Visual feedback on player cards
        if (this.countdown % 2 === 0) {
          this.tweens.add({
            targets: [this.player1Card, this.player2Card],
            alpha: 0.7,
            duration: 200,
            yoyo: true
          });
        }

        if (this.countdown <= 0) {
          this.countdownTimer.destroy();
          this.countdownText.setVisible(false);

          // Automatically start game when countdown finishes
          if (this.lobby && this.lobby.status === 'waiting' && !this.gameStarted) {
            ballCrushMultiplayer.startGame(this.lobbyId);
          }
        }
      },
      repeat: 2
    });
  }

  private async leaveLobby() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.statusText.setText('👋 Leaving lobby...');

    await ballCrushMultiplayer.playerLeave(this.lobbyId, this.uid);

    // Delete the lobby if it's empty
    const lobby = await ballCrushMultiplayer.getLobby(this.lobbyId);
    if (lobby && lobby.playerIds.length === 1) {
      // Only one player left, delete the lobby
      await remove(ref(db, `lobbies/${this.lobbyId}`));
      await remove(ref(db, `gameStates/${this.lobbyId}`));
    }

    this.scene.start('BallCrushStartScene', {
      username: this.username,
      uid: this.uid
    });
  }

  private addBackgroundEffects() {
    // Add floating balls
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(30, 330);
      const y = Phaser.Math.Between(50, 590);
      const size = Phaser.Math.Between(2, 4);

      const ball = this.add.circle(x, y, size * 2, 0xffaa00, 0.1);

      // Floating animation
      this.tweens.add({
        targets: ball,
        y: y + 15,
        duration: 2000 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // Add pulsing background circles
    for (let i = 0; i < 3; i++) {
      const circle = this.add.circle(180, 320, 100 + i * 50, 0xffaa00, 0.02);

      this.tweens.add({
        targets: circle,
        scale: 1.2,
        alpha: 0.04,
        duration: 3000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }
  }
}