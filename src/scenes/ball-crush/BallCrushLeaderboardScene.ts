// src/scenes/ball-crush/BallCrushLeaderboardScene.ts
import Phaser from 'phaser';
import { getBallCrushLeaderboard, getBallCrushBalance, BallCrushLeaderboardEntry } from '../../firebase/ballCrushSimple';

export class BallCrushLeaderboardScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private entries: BallCrushLeaderboardEntry[] = [];

  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;
  private loadingText!: Phaser.GameObjects.Text;

  // Pagination
  private page: number = 0;
  private readonly PAGE_SIZE = 7;
  private rowContainer!: Phaser.GameObjects.Container;
  private pageText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BallCrushLeaderboardScene' });
  }

  preload() {
    if (!this.textures.exists('btn-orange')) this.load.image('btn-orange', 'assets/button.png');
    if (!this.textures.exists('btn-dark'))   this.load.image('btn-dark',   'assets/button2.png');
  }

  init(data: { username: string; uid: string }) {
    this.username = data.username || '';
    this.uid      = data.uid      || '';
    this.page     = 0;
  }

  async create() {
    this.addBackground();
    this.showLoading();

    try {
      this.entries = await getBallCrushLeaderboard(50);
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
    // ── Title ──
    this.add.text(180, 38, '🏆 LEADERBOARD', {
      fontSize: '26px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Column headers ──
    const headerY = 72;
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x000000, 0.7);
    g.fillRoundedRect(10, headerY - 12, 340, 26, 6);
    g.lineStyle(1, 0xffaa00, 0.5);
    g.strokeRoundedRect(10, headerY - 12, 340, 26, 6);

    [['#',   36],  ['Player', 110], ['Score', 215], ['Wins', 285], ['Rate', 340]].forEach(([h, x]) => {
      this.add.text(x as number, headerY, h as string, {
        fontSize: '11px', color: '#ffaa00', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);
    });

    // ── Row container (rebuilt on page change) ──
    this.rowContainer = this.add.container(0, 0).setDepth(10);
    this.renderPage();

    // ── Pagination ──
    const totalPages = Math.ceil(this.entries.length / this.PAGE_SIZE);

    this.pageText = this.add.text(180, 578, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(10);
    this.updatePageText();

    // Prev
    this.makeButton(90, 608, '◀ PREV', false, () => {
      if (this.page > 0) { this.page--; this.renderPage(); this.updatePageText(); }
    });

    // Next
    this.makeButton(270, 608, 'NEXT ▶', false, () => {
      if (this.page < totalPages - 1) { this.page++; this.renderPage(); this.updatePageText(); }
    });

    // Back
    this.makeButton(180, 560, '← BACK', false, () => {
      this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
    });
  }

  private renderPage() {
    this.rowContainer.removeAll(true);

    const start  = this.page * this.PAGE_SIZE;
    const slice  = this.entries.slice(start, start + this.PAGE_SIZE);
    const rankColors: Record<number, string> = { 1: '#ffd700', 2: '#c0c0c0', 3: '#cd7f32' };

    slice.forEach((entry, i) => {
      const globalRank = start + i + 1;
      const rowY       = 102 + i * 64;
      const isMe       = entry.username === this.username;

      const bg = this.add.graphics();
      bg.fillStyle(isMe ? 0x1a3a2a : 0x000000, isMe ? 0.85 : 0.55);
      bg.fillRoundedRect(10, rowY, 340, 56, 8);
      if (isMe) { bg.lineStyle(1.5, 0x00ff88); bg.strokeRoundedRect(10, rowY, 340, 56, 8); }

      // Rank number
      const rankCol = rankColors[globalRank] ?? (isMe ? '#00ff88' : '#aaaaaa');
      const rankTxt = globalRank <= 3 ? ['🥇','🥈','🥉'][globalRank - 1] : `${globalRank}`;
      this.add.text(36, rowY + 28, rankTxt, { fontSize: '14px', color: rankCol }).setOrigin(0.5);

      // Display name
      this.add.text(70, rowY + 16, entry.displayName, {
        fontSize: '13px', color: isMe ? '#00ff88' : '#ffffff', fontStyle: 'bold',
      });
      this.add.text(70, rowY + 34, entry.rank + ` · Lv${entry.level}`, {
        fontSize: '10px', color: '#888888',
      });

      // High score
      this.add.text(215, rowY + 28, `${entry.highScore}`, {
        fontSize: '14px', color: '#ffff00', fontStyle: 'bold',
      }).setOrigin(0.5);

      // Wins
      this.add.text(285, rowY + 28, `${entry.totalWins}`, {
        fontSize: '14px', color: '#ffffff',
      }).setOrigin(0.5);

      // Win rate
      this.add.text(340, rowY + 28, `${entry.winRate}%`, {
        fontSize: '13px', color: entry.winRate >= 60 ? '#00ff88' : entry.winRate >= 40 ? '#ffaa00' : '#ff6666',
      }).setOrigin(0.5);

      this.rowContainer.add([bg,
        ...this.rowContainer.scene.children.list.slice(-6) // won't work — add directly
      ]);
    });
  }

  private updatePageText() {
    const total = Math.ceil(this.entries.length / this.PAGE_SIZE);
    this.pageText.setText(`Page ${this.page + 1} of ${total}  (${this.entries.length} players)`);
  }

  // ─── Shared helpers (same as Profile) ────────────────────────────────────
  private makeButton(x: number, y: number, text: string, primary: boolean, cb: () => void) {
    const texKey  = primary ? 'btn-orange' : 'btn-dark';
    const textCol = primary ? '#ffffff'    : '#e0e8ff';
    const img     = this.add.image(0, 0, texKey).setDisplaySize(155, 44);
    const label   = this.add.text(0, 0, text, {
      fontSize: '13px', color: textCol, fontStyle: 'bold', stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);
    const c = this.add.container(x, y, [img, label]);
    c.setSize(155, 44).setInteractive({ useHandCursor: true }).setDepth(20);
    c.on('pointerover',  () => { label.setColor('#ffff00'); this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    c.on('pointerout',   () => { label.setColor(textCol);  this.tweens.add({ targets: c, scaleX: 1,    scaleY: 1,    duration: 80 }); });
    c.on('pointerdown',  () => { this.tweens.add({ targets: c, scaleX: 0.97, scaleY: 0.97, duration: 60, yoyo: true, onComplete: cb }); });
  }

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
    const defs = [
      { count: 80, radius: 1,   speedMin: 14, speedMax: 22, alphaMin: 0.20, alphaMax: 0.40, color: 0xaabbff },
      { count: 45, radius: 1.4, speedMin: 32, speedMax: 46, alphaMin: 0.45, alphaMax: 0.70, color: 0xddeeff },
      { count: 20, radius: 2,   speedMin: 62, speedMax: 82, alphaMin: 0.75, alphaMax: 1.00, color: 0xffffff },
    ];
    this.starLayers = [];
    defs.forEach((def, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < def.count; i++) {
        const alpha = Phaser.Math.FloatBetween(def.alphaMin, def.alphaMax);
        const obj   = this.add.circle(Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640), def.radius, def.color, alpha).setDepth(-5 + li);
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
    const dur = Phaser.Math.Between(500, 900);
    const t = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      prog = Math.min(prog + 16 / dur, 1);
      g.clear();
      g.lineStyle(1, 0xffffff, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
      g.lineStyle(1, 0xddeeff, 0.45); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      g.lineStyle(2, 0xffffff, 0.9);  g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      if (prog >= 1) { t.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
    }});
  }

  private showLoading() { this.loadingText = this.add.text(180, 320, 'LOADING...', { fontSize: '18px', color: '#ffff00' }).setOrigin(0.5).setDepth(10); }
  private showError()   { this.loadingText?.destroy(); this.add.text(180, 300, '❌ Failed to load', { fontSize: '16px', color: '#ff4444' }).setOrigin(0.5).setDepth(10); this.makeButton(180, 360, '← BACK', false, () => this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid })); }
  shutdown() { if (this.shootingStarTimer) this.shootingStarTimer.destroy(); }
}