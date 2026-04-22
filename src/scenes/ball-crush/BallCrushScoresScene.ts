// src/scenes/ball-crush/BallCrushStatsScene.ts
import Phaser from 'phaser';
import {
  getBallCrushUserData,
  getBallCrushUserScores,
  getBallCrushBalance,
  BallCrushUserData,
  BallCrushScoreEntry,
} from '../../firebase/ballCrushSimple';

export class BallCrushStatsScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private userData: BallCrushUserData | null = null;
  private scores: BallCrushScoreEntry[] = [];
  private balance: number = 0;

  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;
  private loadingText!: Phaser.GameObjects.Text;

  // Score history tab
  private activeTab: 'overview' | 'history' = 'overview';
  private tabContainers: Record<string, Phaser.GameObjects.Container> = {};

  constructor() {
    super({ key: 'BallCrushStatsScene' });
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
      const [ud, scores, bal] = await Promise.all([
        this.userData ? Promise.resolve(this.userData) : getBallCrushUserData(this.uid),
        getBallCrushUserScores(this.username, 20),
        getBallCrushBalance(this.uid),
      ]);
      this.userData = ud;
      this.scores   = scores;
      this.balance  = bal;
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

    this.add.text(180, 38, '📊 MY STATS', {
      fontSize: '26px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Tabs ──
    this.makeTab(90, 68, 'OVERVIEW', 'overview');
    this.makeTab(270, 68, 'HISTORY', 'history');

    // ── Tab content containers ──
    const overviewC = this.add.container(0, 0).setDepth(10);
    const historyC  = this.add.container(0, 0).setDepth(10);
    this.tabContainers['overview'] = overviewC;
    this.tabContainers['history']  = historyC;

    this.buildOverview(overviewC);
    this.buildHistory(historyC);

    this.showTab('overview');

    // ── Back button ──
    this.makeButton(180, 608, '← BACK', false, () => {
      this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
    });
  }

  // ─── Overview tab ─────────────────────────────────────────────────────────
  private buildOverview(c: Phaser.GameObjects.Container) {
    const u = this.userData!;
    const winRate = u.totalGames > 0 ? Math.round((u.totalWins / u.totalGames) * 100) : 0;

    // Win/loss donut-style bar
    const barY  = 110;
    const barW  = 300;
    const winW  = Math.round(barW * (winRate / 100));

    const barBg = this.make.graphics({ x: 0, y: 0, add: false });
    barBg.fillStyle(0xff4444, 1); barBg.fillRoundedRect(30, barY, barW, 20, 10);
    barBg.fillStyle(0x00cc55, 1); barBg.fillRoundedRect(30, barY, Math.max(winW, 10), 20, 10);
    barBg.lineStyle(1, 0xffffff, 0.3); barBg.strokeRoundedRect(30, barY, barW, 20, 10);

    const barLabel = this.make.text({ x: 180, y: barY + 10, text: `${winRate}% Win Rate`, style: { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }, add: false }).setOrigin(0.5);
    c.add([barBg, barLabel]);

    // Three big summary cards
    const summaryCards = [
      { label: 'GAMES',  value: `${u.totalGames}`,  color: '#aaddff', x: 60  },
      { label: 'WINS',   value: `${u.totalWins}`,   color: '#00ff88', x: 180 },
      { label: 'LOSSES', value: `${u.totalLosses}`, color: '#ff6655', x: 300 },
    ];
    summaryCards.forEach(sc => {
      const bg = this.make.graphics({ add: false });
      bg.fillStyle(0x000000, 0.6); bg.fillRoundedRect(sc.x - 44, 142, 88, 62, 10);
      bg.lineStyle(1, 0xffaa00, 0.5); bg.strokeRoundedRect(sc.x - 44, 142, 88, 62, 10);
      const val = this.make.text({ x: sc.x, y: 163, text: sc.value, style: { fontSize: '22px', color: sc.color, fontStyle: 'bold' }, add: false }).setOrigin(0.5);
      const lab = this.make.text({ x: sc.x, y: 188, text: sc.label, style: { fontSize: '10px', color: '#888888' }, add: false }).setOrigin(0.5);
      c.add([bg, val, lab]);
    });

    // Detailed stats grid
    const details = [
      ['🔥 Win Streak',    `${u.winStreak}`],
      ['🏆 Best Streak',   `${u.bestWinStreak}`],
      ['⭐ High Score',    `${u.highScore}`],
      ['📉 Avg Score',     `${u.averageScore}`],
      ['📊 Total Score',   `${u.totalScore}`],
      ['✨ XP',            `${u.experience}`],
      ['💰 Balance',       `$${this.balance.toFixed(2)}`],
      ['🎖 Rank',          u.rank],
    ];
    details.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = col === 0 ? 90 : 270;
      const cy  = 228 + row * 58;
      const bg  = this.make.graphics({ add: false });
      bg.fillStyle(0x000000, 0.6); bg.fillRoundedRect(cx - 74, cy - 22, 148, 44, 8);
      bg.lineStyle(1, 0xffaa00, 0.4); bg.strokeRoundedRect(cx - 74, cy - 22, 148, 44, 8);
      const lbl = this.make.text({ x: cx, y: cy - 8, text: label,  style: { fontSize: '10px', color: '#aaaaaa' }, add: false }).setOrigin(0.5);
      const val = this.make.text({ x: cx, y: cy + 8, text: value,  style: { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }, add: false }).setOrigin(0.5);
      c.add([bg, lbl, val]);
    });

    // Member since
    const since = this.make.text({ x: 180, y: 464, text: `Member since: ${new Date(this.userData!.createdAt).toLocaleDateString()}`, style: { fontSize: '11px', color: '#666666' }, add: false }).setOrigin(0.5);
    c.add(since);
  }

  // ─── History tab ──────────────────────────────────────────────────────────
  private buildHistory(c: Phaser.GameObjects.Container) {
    if (this.scores.length === 0) {
      const none = this.make.text({ x: 180, y: 300, text: 'No games played yet!', style: { fontSize: '16px', color: '#888888' }, add: false }).setOrigin(0.5);
      c.add(none);
      return;
    }

    // Column headers
    const hdrBg = this.make.graphics({ add: false });
    hdrBg.fillStyle(0x000000, 0.7); hdrBg.fillRoundedRect(10, 88, 340, 24, 5);
    hdrBg.lineStyle(1, 0xffaa00, 0.4); hdrBg.strokeRoundedRect(10, 88, 340, 24, 5);
    c.add(hdrBg);

    [['Date', 72], ['Score', 180], ['Result', 285], ['#', 340]].forEach(([h, x]) => {
      c.add(this.make.text({ x: x as number, y: 100, text: h as string, style: { fontSize: '11px', color: '#ffaa00', fontStyle: 'bold' }, add: false }).setOrigin(0.5));
    });

    // Rows (up to 15 most recent)
    this.scores.slice(0, 15).forEach((score, i) => {
      const rowY = 122 + i * 30;
      const even = i % 2 === 0;

      const rowBg = this.make.graphics({ add: false });
      rowBg.fillStyle(even ? 0x111111 : 0x0a0a0a, 0.7);
      rowBg.fillRoundedRect(10, rowY - 10, 340, 28, 4);
      c.add(rowBg);

      c.add(this.make.text({ x: 72,  y: rowY + 4, text: score.date, style: { fontSize: '10px', color: '#aaaaaa' }, add: false }).setOrigin(0.5));
      c.add(this.make.text({ x: 180, y: rowY + 4, text: `${score.score}`, style: { fontSize: '13px', color: '#ffff00', fontStyle: 'bold' }, add: false }).setOrigin(0.5));

      const resultCol = score.won ? '#00ff88' : '#ff6655';
      const resultTxt = score.won ? '✅ WIN' : '❌ LOSS';
      c.add(this.make.text({ x: 285, y: rowY + 4, text: resultTxt, style: { fontSize: '11px', color: resultCol }, add: false }).setOrigin(0.5));
      c.add(this.make.text({ x: 340, y: rowY + 4, text: `${i + 1}`, style: { fontSize: '10px', color: '#666666' }, add: false }).setOrigin(0.5));
    });

    // Summary at bottom
    const wins   = this.scores.filter(s => s.won).length;
    const best   = Math.max(...this.scores.map(s => s.score));
    const avgSc  = Math.round(this.scores.reduce((a, s) => a + s.score, 0) / this.scores.length);
    const sumY   = 122 + Math.min(this.scores.length, 15) * 30 + 16;

    const sumBg = this.make.graphics({ add: false });
    sumBg.fillStyle(0x0a200a, 0.9); sumBg.fillRoundedRect(10, sumY, 340, 40, 8);
    sumBg.lineStyle(1, 0x00ff88, 0.4); sumBg.strokeRoundedRect(10, sumY, 340, 40, 8);
    c.add(sumBg);
    c.add(this.make.text({ x: 180, y: sumY + 20, text: `Last ${this.scores.length} games — Best: ${best}  Avg: ${avgSc}  Wins: ${wins}`, style: { fontSize: '10px', color: '#00ff88' }, add: false }).setOrigin(0.5));
  }

  // ─── Tab switching ────────────────────────────────────────────────────────
  private tabBtns: Record<string, Phaser.GameObjects.Container> = {};

  private makeTab(x: number, y: number, text: string, key: 'overview' | 'history') {
    const img   = this.add.image(0, 0, 'btn-dark').setDisplaySize(160, 36);
    const label = this.add.text(0, 0, text, { fontSize: '13px', color: '#e0e8ff', fontStyle: 'bold' }).setOrigin(0.5);
    const c     = this.add.container(x, y, [img, label]);
    c.setSize(160, 36).setInteractive({ useHandCursor: true }).setDepth(20);
    c.on('pointerdown', () => this.showTab(key));
    this.tabBtns[key] = c;
  }

  private showTab(key: 'overview' | 'history') {
    this.activeTab = key;
    Object.entries(this.tabContainers).forEach(([k, cont]) => cont.setVisible(k === key));
    Object.entries(this.tabBtns).forEach(([k, btn]) => {
      // Highlight active tab
      (btn.list[0] as Phaser.GameObjects.Image).setTint(k === key ? 0xffaa00 : 0xffffff);
      (btn.list[1] as Phaser.GameObjects.Text).setColor(k === key ? '#ffaa00' : '#e0e8ff');
    });
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────
  private makeButton(x: number, y: number, text: string, primary: boolean, cb: () => void) {
    const texKey  = primary ? 'btn-orange' : 'btn-dark';
    const textCol = primary ? '#ffffff'    : '#e0e8ff';
    const img     = this.add.image(0, 0, texKey).setDisplaySize(200, 46);
    const label   = this.add.text(0, 0, text, { fontSize: '14px', color: textCol, fontStyle: 'bold', stroke: '#000000', strokeThickness: 1 }).setOrigin(0.5);
    const c       = this.add.container(x, y, [img, label]);
    c.setSize(200, 46).setInteractive({ useHandCursor: true }).setDepth(20);
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
  private showError()   { this.loadingText?.destroy(); this.add.text(180, 300, '❌ Failed to load stats', { fontSize: '16px', color: '#ff4444' }).setOrigin(0.5).setDepth(10); this.makeButton(180, 360, '← BACK', false, () => this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid })); }
  shutdown() { if (this.shootingStarTimer) this.shootingStarTimer.destroy(); }
}