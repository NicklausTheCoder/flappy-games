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

  // ── UI refs ──────────────────────────────────────────────────────────
  private statusText!:    Phaser.GameObjects.Text;
  private player1Name!:   Phaser.GameObjects.Text;
  private player2Name!:   Phaser.GameObjects.Text;
  private player1Ready!:  Phaser.GameObjects.Text;
  private player2Ready!:  Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownTimer!: Phaser.Time.TimerEvent;
  private countdown:      number = 3;

  // Player card graphics (need to redraw on state change)
  private p1CardGfx!:  Phaser.GameObjects.Graphics;
  private p2CardGfx!:  Phaser.GameObjects.Graphics;
  private p1PieceGfx!: Phaser.GameObjects.Graphics; // hand-drawn piece
  private p2PieceGfx!: Phaser.GameObjects.Graphics;

  // Ready button container
  private readyContainer!: Phaser.GameObjects.Container;
  private readyImg!:        Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private readyLabel!:      Phaser.GameObjects.Text;

  // Leave button container
  private leaveContainer!: Phaser.GameObjects.Container;

  // Background
  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number }> = [];
  private starLayers:   Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];

  constructor() {
    super({ key: 'CheckersLobbyScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string }) {
    this.username      = data.username;
    this.uid           = data.uid;
    this.lobbyId       = data.lobbyId;
    this.isPlayerReady = false;
    this.hasRefunded   = false;
    this.gameStarted   = false;
    this.boardSquares  = [];
    this.starLayers    = [];
  }

  async create() {
    this.addBackground();
    this.buildStaticUI();

    // Subscribe to lobby
    this.unsubscribe = checkersMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      this.onLobbyUpdate(lobby);
    });

    // Check lobby exists
    const lobby = await checkersMultiplayer.getLobby(this.lobbyId);
    if (!lobby) {
      this.statusText.setText('Loading lobby...');
      this.time.delayedCall(10000, () => {
        if (!this.lobby) {
          this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
        }
      });
    }
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;

    // Scroll stars
    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    // Drift board squares
    this.boardSquares.forEach(s => {
      s.obj.y -= s.drift * dt;
      s.obj.angle += s.drift * 0.3 * dt;
      if (s.obj.y < -20) { s.obj.y = 660; s.obj.x = Phaser.Math.Between(0, 360); }
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // BACKGROUND
  // ─────────────────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#0f0800');

    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-2);
      const dim = this.add.graphics().setDepth(-1);
      dim.fillStyle(0x000000, 0.68);
      dim.fillRect(0, 0, 360, 640);
    } else {
      this.drawCheckerboardFallback();
    }

    // Floating diagonal squares
    for (let i = 0; i < 14; i++) {
      const size = Phaser.Math.Between(10, 26);
      const sq   = this.add.rectangle(
        Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
        size, size, i % 2 === 0 ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.04, 0.13)
      ).setDepth(0).setAngle(45);
      this.boardSquares.push({ obj: sq, drift: Phaser.Math.FloatBetween(6, 20) });
    }

    // Subtle star field in warm amber tones
    const defs = [
      { count: 50, r: 1,   sMin: 10, sMax: 18, aMin: 0.08, aMax: 0.22, col: 0xcc9966 },
      { count: 25, r: 1.3, sMin: 22, sMax: 36, aMin: 0.22, aMax: 0.45, col: 0xddbb88 },
    ];
    this.starLayers = [];
    defs.forEach((d, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < d.count; i++) {
        const a   = Phaser.Math.FloatBetween(d.aMin, d.aMax);
        const obj = this.add.circle(Phaser.Math.Between(0,360), Phaser.Math.Between(0,640), d.r, d.col, a).setDepth(-4 + li);
        layer.push({ obj, speed: Phaser.Math.FloatBetween(d.sMin, d.sMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private drawCheckerboardFallback() {
    const size = 40;
    for (let r = 0; r < 17; r++) {
      for (let c = 0; c < 10; c++) {
        const dark = (r + c) % 2 === 0;
        this.add.rectangle(c * size + size/2, r * size + size/2, size, size,
          dark ? 0x1a0d00 : 0x2d1500, 1).setDepth(-2);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // STATIC UI
  // ─────────────────────────────────────────────────────────────────────
  private buildStaticUI() {
    // ── Title ──
    const titleBg = this.add.graphics().setDepth(9);
    titleBg.fillStyle(0x2a1200, 0.95);
    titleBg.fillRoundedRect(24, 18, 312, 64, 14);
    titleBg.lineStyle(2, 0xffaa00, 0.85);
    titleBg.strokeRoundedRect(24, 18, 312, 64, 14);
    titleBg.lineStyle(1, 0xffaa00, 0.25);
    titleBg.strokeRoundedRect(30, 24, 300, 52, 10);

    this.add.text(180, 37, '♟  CHECKERS', {
      fontSize: '26px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'LOBBY', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 8,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    // ── Room code pill ──
    const codeBg = this.add.graphics().setDepth(10);
    codeBg.fillStyle(0x000000, 0.5);
    codeBg.fillRoundedRect(80, 92, 200, 24, 12);
    codeBg.lineStyle(1, 0xffaa00, 0.3);
    codeBg.strokeRoundedRect(80, 92, 200, 24, 12);
    this.add.text(180, 104, `Room: ${this.lobbyId.substring(0, 10)}...`, {
      fontSize: '10px', color: '#888888',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(11);

    // ── VS divider ──
    this.add.text(180, 232, 'VS', {
      fontSize: '22px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(15);

    // ── Player cards (drawn as graphics so we can redraw on state change) ──
    this.p1CardGfx = this.add.graphics().setDepth(9);
    this.p2CardGfx = this.add.graphics().setDepth(9);
    this.p1PieceGfx = this.add.graphics().setDepth(11);
    this.p2PieceGfx = this.add.graphics().setDepth(11);

    this.drawPlayerCard(this.p1CardGfx, 20, 120, false);
    this.drawPlayerCard(this.p2CardGfx, 200, 120, false);

    // Red piece (player 1 — always known)
    this.drawCheckerPiece(this.p1PieceGfx, 100, 170, 'red');
    // Black piece (player 2 — starts as unknown)
    this.drawCheckerPiece(this.p2PieceGfx, 260, 170, 'unknown');

    // Name texts
    this.player1Name = this.add.text(100, 208, this.username, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);

    this.player2Name = this.add.text(260, 208, 'Waiting...', {
      fontSize: '14px', color: '#888888',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(12);

    // Ready badges
    this.player1Ready = this.add.text(100, 230, 'Not Ready', {
      fontSize: '11px', color: '#ff8888',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(12);

    this.player2Ready = this.add.text(260, 230, 'Not Ready', {
      fontSize: '11px', color: '#888888',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(12);

    // Colour labels
    this.add.text(100, 248, '🔴 Red Pieces', {
      fontSize: '10px', color: '#ffaa88',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(12);

    this.add.text(260, 248, '⚫ Black Pieces', {
      fontSize: '10px', color: '#aaaaaa',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(12);

    // ── Status bar ──
    const statusBg = this.add.graphics().setDepth(10);
    statusBg.fillStyle(0x2a1200, 0.85);
    statusBg.fillRoundedRect(22, 278, 316, 36, 10);
    statusBg.lineStyle(1, 0xffaa00, 0.4);
    statusBg.strokeRoundedRect(22, 278, 316, 36, 10);

    this.statusText = this.add.text(180, 296, 'Waiting for opponent to join...', {
      fontSize: '12px', color: '#ffaa00',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);

    // ── Mini checkerboard strip ──
    this.addCheckerStrip(328, 8, 0.14);

    // ── How to play hint ──
    const hintBg = this.add.graphics().setDepth(10);
    hintBg.fillStyle(0x000000, 0.4);
    hintBg.fillRoundedRect(22, 344, 316, 52, 10);
    hintBg.lineStyle(1, 0xffaa00, 0.15);
    hintBg.strokeRoundedRect(22, 344, 316, 52, 10);

    this.add.text(180, 357, 'HOW TO PLAY', {
      fontSize: '9px', color: '#ffaa00', letterSpacing: 3,
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(11);

    this.add.text(180, 373, 'Capture all opponent pieces to win  ·  Kings can move backwards', {
      fontSize: '9px', color: '#666666',
      stroke: '#3d1a00', strokeThickness: 1,
      wordWrap: { width: 295 },
    }).setOrigin(0.5).setDepth(11);

    // ── Ready button ──
    this.buildReadyButton();

    // ── Countdown (hidden until needed) ──
    this.countdownText = this.add.text(180, 544, '', {
      fontSize: '64px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20).setVisible(false);

    // ── Leave button ──
    this.buildLeaveButton();
  }

  // ─── Player card ──────────────────────────────────────────────────────────
  private drawPlayerCard(gfx: Phaser.GameObjects.Graphics, x: number, y: number, highlighted: boolean) {
    gfx.clear();
    gfx.fillStyle(0x2a1200, 0.95);
    gfx.fillRoundedRect(x, y, 160, 142, 12);
    gfx.lineStyle(highlighted ? 2.5 : 1.5, highlighted ? 0xffaa00 : 0x664422, highlighted ? 0.9 : 0.6);
    gfx.strokeRoundedRect(x, y, 160, 142, 12);
    if (highlighted) {
      gfx.lineStyle(1, 0xffaa00, 0.2);
      gfx.strokeRoundedRect(x + 5, y + 5, 150, 132, 8);
    }
  }

  // ─── Checker piece ────────────────────────────────────────────────────────
  private drawCheckerPiece(
    gfx: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    type: 'red' | 'black' | 'unknown' | 'red-ready' | 'black-ready'
  ) {
    gfx.clear();
    if (type === 'unknown') {
      // Dashed circle placeholder
      gfx.lineStyle(2, 0x555555, 0.6);
      gfx.strokeCircle(cx, cy, 24);
      return;
    }

    const isRed   = type === 'red'   || type === 'red-ready';
    const isReady = type === 'red-ready' || type === 'black-ready';
    const rim     = isRed ? 0x5a0000 : 0x111111;
    const body    = isRed ? 0xcc2200 : 0x222222;
    const inner   = isRed ? 0xdd3300 : 0x444444;
    const glowCol = isReady ? 0x44ff88 : (isRed ? 0xff4422 : 0x666666);

    if (isReady) {
      // Outer glow ring when ready
      gfx.lineStyle(3, glowCol, 0.6);
      gfx.strokeCircle(cx, cy, 30);
    }

    gfx.fillStyle(rim,   1); gfx.fillCircle(cx, cy, 26);
    gfx.fillStyle(body,  1); gfx.fillCircle(cx, cy, 22);
    gfx.fillStyle(inner, 1); gfx.fillCircle(cx, cy, 14);
    gfx.fillStyle(0xffffff, 0.22); gfx.fillCircle(cx - 7, cy - 7, 6); // shine
  }

  private addCheckerStrip(y: number, size: number, alpha: number) {
    const cols = Math.ceil(360 / size);
    for (let c = 0; c < cols; c++) {
      this.add.rectangle(c * size + size/2, y + size/2, size, size,
        c % 2 === 0 ? 0x8b4513 : 0xdeb887, alpha
      ).setDepth(2);
    }
  }

  // ─── Ready button ─────────────────────────────────────────────────────────
  private buildReadyButton() {
    const hasBtn = this.textures.exists('wood-button');

    if (hasBtn) {
      this.readyImg = this.add.image(0, 0, 'wood-button').setDisplaySize(230, 50).setTint(0x886644);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x5a3300, 0.9);
      g.fillRoundedRect(-115, -25, 230, 50, 12);
      g.lineStyle(2, 0x886644, 0.7);
      g.strokeRoundedRect(-115, -25, 230, 50, 12);
      this.readyImg = g;
    }

    this.readyLabel = this.add.text(0, 0, '🔒  WAITING FOR OPPONENT', {
      fontSize: '14px', color: '#888888', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 1,
    }).setOrigin(0.5);

    this.readyContainer = this.add.container(180, 428, [this.readyImg as any, this.readyLabel]);
    this.readyContainer.setSize(230, 50).setDepth(20);
    // Starts disabled — enabled once opponent joins
  }

  private setReadyButtonState(state: 'waiting' | 'clickable' | 'done') {
    const hasBtn = this.textures.exists('wood-button');
    if (state === 'waiting') {
      if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).setTint(0x886644);
      this.readyLabel.setText('🔒  WAITING FOR OPPONENT').setColor('#888888');
      this.readyContainer.disableInteractive();
    } else if (state === 'clickable') {
      if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).setTint(0xffdd99);
      this.readyLabel.setText('✅  CLICK TO READY UP').setColor('#3d1a00');
      this.readyContainer.setInteractive({ useHandCursor: true });
      this.readyContainer.removeAllListeners();
      this.readyContainer.on('pointerover', () => {
        this.readyLabel.setColor('#ffaa00');
        this.tweens.add({ targets: this.readyContainer, scaleX: 1.05, scaleY: 1.05, duration: 75 });
      });
      this.readyContainer.on('pointerout', () => {
        this.readyLabel.setColor('#3d1a00');
        this.tweens.add({ targets: this.readyContainer, scaleX: 1, scaleY: 1, duration: 75 });
      });
      this.readyContainer.on('pointerdown', () => {
        this.tweens.add({ targets: this.readyContainer, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: () => this.setReady() });
      });
    } else {
      if (hasBtn) (this.readyImg as Phaser.GameObjects.Image).setTint(0xcc9966);
      this.readyLabel.setText('✅  READY! WAITING...').setColor('#3d1a00');
      this.readyContainer.disableInteractive();
    }
  }

  // ─── Leave button ─────────────────────────────────────────────────────────
  private buildLeaveButton() {
    const hasBtn = this.textures.exists('wood-button');
    let img: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (hasBtn) {
      img = this.add.image(0, 0, 'wood-button').setDisplaySize(140, 40).setTint(0xbb5533);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x8b2200, 0.9); g.fillRoundedRect(-70,-20,140,40,10);
      g.lineStyle(2, 0xff8866, 0.7); g.strokeRoundedRect(-70,-20,140,40,10);
      img = g;
    }
    const lbl = this.add.text(0, 0, '← LEAVE', {
      fontSize: '13px', color: '#3d1a00', fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);

    this.leaveContainer = this.add.container(70, 604, [img as any, lbl]);
    this.leaveContainer.setSize(140, 40).setInteractive({ useHandCursor: true }).setDepth(20);

    this.leaveContainer.on('pointerover', () => { lbl.setColor('#ffaa00'); this.tweens.add({ targets: this.leaveContainer, scaleX: 1.05, scaleY: 1.05, duration: 75 }); });
    this.leaveContainer.on('pointerout',  () => { lbl.setColor('#3d1a00'); this.tweens.add({ targets: this.leaveContainer, scaleX: 1,    scaleY: 1,    duration: 75 }); });
    this.leaveContainer.on('pointerdown', () => {
      this.tweens.add({ targets: this.leaveContainer, scaleX: 0.95, scaleY: 0.95, duration: 55, yoyo: true, onComplete: () => this.leaveLobby() });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // LOBBY UPDATE  ← all original logic, only UI calls changed
  // ─────────────────────────────────────────────────────────────────────
  private onLobbyUpdate(lobby: CheckersLobby | null) {
    if (!this.scene || !this.scene.isActive()) return;

    if (!lobby) { this.statusText.setText('Loading lobby...'); return; }

    if (lobby.status === 'dead' && !this.gameStarted && !this.hasRefunded) {
      this.handleOpponentLeft(); return;
    }
    if (lobby.status === 'dead' && this.gameStarted) return;
    if (lobby.status === 'playing' && !this.gameStarted) { this.startGame(); return; }

    this.lobby = lobby;

    const players   = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);
    const myIdx     = playerIds.indexOf(this.uid);
    const oppIdx    = myIdx === 0 ? 1 : 0;

    // ── My card ──
    if (lobby.players[this.uid]) {
      const me = lobby.players[this.uid];
      this.player1Name.setText(me.displayName || this.username);
      const myReady = me.isReady;
      this.player1Ready.setText(myReady ? '✅ Ready!' : 'Not Ready');
      this.player1Ready.setColor(myReady ? '#44ff88' : '#ff8888');
      this.drawPlayerCard(this.p1CardGfx, 20, 120, myReady);
      this.drawCheckerPiece(this.p1PieceGfx, 100, 170, myReady ? 'red-ready' : 'red');
    }

    if (players.length >= 2) {
      // ── Opponent card ──
      const opp = players[oppIdx];
      this.player2Name.setText(opp.displayName).setColor('#ffffff');
      this.player2Ready.setText(opp.isReady ? '✅ Ready!' : 'Not Ready');
      this.player2Ready.setColor(opp.isReady ? '#44ff88' : '#ff8888');
      this.drawPlayerCard(this.p2CardGfx, 200, 120, opp.isReady);
      this.drawCheckerPiece(this.p2PieceGfx, 260, 170, opp.isReady ? 'black-ready' : 'black');

      if (players.every(p => p.isReady)) {
        this.statusText.setText('Both players ready! Starting...');
        if (lobby.status === 'waiting') checkersMultiplayer.markLobbyReady(this.lobbyId);
        this.startCountdown();
      } else {
        this.statusText.setText('Waiting for both players to ready up...');
        if (!this.isPlayerReady) {
          this.setReadyButtonState('clickable');
        } else {
          this.setReadyButtonState('done');
        }
      }
    } else {
      // Opponent hasn't joined yet
      this.player2Name.setText('Waiting...').setColor('#888888');
      this.player2Ready.setText('Not Joined').setColor('#888888');
      this.drawPlayerCard(this.p2CardGfx, 200, 120, false);
      this.drawCheckerPiece(this.p2PieceGfx, 260, 170, 'unknown');
      this.statusText.setText('Waiting for opponent to join...');
      this.setReadyButtonState('waiting');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // GAME ACTIONS  (all original logic)
  // ─────────────────────────────────────────────────────────────────────
  private async setReady() {
    if (!this.lobby || this.isPlayerReady) return;
    this.isPlayerReady = true;
    this.setReadyButtonState('done');

    // Pulse my card
    this.tweens.add({ targets: this.p1CardGfx, alpha: 0.6, duration: 150, yoyo: true, repeat: 1 });

    await checkersMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);
  }

  private async handleOpponentLeft() {
    if (this.hasRefunded) return;
    this.hasRefunded = true;

    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);

    this.statusText.setText('Opponent left — refunding $1...');

    const ok = await updateCheckersWalletBalance(this.uid, 1.00, 'refund', 'Opponent left lobby - refund');

    if (ok && this.scene?.isActive()) {
      const fly = this.add.text(180, 460, '+$1.00 REFUNDED', {
        fontSize: '18px', color: '#44ff88', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(25);
      this.tweens.add({
        targets: fly, y: 420, alpha: 0, duration: 1500,
        onComplete: () => fly.destroy(),
      });
    }

    if (this.unsubscribe)  { this.unsubscribe(); }
    if (this.countdownTimer) this.countdownTimer.destroy();

    this.time.delayedCall(2500, () => {
      this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
    });
  }

  private async startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;

    this.statusText.setText('Starting game...');
    const myPlayer    = this.lobby?.players[this.uid];
    const playerColor = myPlayer?.color || 'red';

    await new Promise(r => setTimeout(r, 500));

    this.scene.start('CheckersMultiplayerGameScene', {
      username: this.username, uid: this.uid,
      lobbyId: this.lobbyId, lobby: this.lobby,
      playerColor,
    });
  }

  private startCountdown() {
    if (this.countdownTimer || this.gameStarted) return;

    this.countdown = 3;
    this.countdownText.setVisible(true).setText('3');

    this.countdownTimer = this.time.addEvent({
      delay: 1000, repeat: 2,
      callback: () => {
        this.countdown--;
        this.countdownText.setText(this.countdown.toString());

        this.tweens.add({
          targets: this.countdownText, scaleX: 1.5, scaleY: 1.5,
          duration: 200, yoyo: true, ease: 'Back.easeOut',
        });

        // Flash gold on even counts
        if (this.countdown % 2 === 0) {
          this.cameras.main.flash(200, 255, 170, 0, 0.2);
        }

        if (this.countdown <= 0) {
          this.countdownTimer.destroy();
          this.countdownText.setVisible(false);

          if (this.lobby && !this.gameStarted) {
            const isHost = this.lobby.playerIds[0] === this.uid;
            if (isHost && (this.lobby.status === 'waiting' || this.lobby.status === 'ready')) {
              checkersMultiplayer.startGame(this.lobbyId);
            }
          }
        }
      },
    });
  }

  private async leaveLobby() {
    if (this.unsubscribe)    this.unsubscribe();
    if (this.countdownTimer) this.countdownTimer.destroy();

    this.statusText.setText('Leaving lobby...');

    await checkersMultiplayer.setPlayerQueueStatus(this.uid, false);
    await checkersMultiplayer.setPlayerOnline(this.uid, false);
    await checkersMultiplayer.cancelFromLobby(this.lobbyId, this.uid);

    this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
  }

  shutdown() {
    if (this.unsubscribe)    this.unsubscribe();
    if (this.countdownTimer) this.countdownTimer.destroy();
  }
}