import Phaser from 'phaser';
import { getFlappyBirdLeaderboard, FlappyBirdLeaderboardEntry } from '../../firebase/flappyBirdSimple';

const C = {
  NAVY:         '#000000',
  WHITE:        '#ffffff',
  YELLOW:       '#ffe040',
  GOLD:         '#ffd700',
  MUTED:        '#cceeff',
  PANEL_FILL:   0x000000,
  PANEL_ALPHA:  0.48,
  PANEL_STROKE: 0xffffff,
  PANEL_STROKE_A: 0.65,
};

export class FlappyBirdLeaderboardScene extends Phaser.Scene {
  private leaderboard: FlappyBirdLeaderboardEntry[] = [];
  private username: string = '';
  private uid: string = '';
  private cloudLayers: Array<Array<{ obj: Phaser.GameObjects.Graphics; speed: number }>> = [];

  constructor() {
    super({ key: 'FlappyBirdLeaderboardScene' });
  }

  init(data: { username?: string; uid?: string }) {
    this.username    = data?.username || '';
    this.uid         = data?.uid || '';
    this.cloudLayers = [];
  }

  async create() {
    this.addBackground();
    this.addTitle();

    const loadingText = this.add.text(180, 320, 'LOADING...', {
      fontSize: '20px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    try {
      this.leaderboard = await getFlappyBirdLeaderboard(15);
      loadingText.destroy();
      this.leaderboard.length === 0 ? this.showEmpty() : this.displayLeaderboard();
    } catch (e) {
      loadingText.destroy();
      this.showError();
    }

    this.addButtons();
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

  // ─── Background ──────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#4EC0CA');
    const key = this.textures.exists('background-alt') ? 'background-alt'
              : this.textures.exists('background')      ? 'background' : null;
    if (key) this.add.image(180, 320, key).setDisplaySize(360, 640).setDepth(-2);
    this.spawnClouds();
  }

  private spawnClouds() {
    const make = (defs: { x: number; y: number; w: number; h: number }[], alpha: number, speed: number) => {
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
    make([{ x: 50, y: 78, w: 85, h: 24 }, { x: 210, y: 68, w: 105, h: 28 }, { x: 340, y: 88, w: 72, h: 20 }], 0.32, 6);
    make([{ x: 110, y: 108, w: 115, h: 34 }, { x: 295, y: 98, w: 92, h: 28 }], 0.5, 14);
  }

  // ─── Title ───────────────────────────────────────────────────────────────
  private addTitle() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(28, 18, 304, 64, 14);
    p.lineStyle(2, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(28, 18, 304, 64, 14);

    this.add.text(180, 36, '🏆  LEADERBOARD', {
      fontSize: '26px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'TOP FLAPPY PILOTS', {
      fontSize: '11px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Table ───────────────────────────────────────────────────────────────
  private displayLeaderboard() {
    // Panel
    const panelH = Math.min(this.leaderboard.length, 12) * 36 + 44;
    const panel = this.add.graphics().setDepth(9);
    panel.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    panel.fillRoundedRect(14, 96, 332, panelH, 14);
    panel.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    panel.strokeRoundedRect(14, 96, 332, panelH, 14);

    // Header row
    const headers = [
      { x: 36,  label: 'RANK'  },
      { x: 106, label: 'PLAYER' },
      { x: 242, label: 'SCORE' },
      { x: 318, label: 'WINS'  },
    ];
    headers.forEach(h =>
      this.add.text(h.x, 108, h.label, {
        fontSize: '10px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(10)
    );

    // Divider under header
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffffff, 0.3);
    div.lineBetween(20, 128, 340, 128);

    let yPos = 136;
    const maxRows = 12;

    this.leaderboard.slice(0, maxRows).forEach((entry, i) => {
      const rank = i + 1;

      // Alternating row tint
      if (i % 2 === 0) {
        const rowBg = this.add.graphics().setDepth(9);
        rowBg.fillStyle(0xffffff, 0.06);
        rowBg.fillRect(16, yPos - 8, 328, 32);
      }

      // Medal / rank
      const medalMap: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
      const rankStr  = medalMap[rank] ?? `${rank}.`;
      const rankCol  = rank === 1 ? C.GOLD : rank === 2 ? '#d0d0d0' : rank === 3 ? '#cd7f32' : C.WHITE;
      this.add.text(36, yPos, rankStr, {
        fontSize: rank <= 3 ? '18px' : '14px', color: rankCol,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Name
      let name = entry.displayName || entry.username || '—';
      if (name.length > 10) name = name.slice(0, 9) + '…';
      const isMe = (entry.username || '').toLowerCase() === this.username.toLowerCase();
      this.add.text(106, yPos, name, {
        fontSize: '13px', color: isMe ? C.YELLOW : C.WHITE,
        fontStyle: isMe ? 'bold' : 'normal',
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Score
      this.add.text(242, yPos, entry.highScore.toString(), {
        fontSize: '15px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Wins
      const wins = entry.totalWins ?? 0;
      this.add.text(318, yPos, wins.toString(), {
        fontSize: '13px', color: wins > 0 ? C.YELLOW : C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      yPos += 36;
    });

    if (this.leaderboard.length > maxRows) {
      this.add.text(180, yPos + 8, `+ ${this.leaderboard.length - maxRows} more players`, {
        fontSize: '11px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    }
  }

  private showEmpty() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(40, 200, 280, 130, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(40, 200, 280, 130, 14);

    this.add.text(180, 235, '📊', { fontSize: '42px' }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 284, 'No players yet', {
      fontSize: '17px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 308, 'Be the first to play!', {
      fontSize: '12px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  private showError() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(40, 220, 280, 120, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(40, 220, 280, 120, 14);

    this.add.text(180, 255, '❌', { fontSize: '36px' }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 298, 'Failed to load leaderboard', {
      fontSize: '14px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 3, wordWrap: { width: 240 },
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Buttons ─────────────────────────────────────────────────────────────
  private addButtons() {
    const hasBtn = this.textures.exists('blue-button');
    const makeBtn = (cx: number, cy: number, label: string, cb: () => void) => {
      const W = 140, H = 42;
      let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (hasBtn) {
        img = this.add.image(0, 0, 'blue-button').setDisplaySize(W, H);
      } else {
        const g = this.add.graphics();
        g.fillStyle(0x1255aa, 0.92);
        g.fillRoundedRect(-W/2, -H/2, W, H, 10);
        g.lineStyle(2, 0xffffff, 0.75);
        g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
        img = g;
      }
      const lbl = this.add.text(0, 0, label, {
        fontSize: '14px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 1,
      }).setOrigin(0.5);

      const btn = this.add.container(cx, cy, [img as any, lbl]);
      btn.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);

      btn.on('pointerover', () => {
        this.tweens.add({ targets: btn, scaleX: 1.06, scaleY: 1.06, duration: 75 });
        lbl.setColor(C.YELLOW);
      });
      btn.on('pointerout', () => {
        this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 75 });
        lbl.setColor(C.WHITE);
      });
      btn.on('pointerdown', () => {
        this.tweens.add({ targets: btn, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: cb });
      });
    };

    const yBtn = 598;
    makeBtn(95,  yBtn, '← BACK',    () => this.scene.start('FlappyBirdStartScene', { username: this.username, uid: this.uid }));
    makeBtn(265, yBtn, '🔄 REFRESH', () => this.scene.restart({ username: this.username, uid: this.uid }));

    // Footer
    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }
}