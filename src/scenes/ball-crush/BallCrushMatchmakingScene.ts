// src/scenes/ball-crush/BallCrushMatchmakingScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer } from '../../firebase/ballCrushMultiplayer';
import { ref, get, onValue, remove } from 'firebase/database';
import { db } from '../../firebase/init';

export class BallCrushMatchmakingScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = '';

  private searchTime: number = 0;
  private searchTimer!: Phaser.Time.TimerEvent;
  private matchCheckInterval: number = 0;
  private cancelled: boolean = false;
  private matchFound: boolean = false;
  private maxSearchTime: number = 60000; // 60 seconds max
  private searchStartTime: number = 0;
  // UI Elements
  private matchListener: (() => void) | null = null;  // Add this line
  private searchText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cancelBtn!: Phaser.GameObjects.Text;
  private ball!: Phaser.GameObjects.Arc;
  private innerBall!: Phaser.GameObjects.Arc;

  constructor() {
    super({ key: 'BallCrushMatchmakingScene' });
  }

  init(data: { username: string; uid: string; displayName: string; avatar: string }) {
    console.log('🎯 BallCrushMatchmakingScene init STARTED with data:', data);

    try {
     

      this.username = data.username || '';
      this.uid = data.uid || '';
      this.displayName = data.displayName || data.username || '';
      this.avatar = data.avatar || 'default';

      console.log('✅ BallCrushMatchmakingScene init SUCCESS:', {
        username: this.username,
        uid: this.uid,
        displayName: this.displayName
      });

    } catch (error) {
      console.error('❌ Error in BallCrushMatchmakingScene init:', error);
    }
  }

  async create() {
    // Background
    this.searchStartTime = Date.now();
    this.cameras.main.setBackgroundColor('#1a3a1a');
    this.addBackgroundBalls();
    // Add after the cancel button or somewhere visible
    const refreshBtn = this.add.text(180, 550, '↻ REFRESH', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    refreshBtn.on('pointerdown', async () => {
      if (!this.matchFound && !this.cancelled) {
        this.statusText.setText('Refreshing...');
        await this.checkForMatch();
      }
    });
    // Title
    this.add.text(180, 100, '⚽ FINDING OPPONENT', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Player info
    this.add.text(180, 150, `Player: ${this.displayName}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Create bouncing ball animation
    this.createBouncingBall();

    // Search text
    this.searchText = this.add.text(180, 380, 'Searching', {
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Status text (shows matchmaking info)
    this.statusText = this.add.text(180, 420, 'Looking for players...', {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // Cancel button
    this.cancelBtn = this.add.text(180, 500, '❌ CANCEL', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 20, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.cancelBtn.on('pointerdown', () => {
      this.cancelSearch();
    });

    // Animate dots on search text
    let dots = 0;
    this.searchTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (!this.matchFound && !this.cancelled) {
          dots = (dots + 1) % 4;
          this.searchText.setText('Searching' + '.'.repeat(dots));
          this.searchTime += 0.5;

          // Pulse animation
          this.tweens.add({
            targets: this.searchText,
            scale: 1.05,
            duration: 200,
            yoyo: true,
            ease: 'Sine.easeInOut'
          });
        }
      },
      loop: true
    });

    // Join matchmaking queue
    await this.joinQueue();
    this.time.addEvent({
      delay: 15000, // Every 15 seconds
      callback: () => {
        if (!this.cancelled && !this.matchFound) {
          ballCrushMultiplayer.setPlayerOnline(this.uid, true);
          ballCrushMultiplayer.setPlayerQueueStatus(this.uid, true);
        }
      },
      loop: true
    });
    // ADD THIS: Listen for direct match notification
    // This is the KEY fix - it will instantly notify when a lobby is created
    const matchRef = ref(db, `matches/${this.uid}`);
    this.matchListener = onValue(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const match = snapshot.val();
        console.log('🎯 DIRECT MATCH NOTIFICATION RECEIVED!', match);

        // Remove the notification so we don't get it again
        remove(ref(db, `matches/${this.uid}`));

        // Stop checking
        if (this.matchCheckInterval) {
          clearInterval(this.matchCheckInterval);
          this.matchCheckInterval = 0;
        }

        // Stop search timer
        if (this.searchTimer) {
          this.searchTimer.destroy();
        }

        // Go to lobby immediately
        this.goToLobby(match.lobbyId);
      }
    });

    this.time.delayedCall(1000, async () => {
      if (!this.matchFound && !this.cancelled) {
        await this.checkForMatch();
      }
    });
    // Start checking for match
    this.startMatchChecking();
  }
  // Add this variable to store the listener


  // Update shutdown to clean up the listener

  private createBouncingBall() {
    // Create main ball
    this.ball = this.add.circle(180, 280, 30, 0xffaa00, 0.9);

    // Inner ball
    this.innerBall = this.add.circle(180, 280, 18, 0xffffff, 0.5);

    // Bounce animation
    this.tweens.add({
      targets: [this.ball, this.innerBall],
      y: 240,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Bounce.easeOut'
    });

    // Pulse animation
    this.tweens.add({
      targets: this.ball,
      scale: 1.2,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Rotation animation for inner ball
    this.tweens.add({
      targets: this.innerBall,
      angle: 360,
      duration: 2000,
      repeat: -1,
      ease: 'Linear'
    });
  }

  private async joinQueue() {
    try {
      console.log('🔍 Joining matchmaking queue...');
      this.statusText.setText('Joining queue...');

      await ballCrushMultiplayer.joinQueue(
        this.uid,
        this.username,
        this.displayName,
        this.avatar
      );

      console.log('✅ Joined matchmaking queue');
      this.statusText.setText('In queue - waiting for opponent...');

    } catch (error) {
      console.error('❌ Failed to join queue:', error);
      this.statusText.setText('Failed to join queue. Retrying...');

      // Retry after 2 seconds
      this.time.delayedCall(2000, () => {
        this.joinQueue();
      });
    }
  }

  private startMatchChecking() {
    console.log('🔍 Starting match check interval...');

    this.matchCheckInterval = window.setInterval(async () => {
      await this.checkForMatch();
    }, 1000); // Check every 2 seconds
  }

  private async checkForMatch() {
    if (this.matchFound || this.cancelled) return;
    if (Date.now() - this.searchStartTime > this.maxSearchTime) {
      // ... timeout code ...
      return;
    }

    try {
      // Get all lobbies
      const lobbiesRef = ref(db, 'lobbies');
      const snapshot = await get(lobbiesRef);

      if (!snapshot.exists()) return;

      const lobbies = snapshot.val();
      let foundLobby = false;
      const now = Date.now();

      // Find a lobby where this player is a member
      for (const [lobbyId, lobbyData] of Object.entries(lobbies)) {
        const lobby = lobbyData as any;

        // Skip old lobbies (older than 5 minutes)
        if (now - lobby.createdAt > 300000) { // 5 minutes in milliseconds
          console.log(`🗑️ Skipping old lobby: ${lobbyId}`);
          continue;
        }

        // Check if it's a ball-crush lobby and contains this player
        if (lobby.gameId === 'ball-crush' &&
          lobby.playerIds &&
          lobby.playerIds.includes(this.uid)) {

          console.log('🎯 Match found! Lobby:', lobbyId);
          this.matchFound = true;
          foundLobby = true;

          // Update UI
          this.statusText.setText('Match found!');
          this.searchText.setText('Opponent located!');

          // Add a flash effect
          this.cameras.main.flash(500, 255, 255, 255);

          // Stop checking
          if (this.matchCheckInterval) {
            clearInterval(this.matchCheckInterval);
            this.matchCheckInterval = 0;
          }

          // Stop search timer
          if (this.searchTimer) {
            this.searchTimer.destroy();
          }

          // Cancel button becomes "CONTINUE"
          this.cancelBtn.setText('✅ CONTINUE');
          this.cancelBtn.setStyle({ backgroundColor: '#4CAF50' });
          this.cancelBtn.off('pointerdown');
          this.cancelBtn.on('pointerdown', () => {
            this.goToLobby(lobbyId);
          });

          // Also auto-continue after 2 seconds
          this.time.delayedCall(2000, () => {
            if (!this.cancelled && this.matchFound) {
              this.goToLobby(lobbyId);
            }
          });

          break;
        }
      }

      // If no lobby found, log that we're still searching
      if (!foundLobby) {
        console.log('⏳ Still searching for match...');
      }

    } catch (error) {
      console.error('Error checking for match:', error);
    }
  }

private isTransitioning: boolean = false;

private goToLobby(lobbyId: string) {
  if (this.isTransitioning) return;
  this.isTransitioning = true;
  
  console.log('🚀 Moving to lobby:', lobbyId);

  // Fade out
  this.cameras.main.fadeOut(500, 0, 0, 0);

  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('BallCrushLobbyScene', {
      username: this.username,
      uid: this.uid,
      lobbyId: lobbyId
    });
  });
}

  private async cancelSearch() {
    if (this.cancelled || this.matchFound) return;

    this.cancelled = true;
    console.log('🚪 Cancelling match search...');

    this.statusText.setText('Cancelling...');

    // Stop timers
    if (this.searchTimer) {
      this.searchTimer.destroy();
    }

    if (this.matchCheckInterval) {
      clearInterval(this.matchCheckInterval);
    }

    // Leave queue
    await ballCrushMultiplayer.leaveQueue(this.uid);

    // Fade out and go back
    this.cameras.main.fadeOut(500, 0, 0, 0);

    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', {
        username: this.username,
        uid: this.uid
      });
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
        y: y + 20,
        x: x + (i % 2 === 0 ? 15 : -15),
        duration: 3000 + i * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // Add small particles
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const size = Phaser.Math.Between(2, 4);

      const dot = this.add.circle(x, y, size, 0xffaa00, 0.1);

      this.tweens.add({
        targets: dot,
        x: x + Phaser.Math.Between(-30, 30),
        y: y + Phaser.Math.Between(-30, 30),
        duration: 4000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  shutdown() {
    // Clean up
    if (this.matchCheckInterval) {
      clearInterval(this.matchCheckInterval);
    }

    if (this.searchTimer) {
      this.searchTimer.destroy();
    }

    if (this.matchListener) {
      this.matchListener();
    }

    // Set offline status
    if (!this.matchFound && !this.cancelled) {
      ballCrushMultiplayer.leaveQueue(this.uid);
    }

    // Always set offline when leaving scene
    ballCrushMultiplayer.setPlayerOnline(this.uid, false);
  }
}