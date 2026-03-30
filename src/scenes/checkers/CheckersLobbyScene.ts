// src/scenes/checkers/CheckersLobbyScene.ts
import Phaser from 'phaser';
import { checkersMultiplayer, CheckersLobby } from '../../firebase/checkersMultiplayer';
import { ref, remove, update } from 'firebase/database';
import { db } from '../../firebase/init';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

export class CheckersLobbyScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: CheckersLobby | null = null;
  private unsubscribe: (() => void) | null = null;
  private isPlayerReady: boolean = false;
  private gameStarted: boolean = false;
  private hasRefunded: boolean = false;

  // UI Elements
  private statusText!: Phaser.GameObjects.Text;
  private player1Card!: Phaser.GameObjects.Graphics;
  private player2Card!: Phaser.GameObjects.Graphics;
  private player1Name!: Phaser.GameObjects.Text;
  private player2Name!: Phaser.GameObjects.Text;
  private player1Ready!: Phaser.GameObjects.Text;
  private player2Ready!: Phaser.GameObjects.Text;
  private player1Piece!: Phaser.GameObjects.Text;
  private player2Piece!: Phaser.GameObjects.Text;
  private readyButton!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private countdown: number = 3;
  private countdownTimer!: Phaser.Time.TimerEvent;
  private lobbyCodeText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'CheckersLobbyScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string }) {
    console.log('♟️ Checkers LobbyScene initialized', data);

    this.username = data.username;
    this.uid = data.uid;
    this.lobbyId = data.lobbyId;
    this.isPlayerReady = false;
    this.hasRefunded = false;
  }

  async create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.addBackgroundEffects();

    // Title
    this.add.text(180, 40, '♟️ CHECKERS LOBBY', {
      fontSize: '28px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
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

    // Ready button
    this.readyButton = this.add.text(180, 420, '🔒 WAITING FOR OPPONENT', {
      fontSize: '20px',
      color: '#888888',
      backgroundColor: '#444444',
      padding: { x: 20, y: 12 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: false });

    // Countdown text
    this.countdownText = this.add.text(180, 500, '', {
      fontSize: '48px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);

    // Leave button
    const leaveBtn = this.add.text(40, 580, '← LEAVE LOBBY', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 10, y: 6 }
    })
      .setInteractive({ useHandCursor: true });

    leaveBtn.on('pointerdown', () => {
      this.leaveLobby();
    });

    // Subscribe to lobby updates
    this.unsubscribe = checkersMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      console.log('📡 Lobby update received:', lobby);
      this.onLobbyUpdate(lobby);
    });

    // Check if lobby exists
    console.log('🔍 Checking if lobby exists:', this.lobbyId);
    const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
    console.log('🔍 getLobby result:', lobby);

    if (!lobby) {
      console.log('⏳ Lobby not found yet, waiting for subscription...');
      this.statusText.setText('⏳ Loading lobby...');

      this.time.delayedCall(10000, () => {
        if (!this.lobby) {
          console.log('❌ Lobby timeout - no lobby data after 10 seconds');
          this.statusText.setText('❌ Lobby timeout');
          this.time.delayedCall(2000, () => {
            this.scene.start('CheckersStartScene', {
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
    this.player1Card.fillStyle(0x16213e, 0.8);
    this.player1Card.fillRoundedRect(30, 130, 140, 180, 15);
    this.player1Card.lineStyle(3, 0xffd700);
    this.player1Card.strokeRoundedRect(30, 130, 140, 180, 15);

    // Player 2 card (right)
    this.player2Card = this.add.graphics();
    this.player2Card.fillStyle(0x16213e, 0.8);
    this.player2Card.fillRoundedRect(190, 130, 140, 180, 15);
    this.player2Card.lineStyle(3, 0xffd700);
    this.player2Card.strokeRoundedRect(190, 130, 140, 180, 15);

    // Player 1 piece (red)
    this.player1Piece = this.add.text(80, 150, '🔴', {
      fontSize: '48px'
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

    // Player 2 piece (black)
    this.player2Piece = this.add.text(240, 150, '❓', {
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

  private onLobbyUpdate(lobby: CheckersLobby | null) {
    if (!this.scene || !this.scene.isActive()) return;

    if (!lobby) {
      console.log('⏳ Waiting for lobby data...');
      this.statusText.setText('⏳ Loading lobby...');
      return;
    }

    // Check if lobby is dead (opponent left)
    if (lobby.status === 'dead' && !this.gameStarted && !this.hasRefunded) {
      console.log('💀 Lobby is dead - opponent left, refunding player...');
      this.handleOpponentLeft();
      return;
    }

    // Check if game is starting (status changed to 'playing')
    if (lobby.status === 'playing' && !this.gameStarted) {
      console.log('🎮 Game is starting!');
      this.startGame();
      return;
    }

    this.lobby = lobby;

    const players = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);

    const myPlayerIndex = playerIds.indexOf(this.uid);
    const opponentIndex = myPlayerIndex === 0 ? 1 : 0;

    // Update my info
    if (lobby.players[this.uid]) {
      const myPlayer = lobby.players[this.uid];
      this.player1Name.setText(myPlayer.displayName || this.username);
      this.player1Ready.setText(myPlayer.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player1Ready.setColor(myPlayer.isReady ? '#00ff00' : '#ff6666');
      this.player1Piece.setColor(myPlayer.isReady ? '#00ff00' : '#ff0000');
    }

    // Update opponent info
    if (players.length >= 2) {
      const opponent = players[opponentIndex];
      this.player2Name.setText(opponent.displayName);
      this.player2Piece.setText('⚫');
      this.player2Piece.setColor(opponent.isReady ? '#00ff00' : '#000000');
      this.player2Ready.setText(opponent.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player2Ready.setColor(opponent.isReady ? '#00ff00' : '#ff6666');

      if (players.every(p => p.isReady)) {
        this.statusText.setText('✅ Both players ready! Starting game...');

        // Mark lobby as 'ready' before starting countdown
        if (lobby.status === 'waiting') {
          checkersMultiplayer.markLobbyReady(this.lobbyId);
        }

        this.startCountdown();
      } else {
        this.statusText.setText('⏳ Waiting for both players to ready up...');

        if (!this.isPlayerReady) {
          this.readyButton.setStyle({ backgroundColor: '#4CAF50' });
          this.readyButton.setText('✅ CLICK TO READY UP');
          this.readyButton.setColor('#ffffff');
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
      this.player2Name.setText('Waiting...');
      this.player2Piece.setText('❓');
      this.player2Ready.setText('⏳ Not Joined');
      this.statusText.setText('⏳ Waiting for opponent to join...');

      this.readyButton.setStyle({ backgroundColor: '#444444' });
      this.readyButton.setText('🔒 WAITING FOR OPPONENT');
      this.readyButton.disableInteractive();
    }

    this.lobbyCodeText.setText(`Room: ${this.lobbyId.substring(0, 8)}...`);
  }

  private async handleOpponentLeft() {
    if (this.hasRefunded) return;
    this.hasRefunded = true;


    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);

    console.log('💰 Refunding player for opponent leaving...');

    // Show message
    this.statusText.setText('❌ Opponent left the game - Refunding $1');

    // Refund the dollar
    const refundSuccess = await updateCheckersWalletBalance(
      this.uid,
      1.00,
      'refund',
      'Opponent left lobby - refund'
    );

    console.log(refundSuccess ? '✅ Refund successful' : '❌ Refund failed');

    // Show refund message
    const refundText = this.add.text(180, 450, '+$1 REFUNDED', {
      fontSize: '18px',
      color: '#00ff00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.tweens.add({
      targets: refundText,
      y: 400,
      alpha: 0,
      duration: 1500,
      onComplete: () => refundText.destroy()
    });

    // Clean up
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }

    // Go back to start scene after delay
    this.time.delayedCall(2500, () => {
      this.scene.start('CheckersStartScene', {
        username: this.username,
        uid: this.uid
      });
    });
  }

  private async setReady() {
    if (!this.lobby || this.isPlayerReady) return;

    this.isPlayerReady = true;

    this.readyButton.setStyle({ backgroundColor: '#888888' });
    this.readyButton.setText('✅ READY! (WAITING)');
    this.readyButton.disableInteractive();

    await checkersMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);

    this.tweens.add({
      targets: this.player1Card,
      scale: 1.05,
      duration: 200,
      yoyo: true
    });
  }

  private async startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;

    console.log('🎮 Starting game...');
    this.statusText.setText('♟️ Starting game...');

    // Get the player's color from the lobby
    const myPlayer = this.lobby?.players[this.uid];
    const playerColor = myPlayer?.color || 'red';

    console.log(`🎨 My color: ${playerColor}`);

    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to the multiplayer game scene
    this.scene.start('CheckersMultiplayerGameScene', {
      username: this.username,
      uid: this.uid,
      lobbyId: this.lobbyId,
      lobby: this.lobby,
      playerColor: playerColor
    });
  }

  private startCountdown() {
    if (this.countdownTimer || this.gameStarted) return;

    this.countdown = 3;
    this.countdownText.setVisible(true);
    this.countdownText.setText('3');

    this.countdownTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;
        this.countdownText.setText(this.countdown.toString());

        this.tweens.add({
          targets: this.countdownText,
          scale: 1.5,
          duration: 200,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });

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

          if (this.lobby && (this.lobby.status === 'waiting' || this.lobby.status === 'ready') && !this.gameStarted) {
            // Start the game - this changes status to 'playing'
            checkersMultiplayer.startGame(this.lobbyId);
          }
        }
      },
      repeat: 2
    });
  }

  private async leaveLobby() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.countdownTimer) this.countdownTimer.destroy();

    this.statusText.setText('👋 Leaving lobby...');

    // CRITICAL: Reset queue status before leaving
    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);

    // Mark lobby as dead
    await update(ref(db, `lobbies/${this.lobbyId}`), {
      status: 'dead'
    });

    await checkersMultiplayer.playerLeave(this.lobbyId, this.uid);

    this.scene.start('CheckersStartScene', {
      username: this.username,
      uid: this.uid
    });
  }



  private addBackgroundEffects() {
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(30, 330);
      const y = Phaser.Math.Between(50, 590);
      const size = Phaser.Math.Between(2, 4);

      const piece = this.add.text(x, y, i % 2 === 0 ? '🔴' : '⚫', {
        fontSize: `${size * 8}px`,
        alpha: 0.1
      });

      this.tweens.add({
        targets: piece,
        y: y + 15,
        duration: 2000 + i * 300,
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