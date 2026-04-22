// src/scenes/flappy-bird/FlappyBirdStartScene.ts
import Phaser from 'phaser';
import {
  getFlappyBirdUserData,
  getFlappyBirdLeaderboard,
  getFlappyBirdPlayerRank,
  getFlappyBirdBalance,
  FlappyBirdUserData,
  FlappyBirdLeaderboardEntry,
  deductFlappyBirdWalletBalance,
} from '../../firebase/flappyBirdSimple';

// ── Colour palette ────────────────────────────────────────────────────────────
// Sky theme: everything reads against a bright blue/cyan sky.
// Strokes are always dark navy (#003366) — never green.
// Value text is white or warm yellow — never neon green.
const C = {
  NAVY:        '#003366',   // stroke on all text
  WHITE:       '#ffffff',
  YELLOW:      '#ffe040',   // primary accent / play button tint
  GOLD:        '#ffd700',   // best score highlight
  MUTED:       '#cceeff',   // small labels — light sky blue-white, readable on sky
  PANEL_FILL:  0x0000,    // frosted glass panels
  PANEL_ALPHA: 0.48,
  PANEL_STROKE:0xffffff,
  PANEL_STROKE_A: 0.65,
};

export class FlappyBirdStartScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';

  private userData:    FlappyBirdUserData | null    = null;
  private leaderboard: FlappyBirdLeaderboardEntry[] = [];
  private playerRank:  number = 0;
  private balance:     number = 0;

  private balanceText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private birdSprite!:  Phaser.GameObjects.Sprite;

  // Parallax clouds
  private cloudLayers: Array<Array<{ obj: Phaser.GameObjects.Graphics; speed: number }>> = [];

  constructor() {
    super({ key: 'FlappyBirdStartScene' });
  }

  init(data: { username: string; uid?: string }) {
    if (!data?.username) { this.scene.start('CookieScene'); return; }
    this.username    = data.username;
    this.uid         = data.uid || '';
    this.cloudLayers = [];
  }

  async create() {
    this.addBackground();
    this.showLoading();
    try {
      await this.fetchAllUserData();
      this.loadingText?.destroy();
      this.buildUI();
    } catch (e) {
      console.error('❌', e);
      this.showError('Failed to load. Please try again.');
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.cloudLayers.forEach(layer =>
      layer.forEach(c => {
        c.obj.x -= c.speed * dt;
        if (c.obj.x < -150) c.obj.x = 410 + Phaser.Math.Between(0, 50);
      })
    );
  }

  // ─── Data ──────────────────────────────────────────────────────────────────
  private async fetchAllUserData() {
    const [userData, leaderboard, rank, balance] = await Promise.all([
      getFlappyBirdUserData(this.uid),
      getFlappyBirdLeaderboard(10),
      getFlappyBirdPlayerRank(this.username),
      getFlappyBirdBalance(this.uid),
    ]);
    if (!userData) throw new Error('No user data');
    this.userData = userData; this.leaderboard = leaderboard;
    this.playerRank = rank;  this.balance = balance;
  }

  // ─── Background ────────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#4EC0CA');

    // bg2.jpg is the pixel art cloudy sky — preferred
    const key = this.textures.exists('background-alt') ? 'background-alt'
              : this.textures.exists('background')      ? 'background'
              : null;
    if (key) this.add.image(180, 320, key).setDisplaySize(360, 640).setDepth(-2);

    // Parallax clouds drawn on top for extra depth
    this.spawnClouds();
  }

  private spawnClouds() {
    const makeClouds = (defs: { x: number; y: number; w: number; h: number }[], alpha: number, speed: number) => {
      const layer: typeof this.cloudLayers[0] = [];
      defs.forEach(d => {
        const g = this.add.graphics().setDepth(1);
        g.x = d.x; g.y = d.y;
        g.fillStyle(0xffffff, alpha);
        g.fillEllipse(0, 0, d.w, d.h);
        g.fillEllipse(-d.w * 0.22, -d.h * 0.38, d.w * 0.58, d.h * 0.68);
        g.fillEllipse(d.w * 0.16, -d.h * 0.30, d.w * 0.48, d.h * 0.62);
        layer.push({ obj: g, speed });
      });
      this.cloudLayers.push(layer);
    };

    // Far layer — slow, translucent
    makeClouds([
      { x: 50,  y: 78,  w: 85,  h: 24 },
      { x: 210, y: 68,  w: 105, h: 28 },
      { x: 340, y: 88,  w: 72,  h: 20 },
    ], 0.32, 6);

    // Near layer — faster, more solid
    makeClouds([
      { x: 110, y: 108, w: 115, h: 34 },
      { x: 295, y: 98,  w: 92,  h: 28 },
    ], 0.5, 14);
  }

  // ─── Full UI ───────────────────────────────────────────────────────────────
  private buildUI() {
    if (!this.userData) return;
    this.addTitle();
    this.addBird();
    this.addStatBar();
    this.addWelcome();
    this.addButtons();
    this.addFooter();
    this.setupKeyboard();
  }

  // ─── Title ─────────────────────────────────────────────────────────────────
  private addTitle() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(28, 18, 304, 64, 14);
    p.lineStyle(2, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(28, 18, 304, 64, 14);

    this.add.text(180, 36, 'FLAPPY BIRD', {
      fontSize: '30px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'O N L I N E', {
      fontSize: '12px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Bird ──────────────────────────────────────────────────────────────────
  private addBird() {
    // Soft white glow behind bird
    const glow = this.add.graphics().setDepth(8);
    glow.fillStyle(0xffffff, 0.25);
    glow.fillCircle(180, 148, 44);
    glow.fillStyle(0xffffff, 0.12);
    glow.fillCircle(180, 148, 60);
    this.tweens.add({ targets: glow, scaleX: 1.07, scaleY: 1.07, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    if (!this.textures.exists('bird-frame1')) {
      this.add.text(180, 148, '🐦', { fontSize: '44px' }).setOrigin(0.5).setDepth(10);
    } else {
      if (!this.anims.exists('fly-start')) {
        this.anims.create({
          key: 'fly-start',
          frames: [{ key: 'bird-frame1' }, { key: 'bird-frame2' }],
          frameRate: 6, repeat: -1,
        });
      }
      this.birdSprite = this.add.sprite(180, 148, 'bird-frame1').setScale(0.18).setDepth(10);
      this.birdSprite.play('fly-start');
      this.tweens.add({ targets: this.birdSprite, y: 138, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ─── Stat bar ──────────────────────────────────────────────────────────────
  private addStatBar() {
    if (!this.userData) return;

    const bg = this.add.graphics().setDepth(9);
    bg.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    bg.fillRoundedRect(8, 184, 344, 50, 12);
    bg.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    bg.strokeRoundedRect(8, 184, 344, 50, 12);

    const stats = [
      { x: 46,  label: 'BAL',   value: `$${this.balance.toFixed(2)}` },
      { x: 136, label: 'RANK',  value: `#${this.playerRank || '—'}`  },
      { x: 226, label: 'BEST',  value: `${this.userData.highScore || 0}` },
      { x: 316, label: 'GAMES', value: `${this.userData.totalGames || 0}` },
    ];

    stats.forEach((s, i) => {
      // Divider
      if (i > 0) {
        const d = this.add.graphics().setDepth(10);
        d.lineStyle(1, 0xffffff, 0.3);
        d.beginPath(); d.moveTo(s.x - 44, 192); d.lineTo(s.x - 44, 226); d.strokePath();
      }

      // Label — muted sky-white, small, navy stroke keeps it crisp
      this.add.text(s.x, 196, s.label, {
        fontSize: '9px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Value — white, bold, navy stroke
      const val = this.add.text(s.x, 213, s.value, {
        fontSize: '14px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      if (i === 0) this.balanceText = val;
    });
  }

  // ─── Welcome text ──────────────────────────────────────────────────────────
  private addWelcome() {
    if (!this.userData) return;
    this.add.text(180, 246, `Welcome, ${this.userData.displayName}!`, {
      fontSize: '15px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 264, `${this.userData.rank}  ·  Level ${this.userData.level}`, {
      fontSize: '11px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Buttons ───────────────────────────────────────────────────────────────
  private addButtons() {
    const cx = 180, startY = 292, gap = 52;
    const W = 230, H = 46;
    const hasBlueBtn = this.textures.exists('blue-button');

    const defs: Array<{ label: string; primary: boolean; action?: string; scene?: string; url?: string }> = [
      { label: '▶  PLAY GAME',      primary: true,  action: 'play' },
      { label: '🏆  LEADERBOARD',   primary: false, scene: 'FlappyBirdLeaderboardScene' },
      { label: '👤  PROFILE',       primary: false, scene: 'FlappyBirdProfileScene' },
      { label: '📊  MY SCORES',     primary: false, scene: 'FlappyBirdScoresScene' },
      { label: '🏆  TOURNAMENT',    primary: false, scene: 'PrizeTournamentScene' },
      { label: '🎮  BACK TO GAMES', primary: false, url: 'https://wintapgames.com/games' },
    ];

    defs.forEach((def, i) => {
      const y = startY + i * gap;

      // Button image or fallback rect
      let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (hasBlueBtn) {
        img = this.add.image(0, 0, 'blue-button').setDisplaySize(W, H);
        // Primary gets warm gold tint; secondary keeps the default blue
        (img as Phaser.GameObjects.Image).setTint(def.primary ? 0xffe040 : 0xffffff);
      } else {
        const g = this.add.graphics();
        g.fillStyle(def.primary ? 0xffc200 : 0x1255aa, 0.92);
        g.fillRoundedRect(-W/2, -H/2, W, H, 12);
        g.lineStyle(2, 0xffffff, 0.75);
        g.strokeRoundedRect(-W/2, -H/2, W, H, 12);
        img = g;
      }

      // Label text colour:
      // — Primary (gold button): dark navy so it contrasts the gold
      // — Secondary (blue button): white
      const txtColor = def.primary ? C.NAVY : C.WHITE;

      const lbl = this.add.text(0, 0, def.label, {
        fontSize: '15px', color: txtColor, fontStyle: 'bold',
        stroke: def.primary ? C.WHITE : C.NAVY,
        strokeThickness: 1,
      }).setOrigin(0.5);

      const container = this.add.container(cx, y, [img as any, lbl]);
      container.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);

      const defaultTint = def.primary ? 0xffe040 : 0xffffff;

      container.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 75 });
        if (hasBlueBtn) (img as Phaser.GameObjects.Image).setTint(0xffff88);
        lbl.setColor(def.primary ? C.NAVY : C.YELLOW);
      });
      container.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 75 });
        if (hasBlueBtn) (img as Phaser.GameObjects.Image).setTint(defaultTint);
        lbl.setColor(txtColor);
      });
      container.on('pointerdown', () => {
        this.tweens.add({
          targets: container, scaleX: 0.95, scaleY: 0.95,
          duration: 55, yoyo: true,
          onComplete: () => this.onButton(def),
        });
      });
    });
  }

  private onButton(def: { action?: string; scene?: string; url?: string }) {
    if (def.url)            { window.location.href = def.url; return; }
    if (def.action === 'play') { this.balance < 1 ? this.showInsufficientFunds() : this.doPlay(); return; }
    if (def.scene)          { this.scene.start(def.scene, { username: this.username, uid: this.uid, userData: this.userData }); }
  }

  private async doPlay() {
    const ok = await deductFlappyBirdWalletBalance(this.uid, 1, 'Flappy Bird entry fee');
    if (!ok) { this.showError('Payment failed. Please try again.'); return; }

    this.balance -= 1;
    if (this.userData) this.userData.balance = this.balance;
    this.balanceText?.setText(`$${this.balance.toFixed(2)}`);

    this.tweens.add({
      targets: this.balanceText, alpha: 0.2, duration: 120, yoyo: true, repeat: 1,
      onComplete: () => this.scene.start('FlappyBirdGameScene', {
        username: this.username, uid: this.uid, userData: this.userData,
      }),
    });
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  private setupKeyboard() {
    if (!this.input.keyboard) return;
    const go = () => this.balance < 1 ? this.showInsufficientFunds() : this.doPlay();
    this.input.keyboard.off('keydown-ENTER').on('keydown-ENTER', go);
    this.input.keyboard.off('keydown-SPACE').on('keydown-SPACE', go);
  }

  // ─── Popups ────────────────────────────────────────────────────────────────
  private showInsufficientFunds() {
    const overlay = this.add.graphics().setDepth(50);
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, 360, 640);

    const card = this.add.graphics().setDepth(51);
    card.fillStyle(0xffffff, 0.97);
    card.fillRoundedRect(40, 218, 280, 186, 16);
    card.lineStyle(3, 0x1199dd, 1);
    card.strokeRoundedRect(40, 218, 280, 186, 16);

    const parts: Phaser.GameObjects.GameObject[] = [overlay, card];

    parts.push(this.add.text(180, 256, '💸', { fontSize: '42px' }).setOrigin(0.5).setDepth(52));
    parts.push(this.add.text(180, 302, 'Insufficient Funds!', {
      fontSize: '18px', color: C.NAVY, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(52));
    parts.push(this.add.text(180, 328, `You need $1.00\nYou have $${this.balance.toFixed(2)}`, {
      fontSize: '13px', color: '#555555', align: 'center',
    }).setOrigin(0.5).setDepth(52));

    const hasBtn = this.textures.exists('blue-button');
    const btnImg = hasBtn
      ? this.add.image(0, 0, 'blue-button').setDisplaySize(130, 42)
      : (() => { const g = this.add.graphics(); g.fillStyle(0x1199dd); g.fillRoundedRect(-65,-21,130,42,10); return g; })();
    const btnLbl = this.add.text(0, 0, 'OK', {
      fontSize: '15px', color: C.NAVY, fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.container(180, 374, [btnImg as any, btnLbl]).setDepth(53);
    btn.setSize(130, 42).setInteractive({ useHandCursor: true });
    parts.push(btn);

    const destroy = () => parts.forEach(p => p.destroy());
    btn.on('pointerdown', destroy);
    this.time.delayedCall(3500, () => { try { destroy(); } catch (_) {} });
  }

  private showLoading() {
    this.loadingText = this.add.text(180, 320, 'LOADING...', {
      fontSize: '22px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
  }

  private showError(msg: string) {
    this.loadingText?.destroy();
    const ov = this.add.graphics().setDepth(40);
    ov.fillStyle(0x000000, 0.6); ov.fillRect(0, 0, 360, 640);
    this.add.text(180, 220, '❌', { fontSize: '48px' }).setOrigin(0.5).setDepth(41);
    this.add.text(180, 280, msg, {
      fontSize: '16px', color: C.WHITE, stroke: C.NAVY, strokeThickness: 2,
      wordWrap: { width: 300 },
    }).setOrigin(0.5).setDepth(41);
    this.add.text(180, 340, '🔄 TRY AGAIN', {
      fontSize: '17px', color: C.WHITE,
      backgroundColor: '#0077cc', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(41)
      .on('pointerdown', () => this.scene.restart({ username: this.username, uid: this.uid }));
  }

  // ─── Footer ────────────────────────────────────────────────────────────────
  private addFooter() {
    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }
}