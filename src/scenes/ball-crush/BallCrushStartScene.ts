// src/scenes/ball-crush/BallCrushStartScene.ts
import Phaser from 'phaser';
import {
  getBallCrushBalance,
  getBallCrushUserData,
  getBallCrushLeaderboard,
  BallCrushUserData,
  BallCrushLeaderboardEntry,
} from '../../firebase/ballCrushSimple';

export class BallCrushStartScene extends Phaser.Scene {
  // ── Identity ────────────────────────────────────────────────────────
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = 'default';

  // ── Data ────────────────────────────────────────────────────────────
  private userData: BallCrushUserData | null = null;
  private leaderboard: BallCrushLeaderboardEntry[] = [];
  private playerRank: number = 0;
  private balance: number = 0;

  // ── UI ──────────────────────────────────────────────────────────────
  private balanceText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;

  // ── Star field ──────────────────────────────────────────────────────
  // Three parallax layers: far (slow, dim), mid, near (fast, bright).
  // Each star is a plain circle so no texture is needed.
  private starLayers: Array<Array<{
    obj: Phaser.GameObjects.Arc;
    speed: number;        // px per second downward
  }>> = [];

  // Shooting stars — occasional fast streaks
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  // Button dimensions
  private readonly BTN_W = 220;
  private readonly BTN_H = 52;

  constructor() {
    super({ key: 'BallCrushStartScene' });
  }

