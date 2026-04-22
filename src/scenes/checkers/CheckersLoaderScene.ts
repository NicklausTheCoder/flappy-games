// src/scenes/checkers/CheckersLoaderScene.ts
import Phaser from 'phaser';
import { checkersService } from '../../firebase/checkersService';

export class CheckersLoaderScene extends Phaser.Scene {
  private username:    string = '';
  private uid:         string = '';
  private displayName: string = '';
  private avatar:      string = 'default';

  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 2500;

  // UI
  private progressFill!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private loadingText!:  Phaser.GameObjects.Text;
  private percentText!:  Phaser.GameObjects.Text;
  private statusText!:   Phaser.GameObjects.Text;

  // Board animation
  private boardTiles: Phaser.GameObjects.Rectangle[] = [];
  private boardRevealIndex: number = 0;
  private boardRevealTimer?: Phaser.Time.TimerEvent;

  // Orbiting pieces
  private orbitAngle:  number = 0;
  private orbitPieces: Phaser.GameObjects.Arc[] = [];
  private orbGlow!:    Phaser.GameObjects.Arc;
  private radarGfx!:   Phaser.GameObjects.Graphics;
  private radarRadius: number = 0;
  private radarGrowing: boolean = true;

  constructor() {
    super({ key: 'CheckersLoaderScene' });
  }

  async init(data: { username: string; uid?: string }) {
    this.loadStartTime  = Date.now();
    this.orbitAngle     = 0;
    this.orbitPieces    = [];
    this.boardTiles     = [];
    this.boardRevealIndex = 0;

    if (!data?.username) { this.scene.start('CookieScene'); return; }

    this.username = data.username;
    this.uid      = data.uid || `temp_${Date.now()}`;

    try {
      const userData = await checkersService.getUserData(this.uid);
      if (userData) {
        this.displayName = userData.displayName || this.username;
        this.avatar      = userData.avatar || 'default';
      } else {
        this.displayName = this.username;
      }
    } catch { this.displayName = this.username; }
  }

  preload() {
    this.createLoadingUI();

    this.load.on('progress', (v: number) => this.onProgress(v));
    this.load.on('complete',  ()          => this.onComplete());

    // Game assets
    this.load.image('red_normal',   'assets/checkers/red_normal.png');
    this.load.image('red_king',     'assets/checkers/red_king.png');
    this.load.image('black_normal', 'assets/checkers/black_normal.png');
    this.load.image('black_king',   'assets/checkers/black_king.png');
    this.load.image('checkers-bg',  'assets/checkers/bg.jpg');
    this.load.image('checkers-bg2', 'assets/checkers/bg2.jpg');
    this.load.image('wood-button',  'assets/checkers/button.png');

    this.load.on('loaderror', (f: any) => console.warn('⚠️ Missing asset:', f.key));
  }

  create() { /* onComplete fires during preload */ }

  update(_t: number, delta: number) {
    const dt = delta / 1000;

    // Orbit pieces around central orb
    this.orbitAngle += dt * 65;
    const cx = 180, cy = 270;
    this.orbitPieces.forEach((p, i) => {
      const total  = this.orbitPieces.length;
      const offset = (360 / total) * i;
      const r      = i % 2 === 0 ? 54 : 74;
      const dir    = i % 2 === 0 ? 1 : -1;
      const rad    = Phaser.Math.DegToRad(this.orbitAngle * dir + offset);
      p.x = cx + Math.cos(rad) * r;
      p.y = cy + Math.sin(rad) * r;
    });

    // Radar pulse
    if (this.radarGfx) {
      this.radarGrowing ? (this.radarRadius += delta * 0.055) : (this.radarRadius -= delta * 0.055);
      if (this.radarRadius > 92)  this.radarGrowing = false;
      if (this.radarRadius < 2)   this.radarGrowing = true;
      this.radarGfx.clear();
      this.radarGfx.lineStyle(1.5, 0xffaa00, (1 - this.radarRadius / 92) * 0.45);
      this.radarGfx.strokeCircle(cx, cy, this.radarRadius);
    }
  }

