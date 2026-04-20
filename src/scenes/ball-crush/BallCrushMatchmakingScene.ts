// src/scenes/ball-crush/BallCrushMatchmakingScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer } from '../../firebase/ballCrushMultiplayer';
import { updateBallCrushWalletBalance } from '../../firebase/ballCrushSimple';
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

  /**
   * Tracks whether we successfully deducted the $1 fee this session.
   * Ensures we only refund if we actually charged, and never charge twice.
   */
  private feeCharged: boolean = false;

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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚽ BallCrushMatchmakingScene init STARTED');
    console.log('📦 Data received:', data);

    // CRITICAL: Reset ALL flags — prevents stale state from previous sessions
    this.username        = data.username    || '';
    this.uid             = data.uid         || '';
    this.displayName     = data.displayName || data.username || '';
    this.avatar          = data.avatar      || 'default';
    this.cancelled       = false;
    this.matchFound      = false;
    this.isTransitioning = false;
    this.feeCharged      = false; // Reset so we don't double-charge
    this.searchStartTime = 0;

    // Clean up any existing timers/listeners from a previous run
    if (this.searchTimer) {
      this.searchTimer.destroy();
      this.searchTimer = null as any;
    }
    if (this.heartbeatTimer) {
      this.heartbeatTimer.destroy();
      this.heartbeatTimer = null as any;
    }
    if (this.matchListener) {
      this.matchListener();
      this.matchListener = null;
    }

    console.log('✅ Parsed values:', { username: this.username, uid: this.uid });
    console.log('   flags reset: cancelled=false, matchFound=false, isTransitioning=false');
  }

  async create() {
    console.log('🎬 BallCrushMatchmakingScene create() started');
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

    this.cancelBtn.on('pointerdown', () => {
      console.log('🖱️ Cancel button clicked');
      this.cancelSearch();
    });

    // ── STEP 1: Clear stale match notifications ──
    console.log(`🗑️ Clearing stale match notifications for ${this.uid}`);
    await remove(ref(db, `matches/${this.uid}`));
    console.log('✅ Stale notifications cleared');

    // ── STEP 2: Charge the $1 fee ONCE before doing anything else ──
    // Done here (not in the start scene) so retries don't double-charge.
    console.log('💰 Charging $1 game fee...');
    const feeSuccess = await updateBallCrushWalletBalance(
      this.uid,
      1.00,
      'game_fee',
      'Ball Crush game fee'
    );

    if (!feeSuccess) {
      console.error('❌ Insufficient funds!');
      this.safeSetText(this.statusText, '❌ Insufficient funds!');
      this.time.delayedCall(2000, () => {
        this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
      });
      return; // feeCharged stays false — no refund will be issued
    }

    this.feeCharged = true;
    console.log('✅ $1 fee charged — feeCharged=true');

    // ── STEP 3: Set up match listener BEFORE joining queue ──
    console.log(`📡 Setting up match listener for: matches/${this.uid}`);
    const matchRef = ref(db, `matches/${this.uid}`);
    this.matchListener = onValue(matchRef, (snapshot) => {
      console.log('🔔 MATCH LISTENER FIRED');
      console.log(`   exists=${snapshot.exists()} matchFound=${this.matchFound} isTransitioning=${this.isTransitioning} cancelled=${this.cancelled}`);

      if (snapshot.exists() && !this.matchFound && !this.isTransitioning && !this.cancelled) {
        const match = snapshot.val();
        console.log('🎯 VALID MATCH — proceeding to lobby!', match);

        // Remove the notification immediately so it won't re-fire on refresh
        remove(ref(db, `matches/${this.uid}`)).catch((err) =>
          console.error('❌ Failed to remove match notification:', err)
        );

        this.goToLobby(match.lobbyId);
      } else {
        if (!snapshot.exists()) console.log('   → snapshot empty, ignoring');
        if (this.matchFound) console.log('   → matchFound already true, ignoring duplicate');
        if (this.isTransitioning) console.log('   → already transitioning, ignoring');
        if (this.cancelled) console.log('   → cancelled, ignoring');
      }
    });

    // ── STEP 4: Animated search dots + elapsed timer ──
    let dots = 0;
    this.searchTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (!this.matchFound && !this.cancelled) {
          dots = (dots + 1) % 4;
          this.searchText.setText('Searching' + '.'.repeat(dots));

          const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
          this.timerText.setText(`${elapsed}s`);
        }
      },
      loop: true
    });

    // ── STEP 5: Join the matchmaking queue ──
    console.log('📝 Joining queue...');
    await this.joinQueue();

    // ── STEP 6: Heartbeat — keep presence alive every 10 seconds ──
    this.heartbeatTimer = this.time.addEvent({
      delay: 10000,
      callback: async () => {
        if (!this.cancelled && !this.matchFound) {
          console.log(`💓 Heartbeat for ${this.uid}`);
          await ballCrushMultiplayer.setPlayerOnline(this.uid, true);
          await ballCrushMultiplayer.setPlayerQueueStatus(this.uid, true);
        }
      },
      loop: true
    });

    // ── STEP 7: Timeout handler ──
    console.log(`⏱️ Timeout set for ${this.maxSearchTime / 1000}s`);
    this.time.delayedCall(this.maxSearchTime, () => {
      console.log('⏰ TIMEOUT CHECK');
      console.log(`   matchFound=${this.matchFound} cancelled=${this.cancelled} isTransitioning=${this.isTransitioning}`);

      if (!this.matchFound && !this.cancelled && !this.isTransitioning) {
        console.log('⚠️ Search timed out');
        this.handleTimeout();
      } else {
        console.log('✅ Timeout ignored — match found or cancelled already');
      }
    });

    // ── STEP 8: Force matchmaking service restart at 20s if no match yet ──
    this.time.delayedCall(20000, () => {
      if (!this.matchFound && !this.cancelled) {
        console.log('🔧 Forcing matchmaking service restart...');
        ballCrushMultiplayer.stopMatchmakingService();
        ballCrushMultiplayer.startMatchmakingService();
      }
    });

    console.log('✅ create() complete — waiting for match...');
  }

  /**
   * Joins the queue. Retries on network failure.
   */
  private async joinQueue() {
    console.log('🔍 joinQueue() called');

    if (this.cancelled || this.matchFound || this.isTransitioning) {
      console.log('⚠️ joinQueue skipped — scene already ending');
      return;
    }

    try {
      console.log('🎮 Calling ballCrushMultiplayer.joinQueue()...');
      await ballCrushMultiplayer.joinQueue(
        this.uid,
        this.username,
        this.displayName,
        this.avatar
      );
      console.log('✅ Successfully joined queue!');
      this.safeSetText(this.statusText, 'In queue — waiting for opponent...');

    } catch (error) {
      console.error('❌ Failed to join queue:', error);
      this.safeSetText(this.statusText, 'Connection issue, retrying...');

      // Retry after 2 seconds
      this.time.delayedCall(2000, () => {
        if (!this.cancelled && !this.matchFound && !this.isTransitioning) {
          console.log('🔄 Retrying joinQueue...');
          this.joinQueue();
        }
      });
    }
  }

  private handleTimeout() {
    if (this.matchFound || this.cancelled || this.isTransitioning) {
      console.log('⚠️ Timeout ignored');
      return;
    }

    this.cancelled = true;
    this.isTransitioning = true;

    this.safeSetText(this.statusText, 'No opponent found. Try again!');
    this.safeSetText(this.searchText, 'Timed out');

    if (this.searchTimer) this.searchTimer.destroy();
    if (this.heartbeatTimer) this.heartbeatTimer.destroy();
    if (this.matchListener) {
      this.matchListener();
      this.matchListener = null;
    }

    ballCrushMultiplayer.leaveQueue(this.uid).then(() => {
      console.log('✅ Left queue after timeout');
    });

    // Refund ONLY if we actually charged
    this.issueRefund('Matchmaking timeout');

    // Show retry button
    this.cancelBtn.setText('🔄 TRY AGAIN');
    this.cancelBtn.setStyle({ backgroundColor: '#ff9800' });
    this.cancelBtn.off('pointerdown');
    this.cancelBtn.on('pointerdown', () => {
      this.scene.restart({
        username: this.username,
        uid: this.uid,
        displayName: this.displayName,
        avatar: this.avatar
      });
    });
  }

  /**
   * Issues a $1 refund if and only if feeCharged is true.
   * Sets feeCharged = false afterwards to prevent double-refunds.
   */
  private async issueRefund(reason: string) {
    if (!this.feeCharged) {
      console.log('ℹ️ No refund needed — fee was never charged');
      return;
    }

    this.feeCharged = false; // Prevent double-refund even if called twice
    console.log(`💰 Issuing $1 refund — reason: ${reason}`);

    try {
      await updateBallCrushWalletBalance(
        this.uid,
        1.00,
        'refund',
        `${reason} - refund`
      );
      console.log('✅ $1 refund issued successfully');

      if (this.scene && this.scene.isActive()) {
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
      }
    } catch (err) {
      console.error('❌ Refund failed!', err);
    }
  }

  private goToLobby(lobbyId: string) {
    console.log('🎉 goToLobby() —', lobbyId);

    if (this.matchFound || this.isTransitioning) {
      console.log('⚠️ Duplicate match event ignored');
      return;
    }

    this.matchFound = true;
    this.isTransitioning = true;

    this.safeSetText(this.statusText, 'Match found! Loading lobby...');
    this.safeSetText(this.searchText, 'Opponent located!');
    this.cameras.main.flash(500, 255, 255, 255);

    this.cancelBtn.disableInteractive();
    this.cancelBtn.setStyle({ backgroundColor: '#888888' });

    if (this.searchTimer) this.searchTimer.destroy();
    if (this.heartbeatTimer) this.heartbeatTimer.destroy();

    ballCrushMultiplayer.setPlayerQueueStatus(this.uid, false).catch(console.error);

    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      console.log(`🚀 → BallCrushLobbyScene lobbyId=${lobbyId}`);
      this.scene.start('BallCrushLobbyScene', {
        username: this.username,
        uid: this.uid,
        lobbyId
      });
    });
  }

  private async cancelSearch() {
    console.log('🚪 cancelSearch()');
    console.log(`   cancelled=${this.cancelled} matchFound=${this.matchFound} isTransitioning=${this.isTransitioning}`);

    if (this.cancelled || this.matchFound || this.isTransitioning) {
      console.log('⚠️ Cancel ignored');
      return;
    }

    this.cancelled = true;
    this.isTransitioning = true;
    this.safeSetText(this.statusText, 'Cancelling...');

    if (this.searchTimer) this.searchTimer.destroy();
    if (this.heartbeatTimer) this.heartbeatTimer.destroy();
    if (this.matchListener) {
      this.matchListener();
      this.matchListener = null;
    }

    console.log('🗑️ Leaving queue...');
    await ballCrushMultiplayer.leaveQueue(this.uid);
    console.log('✅ Left queue');

    // Refund ONLY if we actually charged
    await this.issueRefund('Matchmaking cancelled');

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', {
        username: this.username,
        uid: this.uid
      });
    });
  }

  /** Safely set text — checks scene is still active first */
  private safeSetText(textObj: Phaser.GameObjects.Text, value: string) {
    if (this.scene && this.scene.isActive() && textObj && textObj.active) {
      textObj.setText(value);
    }
  }

  // ── Cleanup when Phaser shuts down the scene ──
  shutdown() {
    console.log('🛑 BallCrushMatchmakingScene shutdown()');
    console.log(`   matchFound=${this.matchFound} isTransitioning=${this.isTransitioning} cancelled=${this.cancelled}`);

    if (this.searchTimer) this.searchTimer.destroy();
    if (this.heartbeatTimer) this.heartbeatTimer.destroy();

    if (this.matchListener) {
      this.matchListener();
      this.matchListener = null;
    }

    // If shutdown fires unexpectedly (e.g. browser close, scene switch from outside)
    // and we haven't cancelled/matched yet, clean up and refund.
    if (!this.matchFound && !this.cancelled && !this.isTransitioning) {
      console.log('⚠️ Unexpected shutdown — issuing refund and leaving queue');
      this.issueRefund('Unexpected shutdown');
      ballCrushMultiplayer.leaveQueue(this.uid);
      ballCrushMultiplayer.setPlayerOnline(this.uid, false);
    } else {
      console.log('✅ Cleanup skipped — match found or intentionally cancelled');
    }
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