  // ─── preload ──────────────────────────────────────────────────────────────
  preload() {
    if (!this.textures.exists('btn-orange')) {
      this.load.image('btn-orange', 'assets/button.png');
    }
    if (!this.textures.exists('btn-dark')) {
      this.load.image('btn-dark', 'assets/button2.png');
    }
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  init(data: { username: string; uid: string; displayName?: string; avatar?: string }) {
    console.log('⚽ BallCrushStartScene received:', data);

    if (!data || !data.username) {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }

    this.username    = data.username;
    this.uid         = data.uid         || '';
    this.displayName = data.displayName || data.username;
    this.avatar      = data.avatar      || 'default';
  }

  // ─── create ───────────────────────────────────────────────────────────────
  async create() {
    console.log('🎨 Creating BallCrushStartScene for:', this.username);

    this.addBackground();   // sets up static BG image + star field
    this.showLoading();

    try {
      await this.fetchAllUserData();
      this.loadingText?.destroy();
      this.buildFullUI();
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      this.showError('Failed to load game data. Please try again.');
    }
  }

  // ─── update (runs every frame) ────────────────────────────────────────────
  update(_time: number, delta: number) {
    const dt      = delta / 1000; // seconds
    const sceneH  = 640;
    const sceneW  = 360;

    // Move every star downward at its layer speed.
    // When it scrolls off the bottom, wrap it back to the top
    // at a random x so the field looks infinite.
    this.starLayers.forEach((layer) => {
      layer.forEach((star) => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > sceneH + 4) {
          star.obj.y = -4;
          star.obj.x = Phaser.Math.Between(0, sceneW);
        }
      });
    });
  }

  // ─── Data fetching ────────────────────────────────────────────────────────
  private async fetchAllUserData() {
    const [userData, leaderboard, balance] = await Promise.all([
      getBallCrushUserData(this.uid),
      getBallCrushLeaderboard(10),
      getBallCrushBalance(this.uid),
    ]);

    if (!userData) throw new Error('No user data found for: ' + this.username);

    this.userData    = userData;
    this.leaderboard = leaderboard;
    this.balance     = balance;

    const rankIndex = leaderboard.findIndex(e => e.username === this.username);
    this.playerRank = rankIndex >= 0 ? rankIndex + 1 : 0;
  }

  // ─── Full UI ──────────────────────────────────────────────────────────────
  private buildFullUI() {
    if (!this.userData) return;
    this.addTitle();
    this.addBallAnimation();
    this.createBalanceDisplay();
    this.createStatsDisplay();
    this.createRankDisplay();
    this.createWelcomeMessage();
    this.createMenuButtons();
    this.addFooter();
  }

  // ─── Background ───────────────────────────────────────────────────────────
  private addBackground() {
    // ── Static space background image (if preloaded by a parent scene) ──
    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
      bg.setDepth(-10);
    } else {
      this.cameras.main.setBackgroundColor('#05050f');
    }

    this.createStarField();
    this.scheduleShootingStars();
  }

  // ─── Star field ───────────────────────────────────────────────────────────
  //
  // Three parallax layers:
  //   Layer 0 — FAR    : tiny (r=1),   slow  (18 px/s),  very dim  (α 0.25–0.45)
  //   Layer 1 — MID    : small (r=1.4),medium (38 px/s), medium    (α 0.45–0.70)
  //   Layer 2 — NEAR   : larger (r=2), fast  (70 px/s),  bright    (α 0.75–1.0)
  //
  // Stars start at random y positions so the field is full from frame 1.

  private createStarField() {
    const sceneW = 360;
    const sceneH = 640;

    const layerDefs = [
      { count: 80,  radius: 1,   speedMin: 14,  speedMax: 22,  alphaMin: 0.20, alphaMax: 0.40 },
      { count: 45,  radius: 1.4, speedMin: 32,  speedMax: 46,  alphaMin: 0.45, alphaMax: 0.70 },
      { count: 20,  radius: 2,   speedMin: 62,  speedMax: 82,  alphaMin: 0.75, alphaMax: 1.00 },
    ];

    this.starLayers = [];

    layerDefs.forEach((def, layerIndex) => {
      const layer: typeof this.starLayers[0] = [];

      for (let i = 0; i < def.count; i++) {
        const x     = Phaser.Math.Between(0, sceneW);
        const y     = Phaser.Math.Between(0, sceneH);
        const alpha = Phaser.Math.FloatBetween(def.alphaMin, def.alphaMax);
        const speed = Phaser.Math.FloatBetween(def.speedMin, def.speedMax);

        // Slight blue-white tint gets warmer on near layers
        const color = layerIndex === 0 ? 0xaabbff
                    : layerIndex === 1 ? 0xddeeff
                    : 0xffffff;

        const obj = this.add.circle(x, y, def.radius, color, alpha);
        obj.setDepth(-5 + layerIndex); // far behind UI but in front of BG image

        // Near-layer stars twinkle slightly
        if (layerIndex === 2) {
          this.tweens.add({
            targets: obj,
            alpha:   { from: alpha * 0.5, to: alpha },
            duration: Phaser.Math.Between(600, 1400),
            yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut',
            delay: Phaser.Math.Between(0, 1200),
          });
        }

        layer.push({ obj, speed });
      }

      this.starLayers.push(layer);
    });
  }

  // ─── Shooting stars ───────────────────────────────────────────────────────
  //
  // A shooting star is a thin Graphics line that streaks diagonally across
  // the screen then destroys itself.  We spawn one every 3–7 seconds.

  private scheduleShootingStars() {
    const spawnNext = () => {
      this.shootingStarTimer = this.time.delayedCall(
        Phaser.Math.Between(3000, 7000),
        () => {
          this.spawnShootingStar();
          spawnNext();
        }
      );
    };
    spawnNext();
  }

  private spawnShootingStar() {
    const sceneW   = 360;
    const length   = Phaser.Math.Between(60, 120);  // streak length in px
    const angle    = Phaser.Math.Between(20, 45);    // degrees below horizontal
    const angleRad = Phaser.Math.DegToRad(angle);
    const dx       = Math.cos(angleRad) * length;
    const dy       = Math.sin(angleRad) * length;

    // Start anywhere along the top half
    const startX = Phaser.Math.Between(20, sceneW - 20);
    const startY = Phaser.Math.Between(20, 200);

    const g = this.add.graphics();
    g.setDepth(-2);

    // Draw a gradient streak: bright head → transparent tail
    // We fake the gradient with 3 overlapping lines of decreasing alpha
    const drawStreak = (progress: number) => {
      g.clear();
      // Tail (dim)
      g.lineStyle(1, 0xffffff, 0.15 * (1 - progress * 0.3));
      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(startX + dx * progress * 0.6, startY + dy * progress * 0.6);
      g.strokePath();
      // Mid
      g.lineStyle(1, 0xddeeff, 0.45 * (1 - progress * 0.2));
      g.beginPath();
      g.moveTo(startX + dx * progress * 0.3, startY + dy * progress * 0.3);
      g.lineTo(startX + dx * progress, startY + dy * progress);
      g.strokePath();
      // Head (bright)
      g.lineStyle(2, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(startX + dx * progress * 0.8, startY + dy * progress * 0.8);
      g.lineTo(startX + dx * progress, startY + dy * progress);
      g.strokePath();
    };

    drawStreak(0);

    // Animate the streak moving across then fade out
    const duration = Phaser.Math.Between(500, 900);
    let prog = 0;

    const ticker = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        prog = Math.min(prog + (16 / duration), 1);
        drawStreak(prog);
        if (prog >= 1) {
          ticker.destroy();
          // Fade out
          this.tweens.add({
            targets: g, alpha: 0, duration: 200,
            onComplete: () => g.destroy(),
          });
        }
      },
    });
  }

  // ─── Title ────────────────────────────────────────────────────────────────
  private addTitle() {
    this.add.text(180, 70, 'BALL CRUSH', {
      fontSize:        '32px',
      color:           '#ffaa00',
      fontStyle:       'bold',
      stroke:          '#8b4513',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Animated ball ────────────────────────────────────────────────────────
  private addBallAnimation() {
    if (!this.textures.exists('ball')) return;

    const ball = this.add.image(180, 140, 'ball');
    ball.setScale(0.2).setDepth(10);

    this.tweens.add({
      targets: ball, y: 128, duration: 800,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: ball, angle: 360, duration: 3000,
      repeat: -1, ease: 'Linear',
    });
  }

  // ─── Welcome message ──────────────────────────────────────────────────────
  private createWelcomeMessage() {
    if (!this.userData) return;

    const winRate = this.userData.totalGames > 0
      ? Math.round((this.userData.totalWins / this.userData.totalGames) * 100)
      : 0;

    this.add.text(180, 190, `Welcome, ${this.displayName}!`, {
      fontSize: '16px', color: '#ffff00',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 210, `Level ${this.userData.level ?? 1}`, {
      fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 230, `Wins: ${this.userData.totalWins} | Win Rate: ${winRate}%`, {
      fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Balance display (top-left) ───────────────────────────────────────────
  private createBalanceDisplay() {
    const bg = this.add.graphics().setDepth(10);
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(5, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(5, 5, 110, 40, 8);

    this.add.text(10, 8,  '💰',   { fontSize: '20px' }).setDepth(10);
    this.add.text(35, 8,  'Bal:', { fontSize: '12px', color: '#ffffff' }).setDepth(10);
    this.balanceText = this.add.text(35, 23, `${this.balance.toFixed(0)}`, {
      fontSize: '14px', color: '#00ff00', fontStyle: 'bold',
    }).setDepth(10);
  }

  // ─── Stats display (top-right) ────────────────────────────────────────────
  private createStatsDisplay() {
    if (!this.userData) return;

    const bg = this.add.graphics().setDepth(10);
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(245, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(245, 5, 110, 40, 8);

    this.add.text(250, 8,  '📊',    { fontSize: '20px' }).setDepth(10);
    this.add.text(275, 8,  'Stats:', { fontSize: '12px', color: '#ffffff' }).setDepth(10);
    this.statsText = this.add.text(265, 23, `${this.userData.totalGames ?? 0} Games`, {
      fontSize: '12px', color: '#ffaa00', fontStyle: 'bold',
    }).setDepth(10);
  }

  // ─── Rank display (top-center) ────────────────────────────────────────────
  private createRankDisplay() {
    const bg = this.add.graphics().setDepth(10);
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(125, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(125, 5, 110, 40, 8);

    this.add.text(130, 8,  '🏆',   { fontSize: '20px' }).setDepth(10);
    this.add.text(160, 8,  'Rank:', { fontSize: '12px', color: '#ffffff' }).setDepth(10);
    this.rankText = this.add.text(165, 23, `#${this.playerRank || 999}`, {
      fontSize: '14px', color: '#ffaa00', fontStyle: 'bold',
    }).setDepth(10);
  }

  // ─── Menu buttons ─────────────────────────────────────────────────────────
  private createMenuButtons() {
    if (!this.userData) return;

    const cx     = 180;
    const startY = 285;
    const gap    = 56;

    const buttons: Array<{
      text: string;
      primary: boolean;
      action?: string;
      scene?: string;
      url?: string;
    }> = [
      { text: '🎮  FIND MATCH',    primary: true,  action: 'matchmaking' },
      { text: '🏆  LEADERBOARD',   primary: false, scene: 'BallCrushLeaderboardScene' },
      { text: '👤  PROFILE',       primary: false, scene: 'BallCrushProfileScene' },
      { text: '📊  MY STATS',      primary: false, scene: 'BallCrushStatsScene' },
      { text: '🎮  BACK TO GAMES', primary: false, url: 'https://wintapgames.com/games' },
    ];

    buttons.forEach((btn, i) => {
      const yPos    = startY + i * gap;
      const texKey  = btn.primary ? 'btn-orange' : 'btn-dark';
      const textCol = btn.primary ? '#ffffff'    : '#e0e8ff';

      const img = this.add.image(0, 0, texKey);
      img.setDisplaySize(this.BTN_W, this.BTN_H);

      const label = this.add.text(0, 0, btn.text, {
        fontSize:        '15px',
        color:           textCol,
        fontStyle:       'bold',
        stroke:          '#000000',
        strokeThickness: btn.primary ? 2 : 1,
      }).setOrigin(0.5, 0.5);

      const container = this.add.container(cx, yPos, [img, label]);
      container.setSize(this.BTN_W, this.BTN_H);
      container.setInteractive({ useHandCursor: true });
      container.setDepth(20);

      container.on('pointerover', () => {
        this.tweens.add({
          targets: container, scaleX: 1.06, scaleY: 1.06,
          duration: 80, ease: 'Sine.easeOut',
        });
        label.setColor('#ffff00');
      });

      container.on('pointerout', () => {
        this.tweens.add({
          targets: container, scaleX: 1, scaleY: 1,
          duration: 80, ease: 'Sine.easeOut',
        });
        label.setColor(textCol);
      });

      container.on('pointerdown', () => {
        this.tweens.add({
          targets: container, scaleX: 0.97, scaleY: 0.97,
          duration: 60, yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => this.handleButtonAction(btn),
        });
      });
    });
  }

  // ─── Button action dispatcher ─────────────────────────────────────────────
  private handleButtonAction(btn: { action?: string; scene?: string; url?: string }) {
    if (btn.url) {
      window.location.href = btn.url;
      return;
    }

    if (btn.action === 'matchmaking') {
      if (this.balance < 1) {
        this.showInsufficientFunds();
        return;
      }
      this.scene.start('BallCrushMatchmakingScene', {
        username:    this.username,
        uid:         this.uid,
        displayName: this.displayName,
        avatar:      this.avatar,
      });
      return;
    }

    if (btn.scene) {
      this.scene.start(btn.scene, {
        username: this.username,
        uid:      this.uid,
        userData: this.userData,
      });
    }
  }

  // ─── Insufficient funds popup ─────────────────────────────────────────────
  private showInsufficientFunds() {
    const popup = this.add.graphics().setDepth(50);
    popup.fillStyle(0x000000, 0.9);
    popup.fillRoundedRect(40, 200, 280, 150, 10);
    popup.lineStyle(2, 0xff0000, 1);
    popup.strokeRoundedRect(40, 200, 280, 150, 10);

    const icon     = this.add.text(180, 230, '⚠️', { fontSize: '40px' }).setOrigin(0.5).setDepth(51);
    const title    = this.add.text(180, 278, 'Insufficient Funds!', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);
    const sub      = this.add.text(180, 308, 'Need $1 to play', {
      fontSize: '14px', color: '#ffff00',
    }).setOrigin(0.5).setDepth(51);
    const closeBtn = this.add.text(180, 338, '  OK  ', {
      fontSize: '16px', color: '#ffffff',
      backgroundColor: '#4CAF50', padding: { x: 20, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(51);

    const destroy = () => {
      popup.destroy(); icon.destroy(); title.destroy();
      sub.destroy(); closeBtn.destroy();
    };

    closeBtn.on('pointerdown', destroy);
    this.time.delayedCall(3000, destroy);
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  private showLoading() {
    this.loadingText = this.add.text(180, 320, 'LOADING...', {
      fontSize: '18px', color: '#ffff00',
    }).setOrigin(0.5).setDepth(10);
  }

  private showError(message: string) {
    this.loadingText?.destroy();

    const overlay = this.add.graphics().setDepth(40);
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, 360, 640);

    this.add.text(180, 200, '❌', { fontSize: '48px', color: '#ff0000' }).setOrigin(0.5).setDepth(41);
    this.add.text(180, 260, message, {
      fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 300 },
    }).setOrigin(0.5).setDepth(41);

    this.add.text(180, 330, '🔄 TRY AGAIN', {
      fontSize: '20px', color: '#ffffff',
      backgroundColor: '#4CAF50', padding: { x: 15, y: 8 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(41)
      .on('pointerdown', () => {
        this.scene.restart({ username: this.username, uid: this.uid });
      });
  }

  // ─── Footer ───────────────────────────────────────────────────────────────
  private addFooter() {
    this.add.text(340, 628, 'Ball Crush v1.0.0', {
      fontSize: '10px', color: '#666666',
    }).setOrigin(1, 0).setDepth(10);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  shutdown() {
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
  }
}