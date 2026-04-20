// src/scenes/ball-crush/BallCrushLobbyScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer, BallCrushLobby } from '../../firebase/ballCrushMultiplayer';
import { ref, remove } from 'firebase/database';
import { db } from '../../firebase/init';

export class BallCrushLobbyScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: BallCrushLobby | null = null;
  private unsubscribe: (() => void) | null = null;
  private isPlayerReady: boolean = false;
  private gameStarted: boolean = false;
  private hasHandledOpponentLeft: boolean = false;

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
    console.log('⚽ BallCrush LobbyScene initialized', data);
    this.username = data.username;
    this.uid = data.uid;
    this.lobbyId = data.lobbyId;
    this.isPlayerReady = false;
    this.gameStarted = false;
    this.hasHandledOpponentLeft = false;
  }

  async create() {
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

    // Leave button
    const leaveBtn = this.add.text(40, 580, '← LEAVE LOBBY', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 10, y: 6 }
    }).setInteractive({ useHandCursor: true });

    leaveBtn.on('pointerdown', () => {
      this.leaveLobby();
    });

    // Subscribe to lobby changes
    this.unsubscribe = ballCrushMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      console.log('📡 Lobby update received:', lobby);
      this.onLobbyUpdate(lobby);
    });

    // Check if lobby exists
    console.log('🔍 Checking if lobby exists:', this.lobbyId);
    const lobby = await ballCrushMultiplayer.getLobby(this.lobbyId);
    console.log('🔍 getLobby result:', lobby);

    if (!lobby) {
      console.log('⏳ Lobby not found yet, waiting for subscription...');
      this.statusText.setText('⏳ Loading lobby...');

      this.time.delayedCall(10000, () => {
        if (!this.lobby) {
          console.log('❌ Lobby timeout - no lobby data after 10 seconds');
          this.statusText.setText('❌ Lobby timeout');
          this.time.delayedCall(2000, () => {
            this.scene.start('BallCrushStartScene', {
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

    this.player1Avatar = this.add.text(80, 150, '⚽', { fontSize: '48px', color: '#ffaa00' });
    this.player1Name   = this.add.text(45, 210, 'You', { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' });
    this.player1Ready  = this.add.text(45, 240, '⏳ Not Ready', { fontSize: '12px', color: '#ff6666' });

    this.player2Avatar = this.add.text(240, 150, '❓', { fontSize: '48px', color: '#888888' });
    this.player2Name   = this.add.text(205, 210, 'Waiting...', { fontSize: '16px', color: '#888888' });
    this.player2Ready  = this.add.text(205, 240, '⏳ Not Ready', { fontSize: '12px', color: '#888888' });
  }

  private onLobbyUpdate(lobby: BallCrushLobby | null) {
    if (!this.scene || !this.scene.isActive()) return;

    if (!lobby) {
      this.statusText.setText('⏳ Loading lobby...');
      return;
    }

    // Opponent left before game started — show message and go back
    if (lobby.status === 'dead' && !this.gameStarted && !this.hasHandledOpponentLeft) {
      this.handleOpponentLeft();
      return;
    }

    // Ignore dead lobbies if game already started (handled in game scene)
    if (lobby.status === 'dead' && this.gameStarted) return;

    // Game is starting — hand off to game scene
    if (lobby.status === 'playing' && !this.gameStarted) {
      this.startGame(lobby);
      return;
    }

    this.lobby = lobby;

    const players   = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);

    const myPlayerIndex  = playerIds.indexOf(this.uid);
    const opponentIndex  = myPlayerIndex === 0 ? 1 : 0;

    // Update my card
    if (lobby.players[this.uid]) {
      this.player1Name.setText(lobby.players[this.uid].displayName || this.username);
      this.player1Ready.setText(lobby.players[this.uid].isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player1Ready.setColor(lobby.players[this.uid].isReady ? '#00ff00' : '#ff6666');
      this.player1Avatar.setColor(lobby.players[this.uid].isReady ? '#00ff00' : '#ffaa00');
    }

    // Update opponent card
    if (players.length >= 2) {
      const opponent = players[opponentIndex];
      this.player2Name.setText(opponent.displayName);
      this.player2Avatar.setText('⚽');
      this.player2Avatar.setColor(opponent.isReady ? '#00ff00' : '#ffaa00');
      this.player2Ready.setText(opponent.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.player2Ready.setColor(opponent.isReady ? '#00ff00' : '#ff6666');

      if (players.every(p => p.isReady)) {
        this.statusText.setText('✅ Both players ready! Starting game...');

        // Mark lobby as 'ready' before starting countdown
        if (lobby.status === 'waiting') {
          ballCrushMultiplayer.markLobbyReady(this.lobbyId);
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
          this.readyButton.on('pointerdown', () => { this.setReady(); });
        } else {
          this.readyButton.setStyle({ backgroundColor: '#888888' });
          this.readyButton.setText('✅ READY! (WAITING)');
          this.readyButton.disableInteractive();
        }
      }
    } else {
      // Only one player in lobby
      this.player2Name.setText('Waiting...');
      this.player2Avatar.setText('❓');
      this.player2Ready.setText('⏳ Not Joined');
      this.statusText.setText('⏳ Waiting for opponent to join...');
      this.readyButton.setStyle({ backgroundColor: '#444444' });
      this.readyButton.setText('🔒 WAITING FOR OPPONENT');
      this.readyButton.disableInteractive();
    }

    this.lobbyCodeText.setText(`Room: ${this.lobbyId.substring(0, 8)}...`);
  }

  private handleOpponentLeft() {
    if (this.hasHandledOpponentLeft) return;
    this.hasHandledOpponentLeft = true;

    console.log('👋 Opponent left the lobby');

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }

    ballCrushMultiplayer.setPlayerQueueStatus(this.uid, false).catch(console.error);
    ballCrushMultiplayer.setPlayerOnline(this.uid, false).catch(console.error);

    this.statusText.setText('❌ Opponent left the lobby');

    this.time.delayedCall(2000, () => {
      this.scene.start('BallCrushStartScene', {
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

    await ballCrushMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);

    this.tweens.add({
      targets: this.player1Card,
      scale: 1.05,
      duration: 200,
      yoyo: true
    });
  }

  private startGame(lobby: BallCrushLobby) {
    if (this.gameStarted) return;
    this.gameStarted = true;

    console.log('🎮 Starting game...');
    this.statusText.setText('⚽ Game starting!');
    this.readyButton.setVisible(false);

    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }

    // Determine role: first playerID = bottom, second = top
    const myRole: 'bottom' | 'top' = lobby.playerIds[0] === this.uid ? 'bottom' : 'top';
    console.log(`🎨 My role: ${myRole}`);

    this.time.delayedCall(500, () => {
      this.scene.start('BallCrushGameScene', {
        username: this.username,
        uid: this.uid,
        lobbyId: this.lobbyId,
        role: myRole
      });
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

          // Only the host (first playerID) writes the status change.
          // Both clients wait for Firebase to broadcast status: 'playing',
          // which triggers startGame() for both — prevents double-starts.
          if (this.lobby && !this.gameStarted) {
            const isHost = this.lobby.playerIds[0] === this.uid;
            if (isHost && (this.lobby.status === 'waiting' || this.lobby.status === 'ready')) {
              ballCrushMultiplayer.startGame(this.lobbyId);
            }
          }
        }
      },
      repeat: 2
    });
  }

  private async leaveLobby() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }

    this.statusText.setText('👋 Leaving lobby...');

    await ballCrushMultiplayer.setPlayerQueueStatus(this.uid, false);
    await ballCrushMultiplayer.setPlayerOnline(this.uid, false);

    // Use cancelFromLobby — marks lobby dead and notifies opponent
    // WITHOUT triggering endGame/prize logic (unlike playerLeave)
    await ballCrushMultiplayer.cancelFromLobby(this.lobbyId, this.uid);

    this.scene.start('BallCrushStartScene', {
      username: this.username,
      uid: this.uid
    });
  }

  private addBackgroundEffects() {
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(30, 330);
      const y = Phaser.Math.Between(50, 590);
      const ball = this.add.circle(x, y, Phaser.Math.Between(4, 8), 0xffaa00, 0.1);
      this.tweens.add({
        targets: ball,
        y: y + 15,
        duration: 2000 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

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
    console.log('🛑 BallCrushLobbyScene shutdown()');
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.countdownTimer) {
      this.countdownTimer.destroy();
    }
  }
}