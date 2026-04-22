// src/scenes/ball-crush/BallCrushLoaderScene.ts
import Phaser from 'phaser';
import { multiGameQueries } from '../../firebase/multiGameQueries';

export class BallCrushLoaderScene extends Phaser.Scene {
  // ── User data ────────────────────────────────────────────────────────
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = 'default';

  // ── Loading state ────────────────────────────────────────────────────
  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 2500;
  private assetsLoaded: boolean = false;
  private loadProgress: number = 0;

  // ── Star field ───────────────────────────────────────────────────────
  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  // ── UI refs ──────────────────────────────────────────────────────────
  private progressBarFill!: Phaser.GameObjects.Graphics;
  private progressBarGlow!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;

  // Spinning orb parts
  private orbitAngle: number = 0;
  private orbitBalls: Phaser.GameObjects.Arc[] = [];
  private orbGlow!: Phaser.GameObjects.Arc;
  private radarGfx!: Phaser.GameObjects.Graphics;
  private radarRadius: number = 0;
  private radarGrowing: boolean = true;

  // Ball preview (shown once texture loaded)
  private ballPreview: Phaser.GameObjects.Image | null = null;
  private previewAdded: boolean = false;

  constructor() {
    super({ key: 'BallCrushLoaderScene' });
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  async init(data: { username: string; uid?: string }) {
    console.log('⚽ BallCrushLoaderScene init:', data);
    this.loadStartTime  = Date.now();
    this.assetsLoaded   = false;
    this.loadProgress   = 0;
    this.previewAdded   = false;
    this.ballPreview    = null;
    this.orbitAngle     = 0;
    this.orbitBalls     = [];
    this.starLayers     = [];

    if (!data?.username) {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }

    this.username = data.username;
    this.uid      = data.uid || `temp_${Date.now()}`;

    try {
      const userData = await multiGameQueries.getUserByUid(this.uid);
      if (userData) {
        this.displayName = userData.public?.displayName || this.username;
        this.avatar      = userData.public?.avatar      || 'default';
      }
    } catch (err) {
      console.warn('Could not fetch user data:', err);
      this.displayName = this.username;
    }
  }

  // ─── preload ──────────────────────────────────────────────────────────────
  preload() {
    this.createLoadingUI();

    this.load.on('progress', (v: number) => this.onProgress(v));
    this.load.on('complete',  ()          => this.onComplete());

    // Game assets
    this.load.image('ball-background', '/assets/ball-crush/background.jpg');
    this.load.image('ball',             'assets/ball-crush/ball.png');
    this.load.image('player',           'assets/ball-crush/player.png');
    this.load.image('btn-orange',       'assets/button.png');
    this.load.image('btn-dark',         'assets/button2.png');

    this.load.on('loaderror', (file: any) => {
      console.warn(`⚠️ Asset missing: ${file.key}`);
    });
  }

  // ─── create ───────────────────────────────────────────────────────────────
  create() {
    // Nothing extra — star field and orb were created in preload UI
  }

  // ─── update ───────────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    const dt = delta / 1000;

    // ── Scroll stars ──
    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    // ── Orbit balls ──
    this.orbitAngle += dt * 75;
    const cx = 180, cy = 285;
    const r1 = 52, r2 = 72;
    this.orbitBalls.forEach((ball, i) => {
      const total  = this.orbitBalls.length;
      const offset = (360 / total) * i;
      const radius = i % 2 === 0 ? r1 : r2;
      const dir    = i % 2 === 0 ? 1 : -1;
      const rad    = Phaser.Math.DegToRad(this.orbitAngle * dir + offset);
      ball.x = cx + Math.cos(rad) * radius;
      ball.y = cy + Math.sin(rad) * radius;
    });

    // ── Radar pulse ──
    if (this.radarGfx) {
      this.radarGrowing
        ? (this.radarRadius += delta * 0.055)
        : (this.radarRadius -= delta * 0.055);
      if (this.radarRadius > 95)  this.radarGrowing = false;
      if (this.radarRadius < 2)   this.radarGrowing = true;
      const a = 1 - this.radarRadius / 95;
      this.radarGfx.clear();
      this.radarGfx.lineStyle(1.5, 0xffaa00, a * 0.55);
      this.radarGfx.strokeCircle(cx, cy, this.radarRadius);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING UI  (called from preload — Phaser allows add.* in preload)
  // ─────────────────────────────────────────────────────────────────────────
  private createLoadingUI() {
    this.cameras.main.setBackgroundColor('#05050f');

    // ── Star field ──
    this.createStarField();
    this.scheduleShootingStars();

    // ── Title ──
    this.add.text(180, 36, 'BALL CRUSH', {
      fontSize: '30px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'LOADING', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 5,
    }).setOrigin(0.5).setDepth(10);

    // ── Divider ──
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.2);
    div.beginPath(); div.moveTo(20, 80); div.lineTo(340, 80); div.strokePath();

    // ── Player card ──
    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x0d2b0d, 0.9);
    card.fillRoundedRect(60, 92, 240, 56, 12);
    card.lineStyle(1.5, 0xffaa00, 0.6);
    card.strokeRoundedRect(60, 92, 240, 56, 12);

    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0xffaa00, 0.10);
    strip.fillRoundedRect(60, 92, 240, 18, { tl: 12, tr: 12, bl: 0, br: 0 });

