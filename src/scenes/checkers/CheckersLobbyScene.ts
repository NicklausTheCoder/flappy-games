// src/scenes/checkers/CheckersLobbyScene.ts
import Phaser from 'phaser';
import { checkersMultiplayer, CheckersLobby } from '../../firebase/checkersMultiplayer';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

export class CheckersLobbyScene extends Phaser.Scene {
  private username:     string = '';
  private uid:          string = '';
  private lobbyId:      string = '';
  private lobby:        CheckersLobby | null = null;
  private unsubscribe:  (() => void) | null = null;
  private isPlayerReady: boolean = false;
  private gameStarted:  boolean = false;
  private hasRefunded:  boolean = false;

  // ── Countdown ──────────────────────────────────────────────────────────────
  private countdownStartedAt: number = 0;
  private countdownTimer:     Phaser.Time.TimerEvent | null = null;
  private readonly COUNTDOWN_DURATION = 3000;

  // ── Animated background ────────────────────────────────────────────────────
  private starLayers:   Array<Array<{ obj: Phaser.GameObjects.Arc;       speed: number }>> = [];
  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number; rotSpeed: number }> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  // ── UI refs ────────────────────────────────────────────────────────────────
  private statusText!:    Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private vsPulse!:       Phaser.GameObjects.Text;

  // Player card graphics
  private p1CardGfx!:  Phaser.GameObjects.Graphics;
  private p2CardGfx!:  Phaser.GameObjects.Graphics;
  private p1PieceGfx!: Phaser.GameObjects.Graphics;
  private p2PieceGfx!: Phaser.GameObjects.Graphics;

  // Player text refs
  private p1NameText!:  Phaser.GameObjects.Text;
  private p1ReadyText!: Phaser.GameObjects.Text;
  private p2NameText!:  Phaser.GameObjects.Text;
  private p2ReadyText!: Phaser.GameObjects.Text;

  // Ready button
  private readyContainer!: Phaser.GameObjects.Container;
  private readyLabel!:     Phaser.GameObjects.Text;
  private readyImg!:       Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'CheckersLobbyScene' }); }

  // ─── init ──────────────────────────────────────────────────────────────────
  init(data: { username: string; uid: string; lobbyId: string }) {
    this.username           = data.username;
    this.uid                = data.uid;
    this.lobbyId            = data.lobbyId;
    this.isPlayerReady      = false;
    this.hasRefunded        = false;
    this.gameStarted        = false;
    this.countdownStartedAt = 0;
    this.lobby              = null;
    this.boardSquares       = [];
    this.starLayers         = [];
  }

  // ─── create ────────────────────────────────────────────────────────────────
  async create() {
    this.addBackground();
    this.buildStaticUI();

    this.unsubscribe = checkersMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      this.onLobbyUpdate(lobby);
    });

    const existing = await checkersMultiplayer.getLobby(this.lobbyId);
    if (!existing) {
      this.statusText.setText('Loading lobby...');
      this.time.delayedCall(10_000, () => {
        if (!this.lobby && !this.gameStarted) {
          this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
        }
      });
    }
  }

  // ─── update ────────────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    const dt = delta / 1000;

    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    this.boardSquares.forEach(s => {
      s.obj.y    -= s.drift    * dt;
      s.obj.angle += s.rotSpeed * dt;
      if (s.obj.y < -30) { s.obj.y = 670; s.obj.x = Phaser.Math.Between(0, 360); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND
  // ═══════════════════════════════════════════════════════════════════════════
  private addBackground() {
    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-10);
      const dim = this.add.graphics().setDepth(-9);
      dim.fillStyle(0x000000, 0.72);
      dim.fillRect(0, 0, 360, 640);
    } else {
      this.cameras.main.setBackgroundColor('#0a0500');
      this.drawFallbackBg();
    }

    this.createStarField();
    this.createFloatingSquares();
    this.scheduleShootingStars();
  }

  private drawFallbackBg() {
    const g = this.add.graphics().setDepth(-8);
    // Deep warm gradient using rectangles
    const bands = [
      { y: 0,   h: 160, c: 0x0a0500 },
      { y: 160, h: 160, c: 0x0d0700 },
      { y: 320, h: 160, c: 0x100900 },
      { y: 480, h: 160, c: 0x0d0700 },
    ];
    bands.forEach(b => { g.fillStyle(b.c, 1); g.fillRect(0, b.y, 360, b.h); });

    // Subtle grid
    const grid = this.add.graphics().setDepth(-7);
    grid.lineStyle(1, 0x8b4513, 0.06);
    for (let x = 0; x <= 360; x += 36) { grid.lineBetween(x, 0, x, 640); }
    for (let y = 0; y <= 640; y += 36) { grid.lineBetween(0, y, 360, y); }
  }

  private createStarField() {
    const defs = [
      { count: 70, r: 1,   sMin: 12, sMax: 20, aMin: 0.10, aMax: 0.28, col: 0xcc9966 },
      { count: 35, r: 1.3, sMin: 26, sMax: 44, aMin: 0.28, aMax: 0.55, col: 0xddbb88 },
      { count: 15, r: 1.8, sMin: 55, sMax: 80, aMin: 0.55, aMax: 0.90, col: 0xffd080 },
    ];
    this.starLayers = [];
    defs.forEach((d, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < d.count; i++) {
        const a   = Phaser.Math.FloatBetween(d.aMin, d.aMax);
        const obj = this.add.circle(
          Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
          d.r, d.col, a
        ).setDepth(-6 + li);
        // Twinkle the brightest layer
        if (li === 2) {
          this.tweens.add({
            targets: obj, alpha: a * 0.3,
            duration: Phaser.Math.Between(500, 1400),
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            delay: Phaser.Math.Between(0, 1200),
          });
        }
        layer.push({ obj, speed: Phaser.Math.FloatBetween(d.sMin, d.sMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private createFloatingSquares() {
    for (let i = 0; i < 18; i++) {
      const size     = Phaser.Math.Between(8, 28);
      const isDark   = i % 2 === 0;
      const alpha    = Phaser.Math.FloatBetween(0.03, 0.12);
      const obj      = this.add.rectangle(
        Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
        size, size,
        isDark ? 0x8b4513 : 0xdeb887, alpha
      ).setDepth(-3).setAngle(45);
      this.boardSquares.push({
        obj,
        drift:    Phaser.Math.FloatBetween(5, 18),
        rotSpeed: Phaser.Math.FloatBetween(8, 30) * (Math.random() > 0.5 ? 1 : -1),
      });
    }
  }

  private scheduleShootingStars() {
    const next = () => {
      this.shootingStarTimer = this.time.delayedCall(
        Phaser.Math.Between(5000, 11000),
        () => { this.spawnShootingStar(); next(); }
      );
    };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(50, 110);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 50));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 320), sy = Phaser.Math.Between(20, 200);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(400, 800);
    const t = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        prog = Math.min(prog + 16 / dur, 1);
        g.clear();
        g.lineStyle(1, 0xcc9966, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
        g.lineStyle(1, 0xffcc88, 0.55); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        g.lineStyle(2, 0xffd080, 0.95); g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        if (prog >= 1) { t.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC UI
  // ═══════════════════════════════════════════════════════════════════════════
  private buildStaticUI() {
    this.buildTitleBar();
    this.buildPlayerCards();
    this.buildVsBadge();
    this.buildStatusBar();
    this.buildHintStrip();
    this.buildReadyButton();
    this.buildCountdownText();
    this.buildLeaveButton();
  }

  // ─── Title ─────────────────────────────────────────────────────────────────
  private buildTitleBar() {
    // Outer glow card
    const bg = this.add.graphics().setDepth(9);
    bg.fillStyle(0x1a0900, 0.97);
    bg.fillRoundedRect(16, 12, 328, 58, 14);
    bg.lineStyle(2, 0xffaa00, 0.9);
    bg.strokeRoundedRect(16, 12, 328, 58, 14);
    bg.lineStyle(1, 0xffcc66, 0.2);
    bg.strokeRoundedRect(22, 18, 316, 46, 10);

    // Amber inner glow strip at top
    const glow = this.add.graphics().setDepth(9);
    glow.fillStyle(0xffaa00, 0.08);
    glow.fillRoundedRect(16, 12, 328, 22, { tl: 14, tr: 14, bl: 0, br: 0 });

    this.add.text(180, 28, '♟  CHECKERS', {
      fontSize: '22px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 53, 'MULTIPLAYER  LOBBY', {
      fontSize: '9px', color: '#cc7722', letterSpacing: 5,
    }).setOrigin(0.5).setDepth(10);

    // Room code pill
    const pill = this.add.graphics().setDepth(10);
    pill.fillStyle(0x000000, 0.45);
    pill.fillRoundedRect(90, 78, 180, 20, 10);
    pill.lineStyle(1, 0xffaa00, 0.25);
    pill.strokeRoundedRect(90, 78, 180, 20, 10);
    this.add.text(180, 88, `Room: ${this.lobbyId.substring(0, 12)}`, {
      fontSize: '9px', color: '#886633',
    }).setOrigin(0.5).setDepth(11);
  }

  // ─── Player cards ──────────────────────────────────────────────────────────
  private buildPlayerCards() {
    const cW = 148, cH = 178, cR = 14;

    // ── P1 (left — always me) ──
    this.p1CardGfx = this.add.graphics().setDepth(10);
    this.drawCard(this.p1CardGfx, 14, 106, cW, cH, cR, 0x1a0800, 0xffaa00, false);

    const g1 = this.add.graphics().setDepth(11);
    g1.fillStyle(0xffaa00, 0.12);
    g1.fillRoundedRect(14, 106, cW, 28, { tl: cR, tr: cR, bl: 0, br: 0 });

    // Red piece graphic
    this.p1PieceGfx = this.add.graphics().setDepth(12);
    this.drawCheckerPiece(this.p1PieceGfx, 88, 163, 'red');

    this.add.text(88, 144, 'YOU', {
      fontSize: '9px', color: '#ffaa00', fontStyle: 'bold', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(12);

    this.p1NameText = this.add.text(88, 198, this.username, {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: 130 },
    }).setOrigin(0.5).setDepth(12);

    this.p1ReadyText = this.add.text(88, 218, '⏳ Not Ready', {
      fontSize: '10px', color: '#ff6666',
    }).setOrigin(0.5).setDepth(12);

    this.add.text(88, 238, '🔴 Red Pieces', {
      fontSize: '9px', color: '#cc6644',
    }).setOrigin(0.5).setDepth(12);

    // ── P2 (right — opponent) ──
    this.p2CardGfx = this.add.graphics().setDepth(10);
    this.drawCard(this.p2CardGfx, 198, 106, cW, cH, cR, 0x0d0d0d, 0x666666, false);

    const g2 = this.add.graphics().setDepth(11);
    g2.fillStyle(0x888888, 0.08);
    g2.fillRoundedRect(198, 106, cW, 28, { tl: cR, tr: cR, bl: 0, br: 0 });

    this.p2PieceGfx = this.add.graphics().setDepth(12);
    this.drawCheckerPiece(this.p2PieceGfx, 272, 163, 'unknown');

    this.add.text(272, 144, 'OPPONENT', {
      fontSize: '9px', color: '#888888', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0.5).setDepth(12);

    this.p2NameText = this.add.text(272, 198, 'Waiting...', {
      fontSize: '12px', color: '#666666',
      wordWrap: { width: 130 },
    }).setOrigin(0.5).setDepth(12);

    this.p2ReadyText = this.add.text(272, 218, '⏳ Not Joined', {
      fontSize: '10px', color: '#555555',
    }).setOrigin(0.5).setDepth(12);

    this.add.text(272, 238, '⚫ Black Pieces', {
      fontSize: '9px', color: '#888888',
    }).setOrigin(0.5).setDepth(12);
  }

  private drawCard(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number, r: number,
    fill: number, stroke: number, glowing: boolean
  ) {
    g.clear();
    g.fillStyle(fill, 0.95);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(glowing ? 2.5 : 1.5, stroke, glowing ? 1.0 : 0.65);
    g.strokeRoundedRect(x, y, w, h, r);
    if (glowing) {
      g.lineStyle(1, stroke, 0.2);
      g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, r - 2);
    }
  }

  private drawCheckerPiece(
    gfx: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    type: 'red' | 'black' | 'unknown' | 'red-ready' | 'black-ready'
  ) {
    gfx.clear();
    if (type === 'unknown') {
      gfx.lineStyle(2, 0x444444, 0.55);
      for (let i = 0; i < 12; i++) {
        const a1 = (i / 12) * Math.PI * 2;
        const a2 = ((i + 0.6) / 12) * Math.PI * 2;
        gfx.beginPath();
        gfx.arc(cx, cy, 22, a1, a2, false);
        gfx.strokePath();
      }
      return;
    }

    const isRed   = type === 'red'   || type === 'red-ready';
    const isReady = type === 'red-ready' || type === 'black-ready';

    if (isReady) {
      gfx.lineStyle(3, 0x44ff88, 0.7);
      gfx.strokeCircle(cx, cy, 28);
      gfx.lineStyle(1, 0x44ff88, 0.25);
      gfx.strokeCircle(cx, cy, 33);
    }

    const rim   = isRed ? 0x4a0000 : 0x111111;
    const body  = isRed ? 0xcc2200 : 0x1a1a1a;
    const mid   = isRed ? 0xe03300 : 0x333333;
    const inner = isRed ? 0xff4422 : 0x555555;

    gfx.fillStyle(rim,   1); gfx.fillCircle(cx, cy, 24);
    gfx.fillStyle(body,  1); gfx.fillCircle(cx, cy, 20);
    gfx.fillStyle(mid,   1); gfx.fillCircle(cx, cy, 14);
    gfx.fillStyle(inner, 1); gfx.fillCircle(cx, cy, 8);
    // Shine
    gfx.fillStyle(0xffffff, 0.28); gfx.fillCircle(cx - 6, cy - 6, 5);
    gfx.fillStyle(0xffffff, 0.10); gfx.fillCircle(cx + 5, cy + 5, 3);
  }

  // ─── VS badge ──────────────────────────────────────────────────────────────
  private buildVsBadge() {
    // Hexagonal VS badge
    const bg = this.add.graphics().setDepth(14);
    bg.fillStyle(0x1a0900, 1);
    bg.fillCircle(180, 196, 22);
    bg.lineStyle(2, 0xffaa00, 0.9);
    bg.strokeCircle(180, 196, 22);
    bg.lineStyle(1, 0xffcc66, 0.3);
    bg.strokeCircle(180, 196, 18);

    this.vsPulse = this.add.text(180, 196, 'VS', {
      fontSize: '16px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15);

    this.tweens.add({
      targets: this.vsPulse,
      scaleX: 1.15, scaleY: 1.15,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ─── Status bar ────────────────────────────────────────────────────────────
  private buildStatusBar() {
    const bg = this.add.graphics().setDepth(10);
    bg.fillStyle(0x1a0900, 0.88);
    bg.fillRoundedRect(14, 292, 332, 34, 10);
    bg.lineStyle(1, 0xffaa00, 0.35);
    bg.strokeRoundedRect(14, 292, 332, 34, 10);

    this.statusText = this.add.text(180, 309, 'Waiting for opponent to join...', {
      fontSize: '11px', color: '#ffaa00',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);
  }

  // ─── Hint strip ────────────────────────────────────────────────────────────
  private buildHintStrip() {
    const bg = this.add.graphics().setDepth(10);
    bg.fillStyle(0x000000, 0.38);
    bg.fillRoundedRect(14, 334, 332, 48, 10);
    bg.lineStyle(1, 0xffaa00, 0.12);
    bg.strokeRoundedRect(14, 334, 332, 48, 10);

    this.add.text(180, 346, 'HOW TO PLAY', {
      fontSize: '8px', color: '#ffaa00', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 362, 'Flying kings slide diagonally  ·  Capture all enemy pieces to win', {
      fontSize: '8px', color: '#665533', wordWrap: { width: 300 },
    }).setOrigin(0.5).setDepth(11);
  }

  // ─── Ready button ──────────────────────────────────────────────────────────
  private buildReadyButton() {
    const hasBtn = this.textures.exists('wood-button');

    if (hasBtn) {
      this.readyImg = this.add.image(0, 0, 'wood-button').setDisplaySize(240, 52);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x2a1000, 0.95);
      g.fillRoundedRect(-120, -26, 240, 52, 14);
      g.lineStyle(2, 0x664400, 0.7);
      g.strokeRoundedRect(-120, -26, 240, 52, 14);
      this.readyImg = g;
    }

    this.readyLabel = this.add.text(0, 0, '🔒  WAITING FOR OPPONENT', {
      fontSize: '13px', color: '#555555', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);

    this.readyContainer = this.add.container(180, 422, [this.readyImg as any, this.readyLabel]);
    this.readyContainer.setSize(240, 52).setDepth(20);
  }

  // ─── Countdown ─────────────────────────────────────────────────────────────
  private buildCountdownText() {
    this.countdownText = this.add.text(180, 490, '', {
      fontSize: '80px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(22).setVisible(false);
  }

  // ─── Leave button ──────────────────────────────────────────────────────────
  private buildLeaveButton() {
    const hasBtn = this.textures.exists('wood-button');
    let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

    if (hasBtn) {
      img = this.add.image(0, 0, 'wood-button').setDisplaySize(150, 42);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x5a1500, 0.9);
      g.fillRoundedRect(-75, -21, 150, 42, 10);
      g.lineStyle(2, 0xcc4422, 0.7);
      g.strokeRoundedRect(-75, -21, 150, 42, 10);
      img = g;
    }

    const lbl = this.add.text(0, 0, '← LEAVE', {
      fontSize: '13px', color: '#ff6644', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);

    const c = this.add.container(75, 598, [img as any, lbl]);
    c.setSize(150, 42).setInteractive({ useHandCursor: true }).setDepth(20);

    c.on('pointerover',  () => { lbl.setColor('#ffaa00'); this.tweens.add({ targets: c, scaleX: 1.06, scaleY: 1.06, duration: 80 }); });
    c.on('pointerout',   () => { lbl.setColor('#ff6644'); this.tweens.add({ targets: c, scaleX: 1,    scaleY: 1,    duration: 80 }); });
    c.on('pointerdown',  () => {
      this.tweens.add({ targets: c, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true,
        onComplete: () => this.leaveLobby(),
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READY BUTTON STATES
  // ═══════════════════════════════════════════════════════════════════════════
  private setReadyButtonLocked() {
    const hasBtn = this.textures.exists('wood-button');
    if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).setTint(0x664422);
    this.readyLabel.setText('🔒  WAITING FOR OPPONENT').setColor('#555555');
    this.readyContainer.disableInteractive();
    this.readyContainer.removeAllListeners();
    this.tweens.killTweensOf(this.readyContainer);
    this.readyContainer.setScale(1);
  }

  private setReadyButtonActive() {
    const hasBtn = this.textures.exists('wood-button');
    if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).clearTint();
    this.readyLabel.setText('✅  TAP TO READY UP').setColor('#1a0900');
    this.readyContainer.setInteractive({ useHandCursor: true });
    this.readyContainer.removeAllListeners();

    this.readyContainer.on('pointerover', () => {
      this.readyLabel.setColor('#ffaa00');
      this.tweens.add({ targets: this.readyContainer, scaleX: 1.06, scaleY: 1.06, duration: 80 });
    });
    this.readyContainer.on('pointerout', () => {
      this.readyLabel.setColor('#1a0900');
      this.tweens.add({ targets: this.readyContainer, scaleX: 1, scaleY: 1, duration: 80 });
    });
    this.readyContainer.on('pointerdown', () => {
      this.tweens.add({
        targets: this.readyContainer, scaleX: 0.94, scaleY: 0.94,
        duration: 60, yoyo: true, onComplete: () => this.setReady(),
      });
    });

    // Pulse to draw attention
    this.tweens.killTweensOf(this.readyContainer);
    this.tweens.add({
      targets: this.readyContainer, scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private setReadyButtonWaiting() {
    const hasBtn = this.textures.exists('wood-button');
    if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).setTint(0x886644);
    this.readyLabel.setText('✅  READY! Waiting...').setColor('#44ff88');
    this.readyContainer.disableInteractive();
    this.readyContainer.removeAllListeners();
    this.tweens.killTweensOf(this.readyContainer);
    this.readyContainer.setScale(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY STATE MACHINE
  // ═══════════════════════════════════════════════════════════════════════════
  private onLobbyUpdate(lobby: CheckersLobby | null) {
    if (!this.scene?.isActive()) return;

    if (!lobby) {
      if (!this.gameStarted) this.statusText.setText('Loading lobby...');
      return;
    }

    // ── Status-driven transitions ──
    if (lobby.status === 'playing' && !this.gameStarted) {
      this.lobby = lobby;
      this.startGame();
      return;
    }

    if (lobby.status === 'dead') {
      if (!this.gameStarted && !this.hasRefunded) this.handleOpponentLeft();
      return;
    }

    this.lobby = lobby;

    const players   = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);

    // ── My card ──
    const me = lobby.players[this.uid];
    if (me) {
      this.p1NameText.setText(me.displayName || this.username);
      this.p1ReadyText.setText(me.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.p1ReadyText.setColor(me.isReady ? '#44ff88' : '#ff6666');
      this.drawCard(this.p1CardGfx, 14, 106, 148, 178, 14, 0x1a0800, me.isReady ? 0x44ff88 : 0xffaa00, me.isReady);
      this.drawCheckerPiece(this.p1PieceGfx, 88, 163, me.isReady ? 'red-ready' : 'red');
    }

    if (players.length < 2) {
      // No opponent yet
      this.p2NameText.setText('Waiting...').setColor('#555555');
      this.p2ReadyText.setText('⏳ Not Joined').setColor('#555555');
      this.drawCard(this.p2CardGfx, 198, 106, 148, 178, 14, 0x0d0d0d, 0x444444, false);
      this.drawCheckerPiece(this.p2PieceGfx, 272, 163, 'unknown');
      this.statusText.setText('Waiting for opponent to join...');
      this.setReadyButtonLocked();
      return;
    }

    // ── Opponent card ──
    const myIdx  = playerIds.indexOf(this.uid);
    const oppIdx = myIdx === 0 ? 1 : 0;
    const opp    = players[oppIdx];

    this.p2NameText.setText(opp.displayName).setColor('#ffffff');
    this.p2ReadyText.setText(opp.isReady ? '✅ Ready!' : '⏳ Not Ready');
    this.p2ReadyText.setColor(opp.isReady ? '#44ff88' : '#ff6666');
    this.drawCard(this.p2CardGfx, 198, 106, 148, 178, 14, 0x0d0d0d, opp.isReady ? 0x44ff88 : 0x888888, opp.isReady);
    this.drawCheckerPiece(this.p2PieceGfx, 272, 163, opp.isReady ? 'black-ready' : 'black');

    const bothReady = players.every(p => p.isReady);

    if (!bothReady) {
      this.statusText.setText('Waiting for both players to ready up...');
      this.stopCountdown();
      if (!this.isPlayerReady) this.setReadyButtonActive();
      else                      this.setReadyButtonWaiting();
      return;
    }

    // ── Both ready ──
    this.statusText.setText('✅ Both players ready!');
    this.setReadyButtonWaiting();

    const isHost = lobby.playerIds[0] === this.uid;
    if (isHost && lobby.status === 'waiting' && !(lobby as any).countdownStartedAt) {
      checkersMultiplayer.markLobbyReady(this.lobbyId);
    }

    const ts = (lobby as any).countdownStartedAt as number | undefined;
    if (ts) this.startCountdownFromTimestamp(ts);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNTDOWN  — timestamp-driven like Ball Crush
  // ═══════════════════════════════════════════════════════════════════════════
  private startCountdownFromTimestamp(ts: number) {
    // Don't restart if same countdown already running
    if (this.countdownStartedAt === ts && this.countdownTimer) return;

    this.stopCountdown();
    this.countdownStartedAt = ts;

    const remaining = this.COUNTDOWN_DURATION - (Date.now() - ts);
    if (remaining <= 0) return;

    this.countdownText.setVisible(true);
    this.readyContainer.setVisible(false);

    this.countdownTimer = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        const left = this.COUNTDOWN_DURATION - (Date.now() - ts);

        if (left <= 0) {
          this.countdownText.setText('GO!');
          this.cameras.main.flash(180, 255, 170, 0, 0.25);
          this.stopCountdown();

          if (this.lobby && !this.gameStarted) {
            const isHost = this.lobby.playerIds[0] === this.uid;
            if (isHost) checkersMultiplayer.startGame(this.lobbyId);
          }
          return;
        }

        const secs = Math.ceil(left / 1000);
        this.countdownText.setText(`${secs}`);

        // Punch scale on each new number
        this.tweens.add({
          targets: this.countdownText,
          scaleX: 1.5, scaleY: 1.5,
          duration: 150, yoyo: true, ease: 'Back.easeOut',
        });

        // Flash cards on each tick
        this.tweens.add({
          targets: [this.p1CardGfx, this.p2CardGfx],
          alpha: 0.55, duration: 120, yoyo: true,
        });

        // Camera flash on even seconds
        if (secs % 2 === 0) {
          this.cameras.main.flash(150, 255, 150, 0, 0.15);
        }
      },
    });
  }

  private stopCountdown() {
    if (this.countdownTimer) { this.countdownTimer.destroy(); this.countdownTimer = null; }
    if (this.countdownText)  { this.countdownText.setVisible(false).setText(''); }
    if (this.readyContainer) { this.readyContainer.setVisible(true); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  private async setReady() {
    if (!this.lobby || this.isPlayerReady) return;
    this.isPlayerReady = true;
    this.setReadyButtonWaiting();

    // Card bounce
    this.tweens.add({
      targets: this.p1CardGfx, scaleX: 1.05, scaleY: 1.05,
      duration: 180, yoyo: true, ease: 'Sine.easeOut',
    });

    // Gold particle burst from card
    this.spawnReadyBurst(88, 163);

    await checkersMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);
  }

  private spawnReadyBurst(cx: number, cy: number) {
    for (let i = 0; i < 8; i++) {
      const angle  = (i / 8) * Math.PI * 2;
      const dist   = Phaser.Math.Between(30, 60);
      const tx     = cx + Math.cos(angle) * dist;
      const ty     = cy + Math.sin(angle) * dist;
      const dot    = this.add.circle(cx, cy, Phaser.Math.Between(2, 4), 0x44ff88, 1).setDepth(18);
      this.tweens.add({
        targets: dot, x: tx, y: ty, alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: Phaser.Math.Between(350, 600), ease: 'Power2',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.stopCountdown();

    // Flash → fade → scene
    this.cameras.main.flash(300, 255, 170, 0);
    this.cameras.main.once('cameraflashcomplete', () => {
      if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const myPlayer    = this.lobby?.players[this.uid];
        const playerColor = myPlayer?.color || 'red';
        this.scene.start('CheckersMultiplayerGameScene', {
          username: this.username, uid: this.uid,
          lobbyId: this.lobbyId, lobby: this.lobby,
          playerColor,
        });
      });
    });
  }

  private async handleOpponentLeft() {
    if (this.hasRefunded) return;
    this.hasRefunded = true;

    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);

    this.showRefundPopup();

    await updateCheckersWalletBalance(this.uid, 1.00, 'refund', 'Opponent left lobby - refund');
  }

  private showRefundPopup() {
    // Dim overlay
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.78);
    overlay.fillRect(0, 0, 360, 640);

    // Card
    const card = this.add.graphics().setDepth(31);
    card.fillStyle(0x1a0800, 0.98);
    card.fillRoundedRect(40, 210, 280, 190, 16);
    card.lineStyle(2, 0xff6644, 0.9);
    card.strokeRoundedRect(40, 210, 280, 190, 16);
    card.lineStyle(1, 0xff9966, 0.2);
    card.strokeRoundedRect(46, 216, 268, 178, 12);

    this.add.text(180, 252, '😞', { fontSize: '40px' }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 302, 'Opponent Left', {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 330, '$1.00 refunded to your wallet', {
      fontSize: '13px', color: '#44ff88',
    }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 354, 'Returning to menu...', {
      fontSize: '11px', color: '#886644',
    }).setOrigin(0.5).setDepth(32);

    // Fly-up refund text
    const fly = this.add.text(180, 334, '+$1.00 REFUNDED', {
      fontSize: '16px', color: '#44ff88', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(33).setAlpha(0);

    this.tweens.add({
      targets: fly, y: 290, alpha: 1, duration: 600, ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: fly, alpha: 0, duration: 400, delay: 900 });
      },
    });

    this.time.delayedCall(3000, () => {
      if (this.scene?.isActive()) {
        this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
      }
    });
  }

  private async leaveLobby() {
    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

    this.statusText.setText('Leaving...');

    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);
    await checkersMultiplayer.cancelFromLobby(this.lobbyId, this.uid);

    this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHUTDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  shutdown() {
    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
  }
}