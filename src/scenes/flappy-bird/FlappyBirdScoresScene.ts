import Phaser from 'phaser';
import {
  FlappyBirdUserData,
  FlappyBirdScoreEntry as ScoreEntry,
  getFlappyBirdUserScores,
  getFlappyBirdUserData,
} from '../../firebase/flappyBirdSimple';

const C = {
  NAVY:           '#000000',
  WHITE:          '#ffffff',
  YELLOW:         '#ffe040',
  GOLD:           '#ffd700',
  MUTED:          '#cceeff',
  GREEN:          '#88ffaa',
  PANEL_FILL:     0x000000,
  PANEL_ALPHA:    0.48,
  PANEL_STROKE:   0xffffff,
  PANEL_STROKE_A: 0.65,
};

export class FlappyBirdScoresScene extends Phaser.Scene {
  private userData!: FlappyBirdUserData;
  private uid: string = '';
  private scores: ScoreEntry[] = [];
  private cloudLayers: Array<Array<{ obj: Phaser.GameObjects.Graphics; speed: number }>> = [];

  constructor() {
    super({ key: 'FlappyBirdScoresScene' });
  }

  async init(data: { userData: FlappyBirdUserData; uid: string }) {
    if (!data?.userData) { this.scene.start('FlappyBirdStartScene'); return; }
    this.userData    = data.userData;
    this.uid         = data.uid || this.userData.uid || '';
    this.cloudLayers = [];

    if (this.uid && !this.userData.highScore) {
      try {
        const fresh = await getFlappyBirdUserData(this.uid);
        if (fresh) this.userData = fresh;
      } catch {}
    }
  }

  async create() {
    this.addBackground();
    this.addTitle();
    this.addStatBar();

    const loadingText = this.add.text(180, 370, 'LOADING SCORES...', {
      fontSize: '18px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    await this.loadScores();
    loadingText.destroy();

    this.addScoresPanel();
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

    this.add.text(180, 36, '📊  MY SCORES', {
      fontSize: '26px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'YOUR GAME HISTORY', {
      fontSize: '11px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Stat bar ─────────────────────────────────────────────────────────────
  private addStatBar() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(8, 92, 344, 50, 12);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(8, 92, 344, 50, 12);

    const stats = [
      { x: 60,  label: 'BEST',  value: String(this.userData.highScore  || 0) },
      { x: 180, label: 'GAMES', value: String(this.userData.totalGames || 0) },
      { x: 300, label: 'WINS',  value: String(this.userData.totalWins  || 0) },
    ];

    stats.forEach((s, i) => {
      if (i > 0) {
        const d = this.add.graphics().setDepth(10);
        d.lineStyle(1, 0xffffff, 0.3);
        d.beginPath(); d.moveTo(s.x - 58, 100); d.lineTo(s.x - 58, 134); d.strokePath();
      }
      this.add.text(s.x, 104, s.label, {
        fontSize: '9px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
      this.add.text(s.x, 121, s.value, {
        fontSize: '15px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    });
  }

  // ─── Data ────────────────────────────────────────────────────────────────
  private async loadScores() {
    if (!this.uid) { this.scores = []; return; }
    try {
      this.scores = await getFlappyBirdUserScores(this.uid, 10);
    } catch {
      this.scores = [];
    }
  }

  // ─── Scores panel ─────────────────────────────────────────────────────────
  private addScoresPanel() {
    const panelY = 152, panelH = 390;
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, panelY, 332, panelH, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, panelY, 332, panelH, 14);

    if (!this.scores.length) {
      this.add.text(180, panelY + 90, '🕊️', { fontSize: '44px' }).setOrigin(0.5).setDepth(10);
      this.add.text(180, panelY + 148, 'No games yet', {
        fontSize: '17px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
      this.add.text(180, panelY + 174, 'Play to see your history here!', {
        fontSize: '12px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
      return;
    }

    // Column headers
    const headers = [
      { x: 30,  label: '#'      },
      { x: 80,  label: 'DATE'   },
      { x: 220, label: 'SCORE'  },
      { x: 310, label: 'RESULT' },
    ];
    headers.forEach(h =>
      this.add.text(h.x, panelY + 12, h.label, {
        fontSize: '10px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(10)
    );

    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffffff, 0.3);
    div.lineBetween(20, panelY + 32, 340, panelY + 32);

    let yPos = panelY + 42;
    const maxRows = 10;

    this.scores.slice(0, maxRows).forEach((score, i) => {
      if (i % 2 === 0) {
        const rb = this.add.graphics().setDepth(9);
        rb.fillStyle(0xffffff, 0.06);
        rb.fillRect(16, yPos - 7, 328, 32);
      }

      // Row number
      this.add.text(30, yPos, String(i + 1), {
        fontSize: '13px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Date — handle Firestore Timestamp, epoch ms/s, ISO string, or pre-formatted string
      let dateStr = '—';
      if (score.date !== undefined && score.date !== null) {
        try {
          let d: Date | null = null;

          if (typeof score.date === 'object' && 'toDate' in score.date) {
            // Firestore Timestamp
            d = (score.date as any).toDate();
          } else if (typeof score.date === 'number') {
            // Epoch — treat values < 1e10 as seconds, otherwise milliseconds
            d = new Date(score.date < 1e10 ? score.date * 1000 : score.date);
          } else if (typeof score.date === 'string') {
            const asNum = Number(score.date);
            if (!isNaN(asNum)) {
              d = new Date(asNum < 1e10 ? asNum * 1000 : asNum);
            } else {
              d = new Date(score.date);
            }
          }

          if (d && !isNaN(d.getTime())) {
            dateStr = `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
          } else if (typeof score.date === 'string' && score.date.length > 0) {
            // Already a human-readable string — use as-is
            dateStr = score.date.length > 10 ? score.date.slice(0, 10) : score.date;
          }
        } catch {
          dateStr = '—';
        }
      }
      this.add.text(80, yPos, dateStr, {
        fontSize: '12px', color: C.WHITE,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Score — highlight if personal best
      const isPB = score.score === this.userData.highScore;
      this.add.text(220, yPos, String(score.score), {
        fontSize: isPB ? '16px' : '14px',
        color: isPB ? C.GOLD : C.WHITE,
        fontStyle: isPB ? 'bold' : 'normal',
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);

      // Win / loss badge
      const badge = score.won ? '🏆' : '💔';
      this.add.text(310, yPos, badge, { fontSize: '16px' }).setOrigin(0.5).setDepth(10);

      yPos += 34;
      if (yPos > panelY + panelH - 20) return;
    });

    if (this.scores.length > maxRows) {
      this.add.text(180, yPos + 6, `+ ${this.scores.length - maxRows} more games`, {
        fontSize: '11px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    }
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
        g.fillStyle(0x1255aa, 0.92); g.fillRoundedRect(-W/2, -H/2, W, H, 10);
        g.lineStyle(2, 0xffffff, 0.75); g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
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
      btn.on('pointerdown', () =>
        this.tweens.add({ targets: btn, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: cb })
      );
    };

    const yBtn = 598;
    makeBtn(95,  yBtn, '← BACK',    () => this.scene.start('FlappyBirdStartScene', { username: this.userData.username, uid: this.uid, userData: this.userData }));
    makeBtn(265, yBtn, '🔄 REFRESH', () => this.scene.restart({ userData: this.userData, uid: this.uid }));

    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }
}