  // ─── UI ─────────────────────────────────────────────────────────────────────
  private createLoadingUI() {
    // Rich dark wood background
    this.cameras.main.setBackgroundColor('#1a0d00');

    // Checkerboard tile strip across the top — decorative
    this.addCheckerStrip(0,   8, 0.18);   // top strip
    this.addCheckerStrip(628, 8, 0.18);   // bottom strip

    // ── Title ──
    const titleBg = this.add.graphics().setDepth(10);
    titleBg.fillStyle(0x3d1a00, 0.92);
    titleBg.fillRoundedRect(24, 22, 312, 64, 14);
    titleBg.lineStyle(2, 0xffaa00, 0.8);
    titleBg.strokeRoundedRect(24, 22, 312, 64, 14);

    // Inner gold line
    const inner = this.add.graphics().setDepth(11);
    inner.lineStyle(1, 0xffaa00, 0.3);
    inner.strokeRoundedRect(30, 27, 300, 54, 10);

    this.add.text(180, 40, 'CHECKERS', {
      fontSize: '30px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(12);

    this.add.text(180, 70, 'ONLINE', {
      fontSize: '12px', color: '#ffaa00', letterSpacing: 8,
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);

    // ── Player card ──
    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x2a1200, 0.95);
    card.fillRoundedRect(55, 94, 250, 58, 12);
    card.lineStyle(1.5, 0xffaa00, 0.65);
    card.strokeRoundedRect(55, 94, 250, 58, 12);
    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0xffaa00, 0.12);
    strip.fillRoundedRect(55, 94, 250, 20, { tl:12, tr:12, bl:0, br:0 });

    // Mini red & black piece icons
    this.add.circle(92, 113, 9, 0xcc2200, 1).setDepth(12);
    this.add.circle(92, 113, 6, 0xdd3300, 1).setDepth(13);
    this.add.circle(108, 113, 9, 0x222222, 1).setDepth(12);
    this.add.circle(108, 113, 6, 0x444444, 1).setDepth(13);

    this.add.text(122, 104, this.displayName || this.username, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setDepth(12);
    this.add.text(122, 122, `@${this.username}`, {
      fontSize: '10px', color: '#ffaa00',
    }).setDepth(12);

    // ── Central orb — checker piece style ──
    this.buildCentralOrb();
    this.radarGfx = this.add.graphics().setDepth(9);

    // ── Progress bar ──
    const barY  = 424;
    const barBg = this.add.graphics().setDepth(10);
    barBg.fillStyle(0x1a0d00, 1);
    barBg.fillRoundedRect(28, barY, 304, 20, 10);
    barBg.lineStyle(1.5, 0xffaa00, 0.3);
    barBg.strokeRoundedRect(28, barY, 304, 20, 10);

    this.progressGlow = this.add.graphics().setDepth(10);
    this.progressFill = this.add.graphics().setDepth(11);

    this.percentText = this.add.text(180, barY + 10, '0%', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    this.loadingText = this.add.text(180, barY + 30, 'Loading assets...', {
      fontSize: '12px', color: '#ccaa88',
    }).setOrigin(0.5).setDepth(10);

    this.statusText = this.add.text(180, barY + 48, 'Preparing board...', {
      fontSize: '11px', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(10);

    // ── Tip ──
    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0x000000, 0.4);
    tipBg.fillRoundedRect(28, 488, 304, 30, 8);
    tipBg.lineStyle(1, 0xffaa00, 0.15);
    tipBg.strokeRoundedRect(28, 488, 304, 30, 8);

    const tips = [
      '♟ You must capture when possible',
      '♟ Kings can move in any direction',
      '♟ Entry fee is $1 — winner takes $1.50',
      '♟ Opponent leaving refunds your fee',
    ];
    this.add.text(180, 503, tips[Phaser.Math.Between(0, tips.length - 1)], {
      fontSize: '10px', color: '#888888',
    }).setOrigin(0.5).setDepth(11);

    // ── Stats strip ──
    const statsY = 534;
    [
      ['♟', 'MATCH',  '1v1'],
      ['💰', 'ENTRY', '$1.00'],
      ['🏆', 'PRIZE', '$1.50'],
    ].forEach(([icon, label, value], i) => {
      const sx = 65 + i * 115;
      const sb = this.add.graphics().setDepth(10);
      sb.fillStyle(0x000000, 0.5);
      sb.fillRoundedRect(sx - 44, statsY - 14, 88, 44, 8);
      sb.lineStyle(1, 0xffaa00, 0.2);
      sb.strokeRoundedRect(sx - 44, statsY - 14, 88, 44, 8);
      this.add.text(sx, statsY + 1, `${icon} ${value}`, {
        fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);
      this.add.text(sx, statsY + 17, label, {
        fontSize: '9px', color: '#666666', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(11);
    });

    // Footer
    this.add.text(180, 614, 'Checkers Online  ·  wintapgames.com', {
      fontSize: '9px', color: '#333333',
    }).setOrigin(0.5).setDepth(10);

    // Bottom checker strip
    this.addCheckerStrip(620, 8, 0.18);
  }

  // ── Decorative checker tile strip ──────────────────────────────────────────
  private addCheckerStrip(y: number, size: number, alpha: number) {
    const cols = Math.ceil(360 / size);
    for (let c = 0; c < cols; c++) {
      const isDark = c % 2 === 0;
      this.add.rectangle(c * size + size / 2, y + size / 2, size, size,
        isDark ? 0x8b4513 : 0xdeb887, alpha
      ).setDepth(1);
    }
  }

  // ── Central orb — styled as a checker piece ─────────────────────────────────
  private buildCentralOrb() {
    const cx = 180, cy = 270;

    // Glow rings
    [92, 74, 56].forEach((r, i) => {
      this.add.circle(cx, cy, r, 0xffaa00, 0.022 + i * 0.014).setDepth(8);
    });

    // Outer piece rim — dark brown
    this.add.circle(cx, cy, 44, 0x3d1a00, 1).setDepth(9);
    // Main piece body — alternating red/black nod
    const orb = this.add.circle(cx, cy, 40, 0xcc2200, 1).setDepth(10);
    // Inner ring detail
    this.add.circle(cx, cy, 30, 0xdd3300, 1).setDepth(11);
    this.add.circle(cx, cy, 18, 0xff4422, 1).setDepth(12);
    // Shine
    this.add.circle(cx - 8, cy - 8, 7, 0xffffff, 0.3).setDepth(13);

    this.orbGlow = orb;
    this.tweens.add({
      targets: orb, scaleX: 1.08, scaleY: 1.08,
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Crown symbol on the orb
    const crown = this.add.text(cx, cy, '♛', {
      fontSize: '24px', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(14);
    this.tweens.add({
      targets: crown, angle: 8, duration: 1200,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Orbiting checker pieces — alternating red and black
    const colors = [0xcc2200, 0x222222, 0xdd3300, 0x333333, 0xff4422, 0x444444];
    colors.forEach((col, i) => {
      const r = i % 2 === 0 ? 5 : 4;
      const p = this.add.circle(cx, cy, r, col, 1).setDepth(10);
      // Rim detail
      this.add.circle(cx, cy, r - 1.5, col === 0xcc2200 || col === 0xdd3300 || col === 0xff4422
        ? 0xff5533 : 0x555555, 0.8
      ).setDepth(10);
      this.orbitPieces.push(p);
    });
  }

  // ─── Progress ───────────────────────────────────────────────────────────────
  private onProgress(v: number) {
    const pct  = Math.round(v * 100);
    const barY = 424, barW = 304;
    const fill = Math.max(barW * v, v > 0 ? 20 : 0);

    this.progressGlow.clear();
    this.progressGlow.fillStyle(0xffaa00, 0.16);
    this.progressGlow.fillRoundedRect(28, barY - 2, fill, 24, 10);

    this.progressFill.clear();
    this.progressFill.fillStyle(0xffaa00, 1);
    this.progressFill.fillRoundedRect(28, barY, fill, 20, 10);

    this.percentText?.setText(`${pct}%`);

    const msgs: Record<number,string> = {
      10:  'Loading board...',
      30:  'Loading pieces...',
      55:  'Loading UI...',
      75:  'Setting up rules...',
      90:  'Almost ready...',
      100: 'Ready to play!',
    };
    const m = [10,30,55,75,90,100].find(n => pct >= n);
    if (m && msgs[m]) this.loadingText?.setText(msgs[m]);
  }

  private onComplete() {
    this.progressFill.clear();
    this.progressFill.fillStyle(0x44cc44, 1);
    this.progressFill.fillRoundedRect(28, 424, 304, 20, 10);
    this.loadingText?.setText('Ready!').setColor('#44ff44');
    this.percentText?.setText('100%');

    const elapsed   = Date.now() - this.loadStartTime;
    const remaining = Math.max(0, this.MIN_LOAD_TIME - elapsed);

    this.time.delayedCall(remaining, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('CheckersStartScene', {
          username:    this.username,
          uid:         this.uid,
          displayName: this.displayName,
          avatar:      this.avatar,
        });
      });
    });
  }

  shutdown() {
    this.load.off('progress');
    this.load.off('complete');
    this.boardRevealTimer?.destroy();
  }
}