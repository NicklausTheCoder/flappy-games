// src/scenes/flappy-bird/PrizeTournamentScene.ts
import Phaser from 'phaser';
import {
  checkAndCompleteExpiredPeriods,
  getCurrentTournamentStatus,
  getTournamentHistory,
  TournamentPeriod,
} from '../../firebase/flappyBirdTournament';

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

export class PrizeTournamentScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private tournamentStatus: any = null;
  private tournamentHistory: TournamentPeriod[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private poolText!:  Phaser.GameObjects.Text;
  private timerInterval!: any;
  private currentView: 'current' | 'history' = 'current';
  private cloudLayers: Array<Array<{ obj: Phaser.GameObjects.Graphics; speed: number }>> = [];

  constructor() {
    super({ key: 'PrizeTournamentScene' });
  }

  init(data: { username?: string; uid?: string }) {
    this.username    = data?.username || '';
    this.uid         = data?.uid     || '';
    this.cloudLayers = [];
  }

  async create() {
    this.addBackground();
    this.addTitle();

    const loadingText = this.add.text(180, 340, 'LOADING TOURNAMENT...', {
      fontSize: '20px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    try {
      await this.loadTournamentData();
    } catch {}

    loadingText.destroy();
    this.createTournamentDisplay();
    this.createButtons();
    this.startTimer();
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

    this.add.text(180, 36, '🏆  PRIZE TOURNAMENT', {
      fontSize: '24px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'EVERY 4 HOURS  ·  TOP PLAYER WINS', {
      fontSize: '10px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── Main tournament display ──────────────────────────────────────────────
  private createTournamentDisplay() {
    this.addTimerCard();
    this.addLeadersPanel();
  }

  // ── Timer / prize card ────────────────────────────────────────────────────
  private addTimerCard() {
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, 92, 332, 116, 14);
    p.lineStyle(2, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, 92, 332, 116, 14);

    // Time remaining label
    this.add.text(180, 104, 'TIME REMAINING', {
      fontSize: '9px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    // Big countdown
    const timeMs = this.tournamentStatus?.timeRemaining ?? 0;
    this.timerText = this.add.text(180, 122, this.formatTime(timeMs), {
      fontSize: '34px', color: C.YELLOW, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // Pulse tween on timer
    this.tweens.add({
      targets: this.timerText, alpha: 0.7,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Divider
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffffff, 0.25);
    div.lineBetween(20, 160, 340, 160);

    // Prize pool + players stat pair
    const potentialPrize = (Math.round((this.tournamentStatus?.totalPool ?? 0) * 0.4 * 100) / 100) + 1;

    this.add.text(95, 170, 'PRIZE POOL', {
      fontSize: '9px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this.poolText = this.add.text(95, 186, `$${potentialPrize.toFixed(2)}`, {
      fontSize: '18px', color: C.GREEN, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    const vline = this.add.graphics().setDepth(10);
    vline.lineStyle(1, 0xffffff, 0.25);
    vline.lineBetween(180, 165, 180, 202);

    this.add.text(265, 170, 'PLAYERS', {
      fontSize: '9px', color: C.MUTED,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(265, 186, `${this.tournamentStatus?.players ?? 0}`, {
      fontSize: '18px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
  }

  // ── Leaders panel ─────────────────────────────────────────────────────────
  private addLeadersPanel() {
    const panelY = 218, panelH = 190;
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, panelY, 332, panelH, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, panelY, 332, panelH, 14);

    this.add.text(180, panelY + 12, '🏅  CURRENT LEADERS', {
      fontSize: '13px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffffff, 0.25);
    div.lineBetween(20, panelY + 30, 340, panelY + 30);

    const topPlayers: any[] = this.tournamentStatus?.topPlayers ?? [];

    if (topPlayers.length === 0) {
      this.add.text(180, panelY + (panelH / 2) + 10, '🕊️  No games played yet', {
        fontSize: '14px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    } else {
      const medals: Record<number, string>  = { 0: '🥇', 1: '🥈', 2: '🥉' };
      const colors: Record<number, string>  = { 0: C.GOLD, 1: '#d0d0d0', 2: '#cd7f32' };

      topPlayers.slice(0, 5).forEach((player: any, i: number) => {
        const y = panelY + 44 + i * 30;

        // Alternating row tint
        if (i % 2 === 0) {
          const rb = this.add.graphics().setDepth(9);
          rb.fillStyle(0xffffff, 0.06);
          rb.fillRect(16, y - 8, 328, 28);
        }

        // Medal / rank
        const rankStr = medals[i] ?? `${i + 1}.`;
        this.add.text(38, y, rankStr, {
          fontSize: i < 3 ? '18px' : '14px',
          color: colors[i] ?? C.WHITE,
          stroke: C.NAVY, strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10);

        // Name
        let name = player.displayName || '—';
        if (name.length > 13) name = name.slice(0, 12) + '…';
        const isMe = name.toLowerCase().startsWith(this.username.toLowerCase().slice(0, 5));
        this.add.text(130, y, name, {
          fontSize: '13px', color: isMe ? C.YELLOW : C.WHITE,
          fontStyle: isMe ? 'bold' : 'normal',
          stroke: C.NAVY, strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10);

        // Score
        this.add.text(290, y, player.score.toString(), {
          fontSize: '15px', color: colors[i] ?? C.WHITE, fontStyle: 'bold',
          stroke: C.NAVY, strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10);
      });
    }
  }

  // ─── Buttons ─────────────────────────────────────────────────────────────
  private createButtons() {
    const hasBtn = this.textures.exists('blue-button');

    const makeBtn = (cx: number, cy: number, W: number, label: string, tint: number, cb: () => void) => {
      const H = 42;
      let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (hasBtn) {
        img = this.add.image(0, 0, 'blue-button').setDisplaySize(W, H);
        (img as Phaser.GameObjects.Image).setTint(tint);
      } else {
        const g = this.add.graphics();
        g.fillStyle(tint === 0xffe040 ? 0xffc200 : 0x1255aa, 0.92);
        g.fillRoundedRect(-W/2, -H/2, W, H, 10);
        g.lineStyle(2, 0xffffff, 0.75);
        g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
        img = g;
      }
      const isGold = tint === 0xffe040;
      const txtCol = isGold ? C.NAVY : C.WHITE;
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
      return { btn, lbl };
    };

    const rowY = 434;
    // Row 1 — History + Info
    makeBtn(95,  rowY, 155, '📜 HISTORY',   0xffffff, () => this.showHistory());
    makeBtn(265, rowY, 155, 'ℹ️  HOW IT WORKS', 0xffffff, () => this.showInfoPopup());

    const row2Y = 486;
    // Row 2 — Back + Refresh
    makeBtn(95,  row2Y, 155, '← BACK',      0xffffff, () => this.scene.start('FlappyBirdStartScene', { username: this.username, uid: this.uid }));
    const { lbl: refreshLbl, btn: refreshBtn } = makeBtn(265, row2Y, 155, '🔄 REFRESH', 0xffe040, async () => {
      refreshLbl.setText('⏳ LOADING...');
      refreshBtn.disableInteractive();
      await this.loadTournamentData();
      this.rebuildCurrentView();
      refreshLbl.setText('🔄 REFRESH');
      refreshBtn.setInteractive({ useHandCursor: true });
    });

    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  // ─── History view ─────────────────────────────────────────────────────────
  private showHistory() {
    this.children.removeAll(true);
    this.cloudLayers = [];
    this.addBackground();
    this.addTitle();

    // Panel
    const panelY = 94, panelH = 456;
    const p = this.add.graphics().setDepth(9);
    p.fillStyle(C.PANEL_FILL, C.PANEL_ALPHA);
    p.fillRoundedRect(14, panelY, 332, panelH, 14);
    p.lineStyle(1.5, C.PANEL_STROKE, C.PANEL_STROKE_A);
    p.strokeRoundedRect(14, panelY, 332, panelH, 14);

    this.add.text(180, panelY + 14, '📜  PAST TOURNAMENTS', {
      fontSize: '14px', color: C.WHITE, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    const hdiv = this.add.graphics().setDepth(10);
    hdiv.lineStyle(1, 0xffffff, 0.25);
    hdiv.lineBetween(20, panelY + 34, 340, panelY + 34);

    if (this.tournamentHistory.length === 0) {
      this.add.text(180, panelY + 140, '📊', { fontSize: '44px' }).setOrigin(0.5).setDepth(10);
      this.add.text(180, panelY + 196, 'No tournaments yet', {
        fontSize: '16px', color: C.WHITE, fontStyle: 'bold',
        stroke: C.NAVY, strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10);
      this.add.text(180, panelY + 220, 'Check back after 4 hours!', {
        fontSize: '12px', color: C.MUTED,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    } else {
      let yPos = panelY + 44;
      const maxCards = 4;

      this.tournamentHistory.slice(0, maxCards).forEach((t, i) => {
        // Card
        const cardH = 90;
        const card = this.add.graphics().setDepth(10);
        card.fillStyle(0xffffff, i % 2 === 0 ? 0.06 : 0.03);
        card.fillRoundedRect(20, yPos, 320, cardH, 8);
        if (t.winner) {
          card.lineStyle(1, 0xffd700, 0.5);
          card.strokeRoundedRect(20, yPos, 320, cardH, 8);
        }

        // Date
        const date = new Date(t.endTime);
        const dateStr = isNaN(date.getTime()) ? '—'
          : `${date.getDate()}/${date.getMonth() + 1}  ${date.getHours().toString().padStart(2,'0')}:00`;
        this.add.text(32, yPos + 8, dateStr, {
          fontSize: '10px', color: C.MUTED,
          stroke: C.NAVY, strokeThickness: 2,
        }).setDepth(11);

        if (t.winner) {
          // Trophy + winner
          this.add.text(32, yPos + 26, '🏆 ' + (t.winner.displayName || '—'), {
            fontSize: '15px', color: C.GOLD, fontStyle: 'bold',
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);

          this.add.text(32, yPos + 50, `Score: ${t.winner.score}`, {
            fontSize: '12px', color: C.WHITE,
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);

          this.add.text(200, yPos + 50, `Prize: $${t.winner.prize}`, {
            fontSize: '14px', color: C.GREEN, fontStyle: 'bold',
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);

          const playerCount = t.players ? Object.keys(t.players).length : 0;
          this.add.text(286, yPos + 8, `${playerCount} players`, {
            fontSize: '10px', color: C.MUTED,
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);

          this.add.text(286, yPos + 22, `$${t.totalPool} pool`, {
            fontSize: '10px', color: C.MUTED,
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);
        } else {
          this.add.text(32, yPos + 40, 'No players this period', {
            fontSize: '13px', color: C.MUTED, fontStyle: 'italic',
            stroke: C.NAVY, strokeThickness: 2,
          }).setDepth(11);
        }

        yPos += cardH + 8;
      });

      if (this.tournamentHistory.length > maxCards) {
        this.add.text(180, yPos + 6, `+ ${this.tournamentHistory.length - maxCards} more periods`, {
          fontSize: '11px', color: C.MUTED,
          stroke: C.NAVY, strokeThickness: 2,
        }).setOrigin(0.5).setDepth(10);
      }
    }

    // Back to current + back to menu buttons
    this.addHistoryButtons();

    this.add.text(180, 624, 'wintapgames.com  ·  v1.0.0', {
      fontSize: '9px', color: C.WHITE,
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
  }

  private addHistoryButtons() {
    const hasBtn = this.textures.exists('blue-button');
    const makeBtn = (cx: number, cy: number, W: number, label: string, cb: () => void) => {
      const H = 42;
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
        fontSize: '13px', color: C.WHITE, fontStyle: 'bold',
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

    makeBtn(95,  594, 155, '← BACK',          () => this.scene.start('FlappyBirdStartScene', { username: this.username, uid: this.uid }));
    makeBtn(265, 594, 165, '👁️ CURRENT',       () => { this.currentView = 'current'; this.rebuildCurrentView(); });
  }

  // ─── Info popup ───────────────────────────────────────────────────────────
  private showInfoPopup() {
    const overlay = this.add.graphics().setDepth(48);
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, 360, 640);

    const popup = this.add.graphics().setDepth(49);
    popup.fillStyle(0x000000, 0.92);
    popup.fillRoundedRect(30, 148, 300, 278, 16);
    popup.lineStyle(2, 0xffd700, 1);
    popup.strokeRoundedRect(30, 148, 300, 278, 16);

    const parts: Phaser.GameObjects.GameObject[] = [overlay, popup];

    parts.push(this.add.text(180, 174, '🏆  HOW IT WORKS', {
      fontSize: '17px', color: C.GOLD, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50));

    const rules = [
      { icon: '🔄', text: 'Tournament resets every 4 hours' },
      { icon: '💰', text: 'Every game adds to the prize pool' },
      { icon: '🏆', text: 'Highest score at period end wins' },
      { icon: '💳', text: 'Prize credited to wallet instantly' },
    ];

    let ry = 206;
    rules.forEach(r => {
      parts.push(this.add.text(52, ry, r.icon, { fontSize: '16px' }).setDepth(50));
      parts.push(this.add.text(78, ry, r.text, {
        fontSize: '12px', color: C.WHITE,
        stroke: C.NAVY, strokeThickness: 2,
      }).setDepth(50));
      ry += 26;
    });

    // Periods grid
    ry += 6;
    parts.push(this.add.text(180, ry, '⏰  DAILY PERIODS', {
      fontSize: '11px', color: C.MUTED, fontStyle: 'bold',
      stroke: C.NAVY, strokeThickness: 2,
    }).setOrigin(0.5).setDepth(50));
    ry += 18;

    const periods = ['00:00–04:00', '04:00–08:00', '08:00–12:00', '12:00–16:00', '16:00–20:00', '20:00–00:00'];
    periods.forEach((period, pi) => {
      const col = pi % 2 === 0 ? 75 : 225;
      if (pi % 2 === 0 && pi > 0) ry += 18;
      parts.push(this.add.text(col, ry, period, {
        fontSize: '11px', color: C.WHITE,
        stroke: C.NAVY, strokeThickness: 2,
      }).setOrigin(0.5).setDepth(50));
    });
    ry += 24;

    // Close button
    const hasBtn = this.textures.exists('blue-button');
    const W = 120, H = 38;
    let btnImg: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (hasBtn) {
      btnImg = this.add.image(0, 0, 'blue-button').setDisplaySize(W, H);
      (btnImg as Phaser.GameObjects.Image).setTint(0xffe040);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0xffc200, 0.95); g.fillRoundedRect(-W/2, -H/2, W, H, 10);
      g.lineStyle(2, 0xffffff, 0.8); g.strokeRoundedRect(-W/2, -H/2, W, H, 10);
      btnImg = g;
    }
    const btnLbl = this.add.text(0, 0, 'GOT IT', {
      fontSize: '14px', color: C.NAVY, fontStyle: 'bold',
    }).setOrigin(0.5);
    const closeBtn = this.add.container(180, ry + 4, [btnImg as any, btnLbl])
      .setSize(W, H).setInteractive({ useHandCursor: true }).setDepth(51);
    parts.push(closeBtn);

    const destroy = () => parts.forEach(p => { try { p.destroy(); } catch {} });
    closeBtn.on('pointerdown', () =>
      this.tweens.add({ targets: closeBtn, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: destroy })
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private rebuildCurrentView() {
    this.children.removeAll(true);
    this.cloudLayers = [];
    this.addBackground();
    this.addTitle();
    this.createTournamentDisplay();
    this.createButtons();
  }

  private async loadTournamentData() {
    await checkAndCompleteExpiredPeriods();
    this.tournamentStatus   = await getCurrentTournamentStatus();
    this.tournamentHistory  = await getTournamentHistory(5);
  }

  private formatTime(ms: number): string {
    if (!ms || ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':');
  }

  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(async () => {
      if (!this.scene.isActive() || !this.timerText?.active) {
        this.shutdown(); return;
      }

      if (this.tournamentStatus.timeRemaining > 0) {
        this.tournamentStatus.timeRemaining -= 1000;
        this.timerText.setText(this.formatTime(this.tournamentStatus.timeRemaining));

        if (this.tournamentStatus.timeRemaining % 60_000 === 0) {
          await this.loadTournamentData();
          if (this.poolText?.active) {
            const pp = (Math.round(this.tournamentStatus.totalPool * 0.4 * 100) / 100) + 1;
            this.poolText.setText(`$${pp.toFixed(2)}`);
          }
        }
      } else {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        await checkAndCompleteExpiredPeriods();
        await this.loadTournamentData();
        this.rebuildCurrentView();
        this.startTimer();
      }
    }, 1000);
  }

  shutdown() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}