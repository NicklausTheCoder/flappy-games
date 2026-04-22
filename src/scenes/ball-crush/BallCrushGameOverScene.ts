// src/scenes/ball-crush/BallCrushGameOverScene.ts
import Phaser from 'phaser';
import { updateBallCrushProfileStats, getBallCrushBalance } from '../../firebase/ballCrushSimple';
import { ballCrushMultiplayer } from '../../firebase/ballCrushMultiplayer';

export class BallCrushGameOverScene extends Phaser.Scene {
  // ── Game result data ────────────────────────────────────────────────
  private score: number = 0;
  private won: boolean = false;
  private winnerUsername: string = '';
  private winnerUid: string = '';
  private uid: string = '';
  private username: string = '';
  private gameDuration: number = 0;
  private lobbyId: string = '';

  // ── Post-game data (fetched async) ──────────────────────────────────
  private newBalance: number = 0;

  // ── Star field ──────────────────────────────────────────────────────
  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  // ── Particle-style confetti (win only) ──────────────────────────────
  private confettiBits: Array<{
    obj: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
    vx: number; vy: number; spin: number;
  }> = [];
  private confettiActive: boolean = false;

  constructor() {
    super({ key: 'BallCrushGameOverScene' });
  }

  // ─── preload ──────────────────────────────────────────────────────────────
  preload() {
    if (!this.textures.exists('btn-orange')) this.load.image('btn-orange', 'assets/button.png');
    if (!this.textures.exists('btn-dark'))   this.load.image('btn-dark',   'assets/button2.png');
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  init(data: {
    score: number;
    won: boolean;
    winnerUsername: string;
    winnerUid: string;
    uid: string;
    username: string;
    duration: number;
    lobbyId: string;
  }) {
    this.score           = data.score         ?? 0;
    this.won             = data.won           ?? false;
    this.winnerUsername  = data.winnerUsername ?? '';
    this.winnerUid       = data.winnerUid     ?? '';
    this.uid             = data.uid           ?? '';
    this.username        = data.username      ?? '';
    this.gameDuration    = data.duration      ?? 0;
    this.lobbyId         = data.lobbyId       ?? '';
    this.newBalance      = 0;
    this.confettiBits    = [];
    this.confettiActive  = false;
  }

  // ─── create ───────────────────────────────────────────────────────────────
  async create() {
    this.addBackground();

    // Save result + fetch new balance in parallel — UI builds immediately,
    // balance text updates when the fetch resolves.
    this.storeGameResult();
    const balancePromise = getBallCrushBalance(this.uid);

    this.buildUI();

    // Update balance display once we have it
    balancePromise.then((bal) => {
      this.newBalance = bal;
      if (this.scene?.isActive() && this.balanceText?.active) {
        this.balanceText.setText(`💰 Balance: $${bal.toFixed(2)}`);
      }
    }).catch(console.error);
  }

  // ─── update ───────────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    const dt = delta / 1000;

    // Scroll stars
    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    // Confetti physics (win only)
    if (this.confettiActive) {
      this.confettiBits.forEach(c => {
        c.obj.x  += c.vx * dt;
        c.obj.y  += c.vy * dt;
        c.vy     += 200 * dt; // gravity
        c.obj.angle += c.spin * dt;
        // Wrap horizontally, destroy when off bottom
        if (c.obj.x < -10)  c.obj.x = 370;
        if (c.obj.x > 370)  c.obj.x = -10;
        if (c.obj.y > 660)  c.obj.destroy();
      });
      // Remove destroyed bits
      this.confettiBits = this.confettiBits.filter(c => c.obj.active);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI BUILD
  // ─────────────────────────────────────────────────────────────────────────
  private balanceText!: Phaser.GameObjects.Text;

  private buildUI() {
    if (this.won) {
      this.buildWinUI();
    } else {
      this.buildLossUI();
    }
    this.buildSharedBottom();
  }

  // ─── WIN screen ───────────────────────────────────────────────────────────
  private buildWinUI() {
    // Spawn confetti
    this.spawnConfetti();

    // Big trophy
    const trophy = this.add.text(180, 80, '🏆', { fontSize: '72px' }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: trophy, scaleX: 1.15, scaleY: 1.15,
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // YOU WIN
    const winText = this.add.text(180, 162, 'YOU WIN!', {
      fontSize: '38px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10).setAlpha(0);

    this.tweens.add({ targets: winText, alpha: 1, duration: 600, ease: 'Sine.easeOut' });

    // Shimmer on win text
    this.time.addEvent({
      delay: 1200, loop: true, callback: () => {
        if (!winText.active) return;
        this.tweens.add({
          targets: winText, alpha: 0.6, duration: 150, yoyo: true,
        });
      },
    });

    // Prize card
    const prizeCard = this.add.graphics().setDepth(10);
    prizeCard.fillStyle(0x0a2a0a, 0.95);
    prizeCard.fillRoundedRect(60, 188, 240, 90, 14);
    prizeCard.lineStyle(2, 0x00ff88, 0.8);
    prizeCard.strokeRoundedRect(60, 188, 240, 90, 14);

    // Inner glow strip
    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0x00ff88, 0.12);
    strip.fillRoundedRect(60, 188, 240, 24, { tl: 14, tr: 14, bl: 0, br: 0 });

    this.add.text(180, 200, 'PRIZE AWARDED', {
      fontSize: '10px', color: '#00ff88', letterSpacing: 3,
    }).setOrigin(0.5).setDepth(12);

    // Flying prize amount
    const prize = this.add.text(180, 238, '+$1.50', {
      fontSize: '36px', color: '#00ff88', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12).setAlpha(0).setY(260);

    this.tweens.add({
      targets: prize, y: 238, alpha: 1,
      duration: 700, ease: 'Back.easeOut',
    });

    this.add.text(180, 268, 'credited to your wallet', {
      fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(12);

    // Score card
    this.buildScoreCard(298);
  }

  // ─── LOSS screen ──────────────────────────────────────────────────────────
  private buildLossUI() {
    // Skull / sad emoji
    const skull = this.add.text(180, 76, '💔', { fontSize: '64px' }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: skull, angle: -8,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // DEFEAT
    this.add.text(180, 156, 'DEFEAT', {
      fontSize: '36px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    // Winner card
    const winnerCard = this.add.graphics().setDepth(10);
    winnerCard.fillStyle(0x1a0000, 0.95);
    winnerCard.fillRoundedRect(55, 184, 250, 74, 12);
    winnerCard.lineStyle(1.5, 0xff4444, 0.7);
    winnerCard.strokeRoundedRect(55, 184, 250, 74, 12);

    this.add.text(180, 196, 'WINNER', {
      fontSize: '10px', color: '#ff6666', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 216, `🏆 ${this.winnerUsername}`, {
      fontSize: '22px', color: '#ffaa00', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 244, 'Better luck next time!', {
      fontSize: '12px', color: '#888888',
    }).setOrigin(0.5).setDepth(11);

    // Score card
    this.buildScoreCard(278);
  }

  // ─── Shared score card ────────────────────────────────────────────────────
  private buildScoreCard(y: number) {
    const mins = Math.floor(this.gameDuration / 60);
    const secs = this.gameDuration % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x050510, 0.9);
    card.fillRoundedRect(30, y, 300, 90, 12);
    card.lineStyle(1, 0xffaa00, 0.3);
    card.strokeRoundedRect(30, y, 300, 90, 12);

    // Three stat columns
    const stats = [
      { label: 'SCORE',    value: `${this.score}`,  color: '#ffff00' },
      { label: 'DURATION', value: timeStr,           color: '#aaddff' },
      { label: 'RESULT',   value: this.won ? 'WIN' : 'LOSS', color: this.won ? '#00ff88' : '#ff6666' },
    ];

    stats.forEach((s, i) => {
      const cx = 80 + i * 100;
      const cy = y + 28;

      // Divider between columns
      if (i > 0) {
        const div = this.add.graphics().setDepth(11);
        div.lineStyle(1, 0xffaa00, 0.15);
        div.beginPath();
        div.moveTo(cx - 50, y + 10);
        div.lineTo(cx - 50, y + 78);
        div.strokePath();
      }

      this.add.text(cx, cy, s.value, {
        fontSize: '20px', color: s.color, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);

      this.add.text(cx, cy + 26, s.label, {
        fontSize: '9px', color: '#666666', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(11);
    });
  }

  // ─── Shared bottom (balance + buttons) ───────────────────────────────────
  private buildSharedBottom() {
    const baseY = this.won ? 410 : 390;

    // Balance display
    const balCard = this.add.graphics().setDepth(10);
    balCard.fillStyle(0x000000, 0.6);
    balCard.fillRoundedRect(80, baseY, 200, 34, 8);
    balCard.lineStyle(1, 0x00ff88, 0.4);
    balCard.strokeRoundedRect(80, baseY, 200, 34, 8);

    this.balanceText = this.add.text(180, baseY + 17, '💰 Balance: loading...', {
      fontSize: '13px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(11);

    // Play again button (orange)
    this.makeButton(180, baseY + 70, '🎮  PLAY AGAIN', true, () => {
      this.scene.start('BallCrushMatchmakingScene', {
        username:    this.username,
        uid:         this.uid,
        displayName: this.username,
        avatar:      'default',
      });
    });

    // Main menu button (dark)
    this.makeButton(180, baseY + 130, '← MAIN MENU', false, () => {
      this.scene.start('BallCrushStartScene', {
        username: this.username,
        uid:      this.uid,
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFETTI (win only)
  // ─────────────────────────────────────────────────────────────────────────
  private spawnConfetti() {
    this.confettiActive = true;
    const colors = [0xffaa00, 0xff4444, 0x00ff88, 0x4488ff, 0xffff00, 0xff88ff, 0x44ffff];

    // Initial burst
    for (let i = 0; i < 60; i++) {
      this.spawnConfettiBit(colors);
    }

    // Trickle for 4 seconds
    const trickle = this.time.addEvent({
      delay: 120, repeat: 33,
      callback: () => {
        for (let i = 0; i < 3; i++) this.spawnConfettiBit(colors);
      },
    });
  }

  private spawnConfettiBit(colors: number[]) {
    const col   = colors[Phaser.Math.Between(0, colors.length - 1)];
    const x     = Phaser.Math.Between(20, 340);
    const useRect = Math.random() > 0.5;

    let obj: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
    if (useRect) {
      obj = this.add.rectangle(x, -10, Phaser.Math.Between(4, 9), Phaser.Math.Between(6, 14), col, 0.9).setDepth(8);
    } else {
      obj = this.add.circle(x, -10, Phaser.Math.Between(3, 6), col, 0.85).setDepth(8);
    }

    this.confettiBits.push({
      obj,
      vx:   Phaser.Math.FloatBetween(-60, 60),
      vy:   Phaser.Math.FloatBetween(40, 160),
      spin: Phaser.Math.FloatBetween(-300, 300),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STORE RESULT
  // ─────────────────────────────────────────────────────────────────────────
  private async storeGameResult() {
    if (!this.uid) {
      console.error('❌ No UID for saving game result');
      return;
    }
    try {
      const tasks: Promise<any>[] = [
        updateBallCrushProfileStats(this.uid, this.score, this.won, this.gameDuration),
      ];
      // endGame awards the $1.50 prize to the winner — only call if lobby + winner known
      if (this.lobbyId && this.winnerUid) {
        tasks.push(ballCrushMultiplayer.endGame(this.lobbyId, this.winnerUid));
      }
      await Promise.all(tasks);
      console.log('✅ Game result stored');
    } catch (err) {
      console.error('❌ Error storing game result:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  private makeButton(x: number, y: number, text: string, primary: boolean, cb: () => void) {
    const texKey  = primary ? 'btn-orange' : 'btn-dark';
    const textCol = primary ? '#ffffff'    : '#e0e8ff';
    const img     = this.add.image(0, 0, texKey).setDisplaySize(210, 48);
    const label   = this.add.text(0, 0, text, {
      fontSize: '15px', color: textCol, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);

    const c = this.add.container(x, y, [img, label]);
    c.setSize(210, 48).setInteractive({ useHandCursor: true }).setDepth(20);

    c.on('pointerover',  () => { label.setColor('#ffff00'); this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    c.on('pointerout',   () => { label.setColor(textCol);  this.tweens.add({ targets: c, scaleX: 1,    scaleY: 1,    duration: 80 }); });
    c.on('pointerdown',  () => {
      this.tweens.add({ targets: c, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true, onComplete: cb });
    });
  }

  // ─── Background ───────────────────────────────────────────────────────────
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
        Phaser.Math.Between(3000, 8000), () => { this.spawnShootingStar(); next(); }
      );
    };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(10, 160);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(500, 900);
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

  shutdown() {
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
    this.confettiActive = false;
  }
}