    this.add.text(100, 108, '⚽', { fontSize: '28px' }).setOrigin(0.5).setDepth(12);
    this.add.text(122, 102, this.displayName || this.username, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setDepth(12);
    this.add.text(122, 120, `@${this.username}`, {
      fontSize: '10px', color: '#ffaa00',
    }).setDepth(12);

    // ── Central orb ──
    this.buildOrb();

    // ── Radar ──
    this.radarGfx = this.add.graphics().setDepth(9);

    // ── Progress bar ──
    const barY  = 430;
    const barBg = this.add.graphics().setDepth(10);
    barBg.fillStyle(0x111111, 1);
    barBg.fillRoundedRect(30, barY, 300, 18, 9);
    barBg.lineStyle(1, 0xffaa00, 0.25);
    barBg.strokeRoundedRect(30, barY, 300, 18, 9);

    // Glow layer (drawn behind fill)
    this.progressBarGlow = this.add.graphics().setDepth(10);
    this.progressBarFill = this.add.graphics().setDepth(11);

    // ── Percent text ──
    this.percentText = this.add.text(180, barY + 9, '0%', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    // ── Loading label ──
    this.loadingText = this.add.text(180, barY + 28, 'Loading assets...', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(10);

    // ── Status ──
    this.statusText = this.add.text(180, barY + 46, 'Preparing game...', {
      fontSize: '11px', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(10);

    // ── Tip card ──
    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0x000000, 0.5);
    tipBg.fillRoundedRect(30, 498, 300, 36, 9);
    tipBg.lineStyle(1, 0xffaa00, 0.15);
    tipBg.strokeRoundedRect(30, 498, 300, 36, 9);

    const tips = [
      '💡 Entry fee is $1.00 per match',
      '💡 Winner takes $1.50',
      '💡 Fee is refunded if no match found',
      '💡 Opponent leaving refunds your fee',
    ];
    this.add.text(180, 516, tips[Phaser.Math.Between(0, tips.length - 1)], {
      fontSize: '10px', color: '#888888',
    }).setOrigin(0.5).setDepth(11);

    // ── Mini stats strip ──
    const statsY = 548;
    [
      ['🎮', 'MATCH', '1v1'],
      ['💰', 'ENTRY', '$1.00'],
      ['🏆', 'PRIZE', '$1.50'],
    ].forEach(([icon, label, value], i) => {
      const sx = 65 + i * 115;
      const statBg = this.add.graphics().setDepth(10);
      statBg.fillStyle(0x000000, 0.55);
      statBg.fillRoundedRect(sx - 44, statsY - 14, 88, 44, 8);
      statBg.lineStyle(1, 0xffaa00, 0.2);
      statBg.strokeRoundedRect(sx - 44, statsY - 14, 88, 44, 8);

      this.add.text(sx, statsY - 2, `${icon} ${value}`, {
        fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);
      this.add.text(sx, statsY + 14, label, {
        fontSize: '9px', color: '#666666', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(11);
    });

    // ── Footer ──
    this.add.text(180, 622, 'Ball Crush v1.0.0  ·  wintapgames.com', {
      fontSize: '9px', color: '#333333',
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Central orb ──────────────────────────────────────────────────────────
  private buildOrb() {
    const cx = 180, cy = 285;

    // Glow rings
    [95, 74, 55].forEach((r, i) => {
      this.add.circle(cx, cy, r, 0xffaa00, 0.025 + i * 0.015).setDepth(8);
    });

    // Main orb layers
    this.orbGlow = this.add.circle(cx, cy, 40, 0xffaa00, 0.95).setDepth(10);
    this.add.circle(cx, cy, 26, 0xffd060, 0.75).setDepth(11);
    this.add.circle(cx, cy, 12, 0xffffff, 0.45).setDepth(12);

    // Orb breathe
    this.tweens.add({
      targets: this.orbGlow, scaleX: 1.1, scaleY: 1.1,
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ⚽ emoji in center
    const icon = this.add.text(cx, cy, '⚽', {
      fontSize: '26px',
    }).setOrigin(0.5).setDepth(13);

    this.tweens.add({
      targets: icon, angle: 360, duration: 3000, repeat: -1, ease: 'Linear',
    });

    // Orbit balls
    const colors = [0xffaa00, 0xff6600, 0xffcc44, 0xff8800, 0xffd080, 0xff9933];
    colors.forEach((col, i) => {
      const b = this.add.circle(cx, cy, i % 2 === 0 ? 4 : 3, col, 0.9).setDepth(10);
      this.orbitBalls.push(b);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROGRESS EVENTS
  // ─────────────────────────────────────────────────────────────────────────
  private onProgress(value: number) {
    this.loadProgress = value;
    const pct = Math.round(value * 100);

    // Progress bar fill
    const barY = 430, barW = 300;
    const fill = Math.max(barW * value, value > 0 ? 18 : 0);

    this.progressBarGlow.clear();
    this.progressBarGlow.fillStyle(0xffaa00, 0.15);
    this.progressBarGlow.fillRoundedRect(30, barY - 2, fill, 22, 9);

    this.progressBarFill.clear();
    this.progressBarFill.fillStyle(0xffaa00, 1);
    this.progressBarFill.fillRoundedRect(30, barY, fill, 18, 9);

    this.percentText?.setText(`${pct}%`);

    // Status messages at milestones
    const msgs: Record<number, string> = {
      10:  'Loading background...',
      30:  'Loading ball assets...',
      50:  'Loading player sprites...',
      70:  'Loading UI assets...',
      90:  'Almost ready...',
      100: 'Ready to play!',
    };
    const milestone = [10, 30, 50, 70, 90, 100].find(m => pct >= m);
    if (milestone && msgs[milestone]) {
      this.loadingText?.setText(msgs[milestone]);
    }

    // Show ball preview once texture is ready
    if (pct > 20 && !this.previewAdded && this.textures.exists('ball')) {
      this.previewAdded = true;
      this.addBallPreview();
    }
  }

  private addBallPreview() {
    // Replace the ⚽ emoji with the actual ball texture if it's different
    if (this.textures.exists('ball')) {
      this.ballPreview = this.add.image(180, 285, 'ball')
        .setScale(0.18)
        .setDepth(14);

      this.tweens.add({
        targets: this.ballPreview, angle: 360, duration: 2000, repeat: -1, ease: 'Linear',
      });
    }
  }

  private onComplete() {
    console.log('✅ All assets loaded');
    this.assetsLoaded = true;

    this.loadingText?.setText('Ready!');
    this.loadingText?.setColor('#00ff88');
    this.statusText?.setText('Starting game...');
    this.percentText?.setText('100%');

    // Fill bar fully green
    this.progressBarFill.clear();
    this.progressBarFill.fillStyle(0x00ff88, 1);
    this.progressBarFill.fillRoundedRect(30, 430, 300, 18, 9);

    // Wait for minimum display time then go
    const elapsed   = Date.now() - this.loadStartTime;
    const remaining = Math.max(0, this.MIN_LOAD_TIME - elapsed);

    this.time.delayedCall(remaining, () => this.goToStart());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSITION
  // ─────────────────────────────────────────────────────────────────────────
  private goToStart() {
    console.log('🚀 → BallCrushStartScene');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', {
        username:    this.username,
        uid:         this.uid,
        displayName: this.displayName,
        avatar:      this.avatar,
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BACKGROUND
  // ─────────────────────────────────────────────────────────────────────────
  private createStarField() {
    const defs = [
      { count: 80, radius: 1,   speedMin: 14, speedMax: 22, alphaMin: 0.18, alphaMax: 0.38, color: 0xaabbff },
      { count: 45, radius: 1.4, speedMin: 30, speedMax: 46, alphaMin: 0.42, alphaMax: 0.68, color: 0xddeeff },
      { count: 20, radius: 2,   speedMin: 60, speedMax: 80, alphaMin: 0.72, alphaMax: 1.00, color: 0xffffff },
    ];
    this.starLayers = [];
    defs.forEach((def, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < def.count; i++) {
        const alpha = Phaser.Math.FloatBetween(def.alphaMin, def.alphaMax);
        const obj   = this.add.circle(
          Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
          def.radius, def.color, alpha
        ).setDepth(-5 + li);
        if (li === 2) {
          this.tweens.add({
            targets: obj, alpha: alpha * 0.4,
            duration: Phaser.Math.Between(600, 1400),
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            delay: Phaser.Math.Between(0, 1200),
          });
        }
        layer.push({ obj, speed: Phaser.Math.FloatBetween(def.speedMin, def.speedMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private scheduleShootingStars() {
    const next = () => {
      this.shootingStarTimer = this.time.delayedCall(
        Phaser.Math.Between(2500, 7000), () => { this.spawnShootingStar(); next(); }
      );
    };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(10, 180);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(450, 850);
    const t = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        prog = Math.min(prog + 16 / dur, 1);
        g.clear();
        g.lineStyle(1, 0xffffff, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
        g.lineStyle(1, 0xddeeff, 0.45); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        g.lineStyle(2, 0xffffff, 0.9);  g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        if (prog >= 1) { t.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
      },
    });
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  shutdown() {
    this.load.off('progress');
    this.load.off('complete');
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
  }
}