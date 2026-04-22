// src/scenes/ball-crush/BallCrushProfileScene.ts
import Phaser from 'phaser';
import { getBallCrushUserData, getBallCrushBalance, BallCrushUserData } from '../../firebase/ballCrushSimple';

export class BallCrushProfileScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private userData: BallCrushUserData | null = null;
  private balance: number = 0;

  // Star field
  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BallCrushProfileScene' });
  }

  preload() {
    if (!this.textures.exists('btn-orange')) this.load.image('btn-orange', 'assets/button.png');
    if (!this.textures.exists('btn-dark'))   this.load.image('btn-dark',   'assets/button2.png');
  }

  init(data: { username: string; uid: string; userData?: BallCrushUserData }) {
    this.username = data.username || '';
    this.uid      = data.uid      || '';
    this.userData = data.userData || null;
  }

  async create() {
    this.addBackground();
    this.showLoading();

    try {
      if (!this.userData) {
        const [ud, bal] = await Promise.all([
          getBallCrushUserData(this.uid),
          getBallCrushBalance(this.uid),
        ]);
        this.userData = ud;
        this.balance  = bal;
      } else {
        this.balance = await getBallCrushBalance(this.uid);
      }
      this.loadingText?.destroy();
      this.buildUI();
    } catch (e) {
      console.error(e);
      this.showError();
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  private buildUI() {
    if (!this.userData) return;
    const u = this.userData;

    // ── Header ──
    this.add.text(180, 38, 'PROFILE', {
      fontSize: '28px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Avatar circle ──
    const avatarBg = this.add.graphics().setDepth(10);
    avatarBg.fillStyle(0x1a3a1a, 1);
    avatarBg.fillCircle(180, 115, 48);
    avatarBg.lineStyle(3, 0xffaa00);
    avatarBg.strokeCircle(180, 115, 48);

    this.add.text(180, 115, '⚽', { fontSize: '48px' }).setOrigin(0.5).setDepth(11);

    // ── Display name + rank ──
    this.add.text(180, 175, u.displayName, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    const rankColor: Record<string, string> = {
      Diamond: '#00eeff', Platinum: '#e0e0e0',
      Gold: '#ffd700',    Silver: '#c0c0c0',
      Bronze: '#cd7f32',  Rookie: '#aaaaaa',
    };
    this.add.text(180, 200, `${u.rank} · Level ${u.level}`, {
      fontSize: '14px', color: rankColor[u.rank] ?? '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    // ── Balance pill ──
    this.makePill(180, 225, `💰 Balance: $${this.balance.toFixed(2)}`, '#00ff88');

    // ── Stats grid ──
    this.sectionHeader(180, 258, 'GAME STATS');

    const winRate = u.totalGames > 0
      ? Math.round((u.totalWins / u.totalGames) * 100) : 0;

    const stats = [
      ['🎮 Games Played', `${u.totalGames}`],
      ['✅ Wins',         `${u.totalWins}`],
      ['❌ Losses',       `${u.totalLosses}`],
      ['📈 Win Rate',     `${winRate}%`],
      ['🔥 Win Streak',  `${u.winStreak}`],
      ['🏆 Best Streak', `${u.bestWinStreak}`],
    ];

    stats.forEach(([label, value], i) => {
      const row = i % 2;
      const col = Math.floor(i / 2);
      const x   = col === 0 ? 20 : col === 1 ? 130 : 245;
      // actually lay out as 2 columns
      const cx  = i % 2 === 0 ? 90 : 270;
      const cy  = 285 + Math.floor(i / 2) * 54;
      this.statCard(cx, cy, label, value);
    });

    // ── Score stats ──
    this.sectionHeader(180, 447, 'SCORE STATS');

    const scoreStats = [
      ['⭐ High Score',   `${u.highScore}`],
      ['📊 Total Score',  `${u.totalScore}`],
      ['📉 Avg Score',    `${u.averageScore}`],
      ['✨ Experience',   `${u.experience} XP`],
    ];
    scoreStats.forEach(([label, value], i) => {
      const cx = i % 2 === 0 ? 90 : 270;
      const cy = 474 + Math.floor(i / 2) * 54;
      this.statCard(cx, cy, label, value);
    });

    // ── Back button ──
    this.makeButton(180, 608, '← BACK', false, () => {
      this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private statCard(cx: number, cy: number, label: string, value: string) {
    const w = 150, h = 44;
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x000000, 0.65);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.lineStyle(1, 0xffaa00, 0.6);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);

    this.add.text(cx, cy - 8, label, {
      fontSize: '10px', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(11);

    this.add.text(cx, cy + 10, value, {
      fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(11);
  }

  private sectionHeader(x: number, y: number, text: string) {
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(1, 0xffaa00, 0.4);
    g.beginPath(); g.moveTo(20, y + 8); g.lineTo(340, y + 8); g.strokePath();
    this.add.text(x, y, text, {
      fontSize: '11px', color: '#ffaa00', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);
  }

  private makePill(x: number, y: number, text: string, color: string) {
    const label = this.add.text(x, y, text, {
      fontSize: '13px', color,
      backgroundColor: '#00000088', padding: { x: 12, y: 4 },
    }).setOrigin(0.5).setDepth(11);
  }

  private makeButton(x: number, y: number, text: string, primary: boolean, cb: () => void) {
    const texKey  = primary ? 'btn-orange' : 'btn-dark';
    const textCol = primary ? '#ffffff'    : '#e0e8ff';

    const img   = this.add.image(0, 0, texKey).setDisplaySize(200, 46);
    const label = this.add.text(0, 0, text, {
      fontSize: '14px', color: textCol, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);

    const c = this.add.container(x, y, [img, label]);
    c.setSize(200, 46).setInteractive({ useHandCursor: true }).setDepth(20);

    c.on('pointerover',  () => { label.setColor('#ffff00'); this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    c.on('pointerout',   () => { label.setColor(textCol);  this.tweens.add({ targets: c, scaleX: 1,    scaleY: 1,    duration: 80 }); });
    c.on('pointerdown',  () => { this.tweens.add({ targets: c, scaleX: 0.97, scaleY: 0.97, duration: 60, yoyo: true, onComplete: cb }); });
  }

  // ─── Background (identical pattern to StartScene) ─────────────────────────
  private addBackground() {
    if (this.textures.exists('ball-background')) {
      this.add.image(180, 320, 'ball-background').setDisplaySize(360, 640).setDepth(-10);
    } else {
      this.cameras.main.setBackgroundColor('#05050f');
    }
    this.createStarField();
    this.scheduleShootingStars();
  }

  private createStarField() {
    const layerDefs = [
      { count: 80, radius: 1,   speedMin: 14, speedMax: 22, alphaMin: 0.20, alphaMax: 0.40, color: 0xaabbff },
      { count: 45, radius: 1.4, speedMin: 32, speedMax: 46, alphaMin: 0.45, alphaMax: 0.70, color: 0xddeeff },
      { count: 20, radius: 2,   speedMin: 62, speedMax: 82, alphaMin: 0.75, alphaMax: 1.00, color: 0xffffff },
    ];
    this.starLayers = [];
    layerDefs.forEach((def, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < def.count; i++) {
        const alpha = Phaser.Math.FloatBetween(def.alphaMin, def.alphaMax);
        const obj   = this.add.circle(
          Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
          def.radius, def.color, alpha
        ).setDepth(-5 + li);
        if (li === 2) this.tweens.add({ targets: obj, alpha: alpha * 0.5, duration: Phaser.Math.Between(600, 1400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1200) });
        layer.push({ obj, speed: Phaser.Math.FloatBetween(def.speedMin, def.speedMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private scheduleShootingStars() {
    const next = () => { this.shootingStarTimer = this.time.delayedCall(Phaser.Math.Between(3000, 7000), () => { this.spawnShootingStar(); next(); }); };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(20, 200);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const duration = Phaser.Math.Between(500, 900);
    const ticker = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      prog = Math.min(prog + 16 / duration, 1);
      g.clear();
      g.lineStyle(1, 0xffffff, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
      g.lineStyle(1, 0xddeeff, 0.45); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      g.lineStyle(2, 0xffffff, 0.9);  g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      if (prog >= 1) { ticker.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
    }});
  }

  private showLoading() {
    this.loadingText = this.add.text(180, 320, 'LOADING...', { fontSize: '18px', color: '#ffff00' }).setOrigin(0.5).setDepth(10);
  }

  private showError() {
    this.loadingText?.destroy();
    this.add.text(180, 300, '❌ Failed to load profile', { fontSize: '16px', color: '#ff4444' }).setOrigin(0.5).setDepth(10);
    this.makeButton(180, 360, '← BACK', false, () => this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid }));
  }

  shutdown() { if (this.shootingStarTimer) this.shootingStarTimer.destroy(); }
}