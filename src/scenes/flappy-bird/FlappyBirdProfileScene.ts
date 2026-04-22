import Phaser from 'phaser';
import { CompleteUserData } from '../../firebase/simple';

const C = {
  NAVY:           '#000000',
  WHITE:          '#ffffff',
  YELLOW:         '#ffe040',
  GOLD:           '#ffd700',
  MUTED:          '#cceeff',
  GREEN:          '#88ffaa',
  RED:            '#ff8888',
  PANEL_FILL:     0x000000,
  PANEL_ALPHA:    0.48,
  PANEL_STROKE:   0xffffff,
  PANEL_STROKE_A: 0.65,
};

export class FlappyBirdProfileScene extends Phaser.Scene {
  private userData!: CompleteUserData;
  private cloudLayers: Array<Array<{ obj: Phaser.GameObjects.Graphics; speed: number }>> = [];

  constructor() {
    super({ key: 'FlappyBirdProfileScene' });
  }

  init(data: { userData: CompleteUserData; username?: string; uid?: string }) {
    if (!data?.userData) { this.scene.start('FlappyBirdStartScene'); return; }
    this.userData    = data.userData;
    this.cloudLayers = [];
  }

  create() {
    this.addBackground();
    this.addTitle();
    this.addAvatarCard();
    this.addStatsPanel();
    this.addWalletBar();
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

    this.add.text(180, 36, '👤  PLAYER PROFILE', {
      fontSize: '26px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, this.userData.username ? `@${this.userData.username}` : '', {
      fontSize: '11px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Avatar + identity card ───────────────────────────────────────────────
  private addAvatarCard() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, 92, 332, 76, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, 92, 332, 76, 14);

    // Avatar circle
    const oc = this.add.graphics().setDepth(10);
    oc.fillStyle(0xffffff, 0.2);
    oc.fillCircle(58, 130, 30);
    oc.lineStyle(2, 0xffffff, 0.6);
    oc.strokeCircle(58, 130, 30);

    this.add.text(58, 130, '👤', { fontSize: '30px' }).setOrigin(0.5).setDepth(11);

    // Display name
    this.add.text(106, 110, this.userData.displayName || '—', {
      fontSize: '18px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setDepth(10);

    this.add.text(106, 133, `${this.userData.rank}  ·  Level ${this.userData.level}`, {
      fontSize: '12px', color: C.YELLOW,
      stroke: C.NAVY, strokeThickness: 2,
    }).setDepth(10);

    const joinDate = new Date(this.userData.createdAt).toLocaleDateString();
    this.add.text(106, 152, `Joined ${joinDate}`, {
      fontSize: '10px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setDepth(10);
  }

  // ─── Stats grid ───────────────────────────────────────────────────────────
  private addStatsPanel() {
    const panelY = 178, panelH = 292;
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, panelY, 332, panelH, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, panelY, 332, panelH, 14);

    const stats = [
      { icon: '🎮', label: 'Games Played', value: String(this.userData.totalGames  || 0), color: C.WHITE   },
      { icon: '🏅', label: 'Wins',          value: String(this.userData.totalWins   || 0), color: C.GREEN   },
      { icon: '💔', label: 'Losses',        value: String(this.userData.totalLosses || 0), color: C.RED     },
      { icon: '🔥', label: 'Win Streak',    value: String(this.userData.winStreak   || 0), color: '#ffaa44' },
      { icon: '🏆', label: 'High Score',    value: String(this.userData.highScore   || 0), color: C.GOLD    },
      { icon: '✨', label: 'Experience',    value: String(this.userData.experience  || 0), color: '#aaddff' },
      { icon: '📊', label: 'Level',         value: String(this.userData.level       || 1), color: C.YELLOW  },
    ];

    // Two-column layout
    const colA = 30, colB = 190;
    let row = 0;

    stats.forEach((s, i) => {
      const col = i % 2 === 0 ? colA : colB;
      const y   = panelY + 16 + Math.floor(i / 2) * 40;

      // Label
      this.add.text(col + 24, y, s.icon + '  ' + s.label, {
        fontSize: '10px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setDepth(10);

      // Value
      this.add.text(col + 24, y + 16, s.value, {
        fontSize: '15px', color: s.color, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 2,
      }).setDepth(10);

      // Row divider (between rows, not between columns)
      if (i % 2 === 1 && i < stats.length - 1) {
        const div = this.add.graphics().setDepth(9);
        div.lineStyle(1, 0xffffff, 0.15);
        div.lineBetween(20, y + 34, 340, y + 34);
        row++;
      }
    });
  }

  // ─── Wallet bar ───────────────────────────────────────────────────────────
  private addWalletBar() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, 480, 332, 54, 12);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, 480, 332, 54, 12);

    this.add.text(42, 498, '💰', { fontSize: '26px' }).setOrigin(0.5).setDepth(10);
    this.add.text(64, 492, 'WALLET BALANCE', {
      fontSize: '9px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setDepth(10);
    this.add.text(64, 506, `$${(this.userData.balance ?? 0).toFixed(2)}`, {
      fontSize: '20px', color: C.GREEN, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 2,
    }).setDepth(10);
  }

  // ─── Buttons ─────────────────────────────────────────────────────────────
  private addButtons() {
    const hasBtn = this.textures.exists('blue-button');
    const makeBtn = (cx: number, cy: number, W: number, label: string, tint: number, cb: () => void) => {
      const H = 42;
      let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (hasBtn) {
        img = this.add.image(0, 0, 'blue-button').setDisplaySize(W, H);
        (img as Phaser.GameObjects.Image).setTint(tint);
      } else {
        const g = this.add.graphics();
        const col = tint === 0xffe040 ? 0xffc200 : 0x1255aa;
        g.fillStyle(col, 0.92); g.fillRoundedRect(-W/2, -H/2, W, H, 10);
        g.lineStyle(2, 0xffffff, 0.75); g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
        img = g;
      }
      const isGold  = tint === 0xffe040;
      const txtCol  = isGold ? C.NAVY : C.WHITE;
      const lbl = this.add.text(0, 0, label, {
        fontSize: '13px', color: txtCol, fontStyle: 'bold',
        stroke: isGold ? C.WHITE : C.NAVY, strokeThickness: 1,
      }).setOrigin(0.5);

      const btn = this.add.container(cx, cy, [img as any, lbl]);
      btn.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);
      btn.on('pointerover', () => {
        this.tweens.add({ targets: btn, scaleX: 1.06, scaleY: 1.06, duration: 75 });
        lbl.setColor(isGold ? '#000000' : C.YELLOW);
      });
      btn.on('pointerout', () => {
        this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 75 });
        lbl.setColor(txtCol);
      });
      btn.on('pointerdown', () =>
        this.tweens.add({ targets: btn, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: cb })
      );
    };

    const yRow = 562;
    makeBtn(70,  yRow, 120, '← BACK',        0xffffff, () => this.scene.start('FlappyBirdStartScene', { username: this.userData.username }));
    makeBtn(190, yRow, 140, '✏️ EDIT PROFILE', 0xffffff, () => window.open(`https://wintapgames.com/profile/edit/${this.userData.username}`, '_blank'));
    makeBtn(317, yRow, 100, '💰 WALLET',      0xffe040, () => window.open(`https://wintapgames.com/wallet/${this.userData.username}`, '_blank'));

    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }
}