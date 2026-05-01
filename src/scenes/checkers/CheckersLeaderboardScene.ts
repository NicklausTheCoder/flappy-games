// src/scenes/checkers/CheckersLeaderboardScene.ts
import Phaser from 'phaser';
import { getCheckersLeaderboard, CheckersLeaderboardEntry } from '../../firebase/checkersService';

// ── Palette (matches CheckersStartScene) ──────────────────────────────────────
const C = {
  DARK_WOOD:  '#1a0d00',
  MID_WOOD:   '#3d1a00',
  GOLD:       '#ffaa00',
  GOLD_DIM:   '#cc8800',
  WHITE:      '#ffffff',
  CREAM:      '#f5e6c8',
};

export class CheckersLeaderboardScene extends Phaser.Scene {
  private leaderboard: CheckersLeaderboardEntry[] = [];
  private username: string = '';
  private uid:      string = '';
  private userData: any    = null;

  // Parallax squares (same as start scene)
  private bgSquares: Array<{ obj: Phaser.GameObjects.Rectangle; speed: number }> = [];

  constructor() { super({ key: 'CheckersLeaderboardScene' }); }

  init(data: { username?: string; uid?: string; userData?: any }) {
    this.username  = data?.username  || '';
    this.uid       = data?.uid       || '';
    this.userData  = data?.userData  || null;
    this.bgSquares = [];
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async create() {
    this.addBackground();
    this.addTitle();
    this.addBackButton();

    const loading = this.showLoading();
    try {
      this.leaderboard = await getCheckersLeaderboard(15);
      loading.destroy();
      if (this.leaderboard.length === 0) {
        this.showEmptyState();
      } else {
        this.displayLeaderboard();
      }
    } catch (e) {
      loading.destroy();
      this.showError();
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.bgSquares.forEach(s => {
      s.obj.y -= s.speed * dt;
      if (s.obj.y < -20) s.obj.y = 660;
    });
  }

  // ─── Background ──────────────────────────────────────────────────────────────

  private addBackground() {
    this.cameras.main.setBackgroundColor('#1a0d00');

    const bgKey = this.textures.exists('checkers-bg')  ? 'checkers-bg'
                : this.textures.exists('checkers-bg2') ? 'checkers-bg2'
                : null;

    if (bgKey) {
      this.add.image(180, 320, bgKey).setDisplaySize(360, 640).setDepth(-2);
      const dim = this.add.graphics().setDepth(-1);
      dim.fillStyle(0x000000, 0.68);
      dim.fillRect(0, 0, 360, 640);
    } else {
      this.drawCheckerboard();
    }

    // Floating diagonal squares — identical to start scene
    for (let i = 0; i < 12; i++) {
      const size   = Phaser.Math.Between(14, 30);
      const isDark = i % 2 === 0;
      const sq = this.add.rectangle(
        Phaser.Math.Between(0, 360),
        Phaser.Math.Between(0, 660),
        size, size,
        isDark ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.04, 0.12)
      ).setDepth(0).setAngle(45);
      this.bgSquares.push({ obj: sq, speed: Phaser.Math.FloatBetween(8, 22) });
    }
  }

  private drawCheckerboard() {
    const size = 45;
    const cols = Math.ceil(360 / size) + 1;
    const rows = Math.ceil(640 / size) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isDark = (r + c) % 2 === 0;
        this.add.rectangle(
          c * size + size / 2, r * size + size / 2,
          size, size,
          isDark ? 0x1a0d00 : 0x3d1a00
        ).setDepth(-2);
      }
    }
  }

  // ─── Title ───────────────────────────────────────────────────────────────────

  private addTitle() {
    // Outer panel — same style as start scene title
    const bg = this.add.graphics().setDepth(9);
    bg.fillStyle(0x3d1a00, 0.95);
    bg.fillRoundedRect(24, 14, 312, 60, 14);
    bg.lineStyle(2, 0xffaa00, 0.85);
    bg.strokeRoundedRect(24, 14, 312, 60, 14);

    const inner = this.add.graphics().setDepth(10);
    inner.lineStyle(1, 0xffaa00, 0.28);
    inner.strokeRoundedRect(30, 20, 300, 48, 10);

    this.add.text(180, 32, '🏆  LEADERBOARD', {
      fontSize: '24px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 5,
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 60, 'R A N K E D   B Y   W I N S', {
      fontSize: '10px', color: C.GOLD_DIM, letterSpacing: 3,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);
  }

  // ─── Table ───────────────────────────────────────────────────────────────────

  private displayLeaderboard() {
    const tableTop    = 88;
    const rowH        = 30;
    const tableHeight = Math.min(this.leaderboard.length, 14) * rowH + 32;

    // Table card background
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x3d1a00, 0.92);
    card.fillRoundedRect(8, tableTop, 344, tableHeight, 14);
    card.lineStyle(1.5, 0xffaa00, 0.7);
    card.strokeRoundedRect(8, tableTop, 344, tableHeight, 14);

    // Column header row
    const hY = tableTop + 12;
    const cols = [
      { x: 30,  label: '#',      align: 'left'   },
      { x: 58,  label: 'PLAYER', align: 'left'   },
      { x: 222, label: 'WINS',   align: 'center' },
      { x: 271, label: 'CAPT',   align: 'center' },
      { x: 328, label: 'WIN%',   align: 'center' },
    ];

    cols.forEach(col => {
      this.add.text(col.x, hY, col.label, {
        fontSize: '10px', color: C.GOLD_DIM, fontStyle: 'bold', letterSpacing: 1,
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(col.align === 'center' ? 0.5 : 0).setDepth(11);
    });

    // Divider under header
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.35);
    div.lineBetween(16, tableTop + 26, 344, tableTop + 26);

    // Rows
    this.leaderboard.slice(0, 14).forEach((entry, i) => {
      const rank = i + 1;
      const y    = tableTop + 32 + i * rowH;

      // Alternating row tint
      if (i % 2 === 0) {
        const rowBg = this.add.graphics().setDepth(9);
        rowBg.fillStyle(0x000000, 0.18);
        rowBg.fillRect(10, y - 10, 340, rowH);
      }

      // Rank / medal
      const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
      const rankLabel = medals[rank] ?? `${rank}.`;
      const rankColor = rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : C.CREAM;

      this.add.text(30, y, rankLabel, {
        fontSize: rank <= 3 ? '16px' : '13px',
        color: rankColor, fontStyle: rank <= 3 ? 'bold' : 'normal',
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(11);

      // Player name — truncate to fit
      let name = entry.displayName || entry.username || '—';
      if (name.length > 12) name = name.slice(0, 10) + '…';

      // Highlight current user
      const isMe = entry.username === this.username;
      this.add.text(58, y, name, {
        fontSize: '13px',
        color: isMe ? C.GOLD : C.CREAM,
        fontStyle: isMe ? 'bold' : 'normal',
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(11);

      // Wins
      this.add.text(222, y, `${entry.gamesWon ?? 0}`, {
        fontSize: '14px', color: '#66ff88', fontStyle: 'bold',
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(11);

      // Pieces captured
      this.add.text(271, y, `${entry.piecesCaptured ?? 0}`, {
        fontSize: '13px', color: C.CREAM,
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(11);

      // Win rate — colour coded
      const wr    = entry.winRate ?? 0;
      const wrCol = wr >= 70 ? '#66ff88' : wr >= 50 ? '#ffff66' : '#ff8866';
      this.add.text(328, y, `${wr}%`, {
        fontSize: '13px', color: wrCol, fontStyle: 'bold',
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(11);
    });

    // Footer note if list was trimmed
    if (this.leaderboard.length > 14) {
      const noteY = tableTop + tableHeight + 6;
      this.add.text(180, noteY, `… and ${this.leaderboard.length - 14} more players`, {
        fontSize: '11px', color: C.GOLD_DIM,
        stroke: C.MID_WOOD, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(11);
    }

    // Refresh button — wood-plank style
    this.addRefreshButton(tableTop + tableHeight + (this.leaderboard.length > 14 ? 26 : 10));
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  private addRefreshButton(y: number) {
    const hasWood = this.textures.exists('wood-button');
    const W = 150, H = 38;

    const imgObj = hasWood
      ? this.add.image(0, 0, 'wood-button').setDisplaySize(W, H).setTint(0xcc9966)
      : (() => {
          const g = this.add.graphics();
          g.fillStyle(0x8b4513, 0.95);
          g.fillRoundedRect(-W / 2, -H / 2, W, H, 10);
          g.lineStyle(2, 0xffaa00, 0.8);
          g.strokeRoundedRect(-W / 2, -H / 2, W, H, 10);
          return g;
        })();

    const lbl = this.add.text(0, 0, '🔄  REFRESH', {
      fontSize: '14px', color: C.MID_WOOD, fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);

    const btn = this.add.container(180, y + H / 2, [imgObj as any, lbl]);
    btn.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);

    btn.on('pointerover',  () => lbl.setColor(C.GOLD));
    btn.on('pointerout',   () => lbl.setColor(C.MID_WOOD));
    btn.on('pointerdown',  () => {
      lbl.setText('⏳  LOADING...');
      btn.disableInteractive();
      this.scene.restart({ username: this.username, uid: this.uid, userData: this.userData });
    });
  }

  // ─── Back button ─────────────────────────────────────────────────────────────

  private addBackButton() {
    const hasWood = this.textures.exists('wood-button');
    const W = 100, H = 34;

    const imgObj = hasWood
      ? this.add.image(0, 0, 'wood-button').setDisplaySize(W, H).setTint(0xcc9966)
      : (() => {
          const g = this.add.graphics();
          g.fillStyle(0x3d1a00, 0.95);
          g.fillRoundedRect(-W / 2, -H / 2, W, H, 9);
          g.lineStyle(1.5, 0xffaa00, 0.7);
          g.strokeRoundedRect(-W / 2, -H / 2, W, H, 9);
          return g;
        })();

    const lbl = this.add.text(0, 0, '← BACK', {
      fontSize: '13px', color: C.MID_WOOD, fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);

    const btn = this.add.container(62, 608, [imgObj as any, lbl]);
    btn.setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(20);

    btn.on('pointerover',  () => lbl.setColor(C.GOLD));
    btn.on('pointerout',   () => lbl.setColor(C.MID_WOOD));
    btn.on('pointerdown',  () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('CheckersStartScene', {
          username: this.username, uid: this.uid, userData: this.userData,
        });
      });
    });
  }

  // ─── States ──────────────────────────────────────────────────────────────────

  private showLoading(): Phaser.GameObjects.Text {
    return this.add.text(180, 340, '⏳  LOADING...', {
      fontSize: '20px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
  }

  private showEmptyState() {
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x3d1a00, 0.92);
    card.fillRoundedRect(40, 200, 280, 160, 16);
    card.lineStyle(2, 0xffaa00, 0.8);
    card.strokeRoundedRect(40, 200, 280, 160, 16);

    this.add.text(180, 252, '♟', { fontSize: '42px' }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 302, 'No players yet!', {
      fontSize: '18px', color: C.CREAM, fontStyle: 'bold',
      stroke: C.MID_WOOD, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 330, 'Play a game to be the first!', {
      fontSize: '13px', color: C.GOLD_DIM,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  private showError() {
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x3d1a00, 0.92);
    card.fillRoundedRect(40, 220, 280, 160, 16);
    card.lineStyle(2, 0xff4444, 0.8);
    card.strokeRoundedRect(40, 220, 280, 160, 16);

    this.add.text(180, 268, '❌', { fontSize: '42px' }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 316, 'Failed to load leaderboard', {
      fontSize: '16px', color: C.CREAM,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 345, 'Tap anywhere to retry', {
      fontSize: '13px', color: C.GOLD_DIM,
      stroke: C.MID_WOOD, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this.input.once('pointerdown', () => {
      this.scene.restart({ username: this.username, uid: this.uid, userData: this.userData });
    });
  }
}