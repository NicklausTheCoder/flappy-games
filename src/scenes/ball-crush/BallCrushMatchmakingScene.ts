// src/scenes/ball-crush/BallCrushMatchmakingScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer } from '../../firebase/ballCrushMultiplayer';
import { ref, onValue, remove } from 'firebase/database';
import { db } from '../../firebase/init';

export class BallCrushMatchmakingScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = '';

  private searchTimer!: Phaser.Time.TimerEvent;
  private heartbeatTimer!: Phaser.Time.TimerEvent;
  private cancelled: boolean = false;
  private matchFound: boolean = false;
  private isTransitioning: boolean = false;
  private maxSearchTime: number = 90000; // 90 seconds
  private searchStartTime: number = 0;

  // Firebase listener — this is the ONLY mechanism for match detection
  private matchListener: (() => void) | null = null;

  // UI
  private searchText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cancelBtn!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private ball!: Phaser.GameObjects.Arc;
  private innerBall!: Phaser.GameObjects.Arc;

  constructor() {
    super({ key: 'BallCrushMatchmakingScene' });
  }

  init(data: { username: string; uid: string; displayName: string; avatar: string }) {
    this.username    = data.username    || '';
    this.uid         = data.uid         || '';
    this.displayName = data.displayName || data.username || '';
    this.avatar      = data.avatar      || 'default';
    this.cancelled   = false;
    this.matchFound  = false;
    this.isTransitioning = false;
  }

  async create() {
    this.searchStartTime = Date.now();

    this.cameras.main.setBackgroundColor('#1a3a1a');
    this.addBackgroundBalls();

    // Title
    this.add.text(180, 100, '⚽ FINDING OPPONENT', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(180, 140, `Player: ${this.displayName}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.createBouncingBall();

    this.searchText = this.add.text(180, 380, 'Searching', {
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.statusText = this.add.text(180, 415, 'Looking for players...', {
      fontSize: '14px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // Elapsed timer
    this.timerText = this.add.text(180, 445, '0s', {
      fontSize: '12px',
      color: '#666666'
    }).setOrigin(0.5);

    // Cancel button
    this.cancelBtn = this.add.text(180, 510, '❌ CANCEL', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 20, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.cancelBtn.on('pointerdown', () => this.cancelSearch());

    // Animated search dots
    let dots = 0;
    this.searchTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (this.matchFound || this.cancelled) return;
        dots = (dots + 1) % 4;
        this.searchText.setText('Searching' + '.'.repeat(dots));

        const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
        this.timerText.setText(`${elapsed}s`);

        // Timeout check
        if (Date.now() - this.searchStartTime > this.maxSearchTime) {
          this.handleTimeout();
        }
      },
      loop: true
    });

    // ── Join queue ──
    await this.joinQueueAndListen();
  }

  private async joinQueueAndListen() {
    if (this.cancelled) return;

    try {
      this.statusText.setText('Joining queue...');

      await ballCrushMultiplayer.joinQueue(
        this.uid,
        this.username,
        this.displayName,
        this.avatar
      );

      this.statusText.setText('In queue — waiting for opponent...');

      // ── THE ONLY match detection mechanism ──
      // The matchmaking service writes to matches/${uid} when a lobby is ready.
      // joinQueue already cleared any stale matches/ entry, so this is clean.
      const matchRef = ref(db, `matches/${this.uid}`);
      this.matchListener = onValue(matchRef, async (snapshot) => {
        if (!snapshot.exists() || this.matchFound || this.cancelled) return;

        const match = snapshot.val();
        console.log('🎯 Match notification received:', match);

        // Validate the lobby actually exists before transitioning
        const lobby = await ballCrushMultiplayer.getLobby(match.lobbyId);
        if (!lobby) {
          console.warn('⚠️ Match notification pointed to missing lobby, re-queuing...');
          await remove(matchRef);
          // Re-join queue — the matchmaker will pair us again
          this.time.delayedCall(500, () => this.joinQueueAndListen());
          return;
        }

        // Consume the notification immediately so it won't re-fire on refresh
        await remove(matchRef);
        this.goToLobby(match.lobbyId);
      });

      // ── Heartbeat: refresh our presence so matchmaker knows we're still alive ──
      this.heartbeatTimer = this.time.addEvent({
        delay: 10000, // every 10 seconds
        callback: async () => {
          if (this.cancelled || this.matchFound) return;
          await ballCrushMultiplayer.setPlayerOnline(this.uid, true);
          await ballCrushMultiplayer.setPlayerQueueStatus(this.uid, true);
        },
        loop: true
      });

    } catch (error) {
      console.error('❌ Failed to join queue:', error);
      this.statusText.setText('Connection error. Retrying...');
      this.time.delayedCall(2000, () => {
        if (!this.cancelled) this.joinQueueAndListen();
      });
    }
  }

  private handleTimeout() {
    if (this.cancelled || this.matchFound) return;
    this.cancelled = true;

    this.statusText.setText('No opponent found. Try again!');
    this.searchText.setText('Timed out');
    this.cancelBtn.setText('🔄 TRY AGAIN');
    this.cancelBtn.setStyle({ backgroundColor: '#ff9800' });
    this.cancelBtn.off('pointerdown');
    this.cancelBtn.on('pointerdown', () => {
      // Reset state and retry
      this.cancelled  = false;
      this.matchFound = false;
      this.searchStartTime = Date.now();
      this.cancelBtn.setText('❌ CANCEL');
      this.cancelBtn.setStyle({ backgroundColor: '#f44336' });
      this.cancelBtn.off('pointerdown');
      this.cancelBtn.on('pointerdown', () => this.cancelSearch());
      this.joinQueueAndListen();
    });
  }

  private goToLobby(lobbyId: string) {
    if (this.isTransitioning || this.cancelled) return;
    this.isTransitioning = true;
    this.matchFound = true;

    this.statusText.setText('Match found! Loading lobby...');
    this.searchText.setText('Opponent located!');
    this.cameras.main.flash(500, 255, 255, 255);

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushLobbyScene', {
        username: this.username,
        uid:      this.uid,
        lobbyId
      });
    });
  }

  private async cancelSearch() {
    if (this.cancelled || this.matchFound) return;
    this.cancelled = true;

    this.statusText.setText('Cancelling...');
    this.stopTimers();

    await ballCrushMultiplayer.leaveQueue(this.uid);

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', {
        username: this.username,
        uid: this.uid
      });
    });
  }

  private stopTimers() {
    if (this.searchTimer)    this.searchTimer.destroy();
    if (this.heartbeatTimer) this.heartbeatTimer.destroy();
  }

  // ── Cleanup when Phaser shuts down the scene ──
  shutdown() {
    this.stopTimers();

    if (this.matchListener) {
      this.matchListener();
      this.matchListener = null;
    }

    if (!this.matchFound && !this.cancelled) {
      ballCrushMultiplayer.leaveQueue(this.uid);
    }

    ballCrushMultiplayer.setPlayerOnline(this.uid, false);
  }

  // ── Visual helpers ────────────────────────────────────────────────────────

  private createBouncingBall() {
    this.ball = this.add.circle(180, 280, 30, 0xffaa00, 0.9);
    this.innerBall = this.add.circle(180, 280, 18, 0xffffff, 0.5);

    this.tweens.add({
      targets: [this.ball, this.innerBall],
      y: 240,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Bounce.easeOut'
    });

    this.tweens.add({
      targets: this.ball,
      scale: 1.2,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: this.innerBall,
      angle: 360,
      duration: 2000,
      repeat: -1,
      ease: 'Linear'
    });
  }

  private addBackgroundBalls() {
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(20, 340);
      const y = Phaser.Math.Between(20, 620);
      const ball = this.add.circle(x, y, Phaser.Math.Between(10, 30), 0xffaa00,
        Phaser.Math.FloatBetween(0.05, 0.15));
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

    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const dot = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xffaa00, 0.1);
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
}