// src/scenes/checkers/CheckersStartScene.ts
import Phaser from 'phaser';
import {
  getCheckersUserData,
  getCheckersLeaderboard,
  CheckersUserData,
  getCheckersBalance,
  CheckersLeaderboardEntry,
} from '../../firebase/checkersService';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  DARK_WOOD:  '#1a0d00',
  MID_WOOD:   '#3d1a00',
  GOLD:       '#ffaa00',
  GOLD_DIM:   '#cc8800',
  WHITE:      '#ffffff',
  CREAM:      '#f5e6c8',
  RED_PIECE:  0xcc2200,
  BLACK_PIECE:0x222222,
  NAVY:       '#001a44',
};

export class CheckersStartScene extends Phaser.Scene {
  private username:    string = '';
  private uid:         string = '';
  private displayName: string = '';
  private avatar:      string = 'default';

  private userData:    CheckersUserData | null      = null;
  private leaderboard: CheckersLeaderboardEntry[]   = [];
  private playerRank:  number = 0;
  private balance:     number = 0;

  private balanceText!:    Phaser.GameObjects.Text;
  private loadingText!:    Phaser.GameObjects.Text;
  private findMatchLocked: boolean = false;

  // Parallax board squares
  private bgSquares: Array<{ obj: Phaser.GameObjects.Rectangle; speed: number }> = [];

  constructor() {
    super({ key: 'CheckersStartScene' });
  }

  init(data: { username: string; uid?: string; displayName?: string; avatar?: string }) {
    if (!data?.username) { this.showErrorAndRedirect('No username provided'); return; }
    this.username        = data.username;
    this.uid             = data.uid || '';
    this.displayName     = data.displayName || data.username;
    this.avatar          = data.avatar || 'default';
    this.findMatchLocked = false;
    this.bgSquares       = [];
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
      this.showError('Failed to load game data. Please try again.');
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.bgSquares.forEach(s => {
      s.obj.y -= s.speed * dt;
      if (s.obj.y < -20) s.obj.y = 660;
    });
  }

  // ─── Data ───────────────────────────────────────────────────────────────────
  private async fetchAllUserData() {
    const [userData, leaderboard, balance] = await Promise.all([
      getCheckersUserData(this.uid),
      getCheckersLeaderboard(10),
      getCheckersBalance(this.uid),
    ]);
    if (!userData) throw new Error('No user data');
    this.userData    = userData;
    this.leaderboard = leaderboard;
    this.balance     = balance;
    const ri         = leaderboard.findIndex(e => e.username === this.username);
    this.playerRank  = ri >= 0 ? ri + 1 : 0;
  }

  // ─── Background ─────────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#1a0d00');

    // Try the marble checkerboard bg photo
    const bgKey = this.textures.exists('checkers-bg') ? 'checkers-bg'
                : this.textures.exists('checkers-bg2') ? 'checkers-bg2'
                : null;

    if (bgKey) {
      const bg = this.add.image(180, 320, bgKey).setDisplaySize(360, 640).setDepth(-2);
      // Darken to keep text readable
      const dim = this.add.graphics().setDepth(-1);
      dim.fillStyle(0x000000, 0.62);
      dim.fillRect(0, 0, 360, 640);
    } else {
      // Hand-drawn checkerboard fallback
      this.drawCheckerboard();
    }

    // Floating diagonal squares for depth (subtle, slow)
    this.addFloatingSquares();
  }

  private drawCheckerboard() {
    const size = 45;
    const cols = Math.ceil(360 / size) + 1;
    const rows = Math.ceil(640 / size) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isDark = (r + c) % 2 === 0;
        this.add.rectangle(
          c * size + size/2, r * size + size/2,
          size, size,
          isDark ? 0x1a0d00 : 0x3d1a00, 1
        ).setDepth(-2);
      }
    }
  }

  private addFloatingSquares() {
    for (let i = 0; i < 12; i++) {
      const size  = Phaser.Math.Between(14, 30);
      const isDark = i % 2 === 0;
      const sq = this.add.rectangle(
        Phaser.Math.Between(0, 360),
        Phaser.Math.Between(0, 640),
        size, size,
        isDark ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.04, 0.12)
      ).setDepth(0).setAngle(45);
      this.bgSquares.push({ obj: sq, speed: Phaser.Math.FloatBetween(8, 22) });
    }
  }

  // ─── Full UI ────────────────────────────────────────────────────────────────
  private buildUI() {
    if (!this.userData) return;
    this.addTitle();
    this.addPieceAnimation();
    this.addStatBar();
    this.addWelcome();
    this.addButtons();
    this.addFooter();
    this.setupKeyboard();
  }

  // ─── Title ──────────────────────────────────────────────────────────────────
  private addTitle() {
    const bg = this.add.graphics().setDepth(9);
    bg.fillStyle(0x3d1a00, 0.95);
    bg.fillRoundedRect(24, 18, 312, 66, 14);
    bg.lineStyle(2, 0xffaa00, 0.85);
    bg.strokeRoundedRect(24, 18, 312, 66, 14);
    // Inner accent line
    const inner = this.add.graphics().setDepth(10);
    inner.lineStyle(1, 0xffaa00, 0.28);
    inner.strokeRoundedRect(30, 24, 300, 54, 10);

    this.add.text(180, 37, 'CHECKERS', {
      fontSize: '30px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 5,
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 68, 'O N L I N E', {
      fontSize: '12px', color: C.GOLD, letterSpacing: 6,
      stroke: C.MID_WOOD, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);
  }

  // ─── Animated pieces ────────────────────────────────────────────────────────
  private addPieceAnimation() {
    // Central display — two pieces flanking each other
    const cx = 180, cy = 150;

    // Glow behind pieces
    const glow = this.add.graphics().setDepth(8);
    glow.fillStyle(0xffaa00, 0.12);
    glow.fillCircle(cx, cy, 55);
    this.tweens.add({ targets: glow, scaleX: 1.1, scaleY: 1.1, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    if (this.textures.exists('red_normal') && this.textures.exists('black_normal')) {
      // Real textures
      const red   = this.add.image(cx - 32, cy, 'red_normal').setDisplaySize(46, 46).setDepth(10);
      const black = this.add.image(cx + 32, cy, 'black_normal').setDisplaySize(46, 46).setDepth(10);
      this.tweens.add({ targets: red,   y: cy - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 0 });
      this.tweens.add({ targets: black, y: cy - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 450 });
      // VS text between them
      this.add.text(cx, cy, 'VS', {
        fontSize: '14px', color: C.GOLD, fontStyle: 'bold',
        stroke: C.MID_WOOD, strokeThickness: 3,
      }).setOrigin(0.5).setDepth(11);
    } else {
      // Fallback hand-drawn pieces
      this.drawPiece(cx - 32, cy, C.RED_PIECE, 10);
      this.drawPiece(cx + 32, cy, C.BLACK_PIECE, 10);
      this.add.text(cx, cy, 'VS', {
        fontSize: '14px', color: C.GOLD, fontStyle: 'bold',
        stroke: C.MID_WOOD, strokeThickness: 3,
      }).setOrigin(0.5).setDepth(11);
    }
  }

  private drawPiece(x: number, y: number, color: number, r: number) {
    this.add.circle(x, y, r + 2, 0x3d1a00, 1).setDepth(9);
    this.add.circle(x, y, r, color, 1).setDepth(10);
    this.add.circle(x, y, r - 3, Phaser.Display.Color.ValueToColor(color).lighten(15).color, 0.7).setDepth(11);
    this.add.circle(x - r * 0.3, y - r * 0.3, r * 0.25, 0xffffff, 0.25).setDepth(12);
  }

  // ─── Stat bar ───────────────────────────────────────────────────────────────
  private addStatBar() {
    if (!this.userData) return;

    const bg = this.add.graphics().setDepth(9);
    bg.fillStyle(0x3d1a00, 0.92);
    bg.fillRoundedRect(8, 184, 344, 50, 12);
    bg.lineStyle(1.5, 0xffaa00, 0.7);
    bg.strokeRoundedRect(8, 184, 344, 50, 12);

    const winRate = this.userData.gamesPlayed > 0
      ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100)
      : 0;

    const stats = [
      { x: 46,  label: 'BAL',   value: `$${this.balance.toFixed(2)}` },
      { x: 136, label: 'RANK',  value: `#${this.playerRank || '—'}` },
      { x: 226, label: 'WINS',  value: `${this.userData.gamesWon || 0}` },
      { x: 316, label: 'RATE',  value: `${winRate}%` },
    ];

    stats.forEach((s, i) => {
      if (i > 0) {
        const d = this.add.graphics().setDepth(10);
        d.lineStyle(1, 0xffaa00, 0.2);
        d.beginPath(); d.moveTo(s.x - 44, 192); d.lineTo(s.x - 44, 226); d.strokePath();
      }
      this.add.text(s.x, 196, s.label, {
        fontSize: '9px', color: C.GOLD_DIM, letterSpacing: 1,
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      const val = this.add.text(s.x, 213, s.value, {
        fontSize: '14px', color: C.GOLD, fontStyle: 'bold',
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      if (i === 0) this.balanceText = val;
    });
  }

  // ─── Welcome ────────────────────────────────────────────────────────────────
  private addWelcome() {
    if (!this.userData) return;
    this.add.text(180, 246, `Welcome back, ${this.displayName}!`, {
      fontSize: '15px', color: C.CREAM, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 264, `${this.userData.rank}  ·  Level ${this.userData.level}`, {
      fontSize: '11px', color: C.GOLD_DIM,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Buttons ────────────────────────────────────────────────────────────────
  //
  // Uses the wood plank button texture.
  // Primary (FIND MATCH) gets no tint — natural wood looks great as CTA.
  // Secondary buttons get a slightly darker tint.
  //
  private addButtons() {
    const cx = 180, startY = 294, gap = 52;
    const W = 234, H = 44;
    const hasWoodBtn = this.textures.exists('wood-button');

    const defs: Array<{
      label: string; primary: boolean;
      action?: string; scene?: string; url?: string;
    }> = [
      { label: '♟  FIND MATCH',    primary: true,  action: 'findMatch' },
      { label: '🏆  LEADERBOARD',  primary: false, scene: 'CheckersLeaderboardScene' },
      { label: '👤  PROFILE',      primary: false, scene: 'CheckersProfileScene' },
      { label: '📊  MY STATS',     primary: false, scene: 'CheckersStatsScene' },
      { label: '🎮  BACK TO GAMES',primary: false, url: 'https://wintapgames.com/games' },
    ];

    defs.forEach((def, i) => {
      const y = startY + i * gap;

      let imgObj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

      if (hasWoodBtn) {
        const img = this.add.image(0, 0, 'wood-button').setDisplaySize(W, H);
        // Primary: natural warm wood. Secondary: slightly cooler tint.
        img.setTint(def.primary ? 0xffdd99 : 0xcc9966);
        imgObj = img;
      } else {
        const g = this.add.graphics();
        g.fillStyle(def.primary ? 0xd4813a : 0x8b4513, 0.95);
        g.fillRoundedRect(-W/2, -H/2, W, H, 10);
        g.lineStyle(2, def.primary ? 0xffdd99 : 0xffaa00, 0.9);
        g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
        imgObj = g;
      }

      // Text: dark wood colour on the plank so it reads against the grain
      const txtColor = def.primary ? C.MID_WOOD : C.DARK_WOOD;
      const strokeColor = def.primary ? '#8b4513' : '#3d1a00';

      const lbl = this.add.text(0, 0, def.label, {
        fontSize: '15px', color: txtColor, fontStyle: 'bold',
        stroke: strokeColor, strokeThickness: 1,
      }).setOrigin(0.5);

      const container = this.add.container(cx, y, [imgObj as any, lbl]);
      container.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);

      const defaultTint = def.primary ? 0xffdd99 : 0xcc9966;

      container.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 75 });
        if (hasWoodBtn) (imgObj as Phaser.GameObjects.Image).setTint(0xffeebb);
        lbl.setColor(C.GOLD);
      });
      container.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 75 });
        if (hasWoodBtn) (imgObj as Phaser.GameObjects.Image).setTint(defaultTint);
        lbl.setColor(txtColor);
      });
      container.on('pointerdown', () => {
        this.tweens.add({
          targets: container, scaleX: 0.95, scaleY: 0.95,
          duration: 55, yoyo: true,
          onComplete: () => this.onButton(def, container, imgObj as Phaser.GameObjects.Image, lbl, txtColor, defaultTint, hasWoodBtn),
        });
      });
    });
  }

  private onButton(
    def: { action?: string; scene?: string; url?: string },
    container: Phaser.GameObjects.Container,
    imgObj: Phaser.GameObjects.Image,
    lbl: Phaser.GameObjects.Text,
    txtColor: string,
    defaultTint: number,
    hasWoodBtn: boolean,
  ) {
    if (def.url)                  { window.location.href = def.url; return; }
    if (def.action === 'findMatch') { this.handleFindMatch(container, imgObj, lbl, txtColor, defaultTint, hasWoodBtn); return; }
    if (def.scene) {
      this.scene.start(def.scene, { username: this.username, uid: this.uid, userData: this.userData });
    }
  }

  private async handleFindMatch(
    container: Phaser.GameObjects.Container,
    imgObj:    Phaser.GameObjects.Image,
    lbl:       Phaser.GameObjects.Text,
    txtColor:  string,
    defaultTint: number,
    hasWoodBtn:  boolean,
  ) {
    if (this.findMatchLocked) return;
    this.findMatchLocked = true;

    // Loading state
    lbl.setText('⏳  SEARCHING...');
    container.disableInteractive();
    const pulse = this.tweens.add({ targets: container, alpha: 0.6, duration: 380, yoyo: true, repeat: -1 });

    const restore = () => {
      pulse.stop(); container.setAlpha(1);
      lbl.setText('♟  FIND MATCH'); lbl.setColor(txtColor);
      if (hasWoodBtn) (imgObj as any).setTint(defaultTint);
      container.setInteractive({ useHandCursor: true });
      this.findMatchLocked = false;
    };

    try {
      const { getCheckersBalance } = await import('../../firebase/checkersService');
      const live = await getCheckersBalance(this.uid);

      if (live < 1) {
        restore();
        this.showInsufficientFunds();
        return;
      }

      pulse.stop();
      container.setAlpha(1);
      lbl.setText('✅  FOUND!');

      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('CheckersMatchmakingScene', {
          username: this.username, uid: this.uid, userData: this.userData,
        });
      });

    } catch (e) {
      console.error('❌ Find match error:', e);
      restore();
      this.showError('Connection error. Please try again.');
    }
  }

  // ─── Keyboard ───────────────────────────────────────────────────────────────
  private setupKeyboard() {
    if (!this.input.keyboard) return;
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this.userData && this.balance >= 1) {
        this.scene.start('CheckersMatchmakingScene', {
          username: this.username, uid: this.uid, userData: this.userData,
        });
      } else { this.showInsufficientFunds(); }
    });
  }

  // ─── Popups ─────────────────────────────────────────────────────────────────
  private showInsufficientFunds() {
    const overlay = this.add.graphics().setDepth(50);
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, 360, 640);

    const card = this.add.graphics().setDepth(51);
    card.fillStyle(0x3d1a00, 0.98);
    card.fillRoundedRect(40, 220, 280, 188, 16);
    card.lineStyle(2.5, 0xffaa00, 0.9);
    card.strokeRoundedRect(40, 220, 280, 188, 16);

    const parts: Phaser.GameObjects.GameObject[] = [overlay, card];

    // Crown icon
    parts.push(this.add.text(180, 258, '♛', {
      fontSize: '42px', color: C.GOLD, stroke: C.MID_WOOD, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(52));
    parts.push(this.add.text(180, 306, 'Insufficient Funds!', {
      fontSize: '18px', color: C.CREAM, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(52));
    parts.push(this.add.text(180, 332, `Need $1.00  ·  You have $${this.balance.toFixed(2)}`, {
      fontSize: '13px', color: C.GOLD_DIM,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(52));

    const hasWood = this.textures.exists('wood-button');
    const btnImg  = hasWood
      ? this.add.image(0, 0, 'wood-button').setDisplaySize(130, 42).setTint(0xffdd99)
      : (() => { const g = this.add.graphics(); g.fillStyle(0xd4813a); g.fillRoundedRect(-65,-21,130,42,10); return g; })();
    const btnLbl  = this.add.text(0, 0, 'OK', {
      fontSize: '15px', color: C.MID_WOOD, fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);

    const btn = this.add.container(180, 374, [btnImg as any, btnLbl]).setDepth(53);
    btn.setSize(130, 42).setInteractive({ useHandCursor: true });
    parts.push(btn);

    const destroy = () => { try { parts.forEach(p => p.destroy()); } catch (_) {} };
    btn.on('pointerdown', destroy);
    this.time.delayedCall(3500, () => { try { destroy(); } catch (_) {} });
  }

  private showLoading() {
    this.loadingText = this.add.text(180, 320, 'LOADING...', {
      fontSize: '22px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
  }

  private showError(msg: string) {
    this.loadingText?.destroy();
    const ov = this.add.graphics().setDepth(40);
    ov.fillStyle(0x000000, 0.8); ov.fillRect(0, 0, 360, 640);
    this.add.text(180, 210, '❌', { fontSize: '48px' }).setOrigin(0.5).setDepth(41);
    this.add.text(180, 270, msg, {
      fontSize: '16px', color: C.WHITE, stroke: C.MID_WOOD, strokeThickness: 2,
      wordWrap: { width: 300 },
    }).setOrigin(0.5).setDepth(41);
    this.add.text(180, 336, '🔄 TRY AGAIN', {
      fontSize: '17px', color: C.WHITE, backgroundColor: '#7a3a00', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(41)
      .on('pointerdown', () => this.scene.restart({ username: this.username, uid: this.uid }));
  }

  private showErrorAndRedirect(msg: string) {
    this.add.text(180, 300, msg, { fontSize: '18px', color: C.WHITE }).setOrigin(0.5);
    setTimeout(() => this.scene.start('CookieScene'), 2000);
  }

  private addFooter() {
    this.add.text(180, 626, 'Checkers Online  ·  v1.0.0', {
      fontSize: '9px', color: '#555555',
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }
}