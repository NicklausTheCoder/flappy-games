// src/scenes/ball-crush/BallCrushMatchmakingScene.ts
// ─────────────────────────────────────────────────────────────────────────────
// MATCHMAKING via Socket.io server — replaces Firebase distributed lock.
//
// What changed vs the Firebase version:
//   • No joinQueue() / leaveQueue() Firebase calls
//   • No matchmaking_lock / matching_lock transactions
//   • No onValue(matches/{uid}) listener
//   • Socket emits 'joinMatchmaking' → server pairs → server emits 'matchFound'
//   • Fee charged here in client (atomic wallet transaction) — unchanged
//   • Refund issued here on cancel/timeout — unchanged
//   • All visuals identical to previous version
// ─────────────────────────────────────────────────────────────────────────────
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { updateBallCrushWalletBalance } from '../../firebase/ballCrushSimple';

// const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';
const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

export class BallCrushMatchmakingScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = '';

  private cancelled: boolean = false;
  private matchFound: boolean = false;
  private isTransitioning: boolean = false;
  private feeCharged: boolean = false;
  private searchStartTime: number = 0;
  private readonly MAX_SEARCH_TIME = 90_000;

  private socket: Socket | null = null;

  private dotTimer!: Phaser.Time.TimerEvent;
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];

  private searchText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private cancelContainer!: Phaser.GameObjects.Container;
  private cancelLabel!: Phaser.GameObjects.Text;
  private cancelImg!: Phaser.GameObjects.Image;

  private orbitBalls: Phaser.GameObjects.Arc[] = [];
  private orbitAngle: number = 0;
  private radarGfx!: Phaser.GameObjects.Graphics;
  private radarRadius: number = 0;
  private radarGrowing: boolean = true;

  constructor() {
    super({ key: 'BallCrushMatchmakingScene' });
  }

  preload() {
    if (!this.textures.exists('btn-orange')) this.load.image('btn-orange', 'assets/button.png');
    if (!this.textures.exists('btn-dark'))   this.load.image('btn-dark',   'assets/button2.png');
  }

  init(data: { username: string; uid: string; displayName: string; avatar: string }) {
    this.username        = data.username    || '';
    this.uid             = data.uid         || '';
    this.displayName     = data.displayName || data.username || '';
    this.avatar          = data.avatar      || 'default';
    this.cancelled       = false;
    this.matchFound      = false;
    this.isTransitioning = false;
    this.feeCharged      = false;
    this.searchStartTime = 0;
    this.orbitAngle      = 0;
    this.orbitBalls      = [];
    this.starLayers      = [];

    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    if (this.dotTimer) { this.dotTimer.destroy(); this.dotTimer = null as any; }
  }

  async create() {
    this.searchStartTime = Date.now();
    this.addBackground();
    this.buildStaticUI();

    // STEP 1: Charge fee
    this.safeSetText(this.statusText, 'Charging entry fee...');
    const feeOk = await updateBallCrushWalletBalance(
      this.uid, 1.00, 'game_fee', 'Ball Crush game fee'
    );

    if (!feeOk) {
      this.safeSetText(this.statusText, '❌ Insufficient funds!');
      this.showInsufficientFundsPopup();
      return;
    }

    this.feeCharged = true;
    this.safeSetText(this.statusText, 'Connecting to server...');

    // STEP 2: Connect and join server queue
    this.connectAndQueue();

    // STEP 3: Animated dots + elapsed timer
    let dots = 0;
    this.dotTimer = this.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        if (!this.matchFound && !this.cancelled) {
          dots = (dots + 1) % 4;
          this.safeSetText(this.searchText, 'Searching' + '.'.repeat(dots));
          const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
          this.safeSetText(this.timerText, `${elapsed}s`);
        }
      },
    });

    // STEP 4: 90s client-side timeout (server also has its own)
    this.time.delayedCall(this.MAX_SEARCH_TIME, () => {
      if (!this.matchFound && !this.cancelled && !this.isTransitioning) {
        this.handleTimeout();
      }
    });
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;

    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    this.orbitAngle += dt * 80;
    const cx = 180, cy = 270;
    this.orbitBalls.forEach((ball, i) => {
      const offset = (360 / this.orbitBalls.length) * i;
      const radius = i % 2 === 0 ? 58 : 80;
      const dir    = i % 2 === 0 ? 1 : -1;
      const rad    = Phaser.Math.DegToRad(this.orbitAngle * dir + offset);
      ball.x = cx + Math.cos(rad) * radius;
      ball.y = cy + Math.sin(rad) * radius;
    });

    if (this.radarGfx) {
      this.radarGrowing ? (this.radarRadius += delta * 0.06) : (this.radarRadius -= delta * 0.06);
      if (this.radarRadius > 100) this.radarGrowing = false;
      if (this.radarRadius < 2)   this.radarGrowing = true;
      this.radarGfx.clear();
      this.radarGfx.lineStyle(1.5, 0xffaa00, (1 - this.radarRadius / 100) * 0.6);
      this.radarGfx.strokeCircle(cx, cy, this.radarRadius);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SOCKET — the only real change from the Firebase version
  // ─────────────────────────────────────────────────────────────────────────
  private connectAndQueue() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log(`🔌 Socket connected: ${this.socket!.id}`);
      if (this.cancelled || this.matchFound) return;

      this.socket!.emit('joinMatchmaking', {
        uid:         this.uid,
        username:    this.username,
        displayName: this.displayName,
        avatar:      this.avatar,
      });
    });

    this.socket.on('matchmakingJoined', ({ position }: { position: number }) => {
      console.log(`✅ In queue — ~position ${position}`);
      this.safeSetText(this.statusText, 'In queue — waiting for opponent...');
    });

    // ── THE key event — replaces the entire Firebase onValue(matches/{uid}) ──
    this.socket.on('matchFound', ({ lobbyId, opponentDisplayName }: {
      lobbyId: string;
      opponentDisplayName: string;
    }) => {
      console.log(`🎯 matchFound! lobbyId=${lobbyId} vs ${opponentDisplayName}`);
      if (this.matchFound || this.isTransitioning || this.cancelled) return;

      this.matchFound      = true;
      this.isTransitioning = true;

      this.safeSetText(this.statusText, `Matched vs ${opponentDisplayName}!`);
      this.safeSetText(this.searchText,  'Opponent located! ✅');

      if (this.dotTimer) this.dotTimer.destroy();
      this.cancelContainer.disableInteractive();
      this.cancelLabel.setColor('#444444');

      this.cameras.main.flash(400, 255, 220, 100);
      this.cameras.main.once('cameraflashcomplete', () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          // Disconnect matchmaking socket — game scene opens its own connection
          this.socket?.disconnect();
          this.socket = null;

          this.scene.start('BallCrushLobbyScene', {
            username: this.username,
            uid:      this.uid,
            lobbyId,
          });
        });
      });
    });

    this.socket.on('matchmakingTimeout', () => {
      if (!this.matchFound && !this.cancelled && !this.isTransitioning) {
        this.handleTimeout();
      }
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ Socket connect error:', err.message);
      if (!this.cancelled && !this.matchFound) {
        this.safeSetText(this.statusText, 'Connection error — retrying...');
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${reason}`);
      if (!this.matchFound && !this.cancelled && !this.isTransitioning) {
        this.safeSetText(this.statusText, 'Disconnected — reconnecting...');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CANCEL / TIMEOUT / REFUND — same logic as before
  // ─────────────────────────────────────────────────────────────────────────
  private async cancelSearch() {
    if (this.cancelled || this.matchFound || this.isTransitioning) return;
    this.cancelled = true; this.isTransitioning = true;
    this.safeSetText(this.statusText, 'Cancelling...');
    if (this.dotTimer) this.dotTimer.destroy();

    if (this.socket?.connected) this.socket.emit('leaveMatchmaking', { uid: this.uid });
    this.socket?.disconnect(); this.socket = null;

    await this.issueRefund('Matchmaking cancelled');

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
    });
  }

  private async handleTimeout() {
    if (this.matchFound || this.cancelled || this.isTransitioning) return;
    this.cancelled = true; this.isTransitioning = true;
    this.safeSetText(this.searchText,  'Timed out');
    this.safeSetText(this.statusText,  'No opponent found. Try again!');
    if (this.dotTimer) this.dotTimer.destroy();

    if (this.socket?.connected) this.socket.emit('leaveMatchmaking', { uid: this.uid });
    this.socket?.disconnect(); this.socket = null;

    await this.issueRefund('Matchmaking timeout');

    // Swap to retry button
    this.cancelImg.setTexture('btn-orange');
    this.cancelLabel.setText('🔄  TRY AGAIN').setColor('#ffffff');
    this.cancelContainer.removeAllListeners();
    this.cancelContainer.setInteractive({ useHandCursor: true });
    this.cancelContainer.on('pointerover',  () => { this.cancelLabel.setColor('#ffff00'); this.tweens.add({ targets: this.cancelContainer, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    this.cancelContainer.on('pointerout',   () => { this.cancelLabel.setColor('#ffffff'); this.tweens.add({ targets: this.cancelContainer, scaleX: 1, scaleY: 1, duration: 80 }); });
    this.cancelContainer.on('pointerdown',  () => {
      this.tweens.add({ targets: this.cancelContainer, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true,
        onComplete: () => this.scene.restart({ username: this.username, uid: this.uid, displayName: this.displayName, avatar: this.avatar }),
      });
    });
  }

  private async issueRefund(reason: string) {
    if (!this.feeCharged) return;
    this.feeCharged = false;
    try {
      await updateBallCrushWalletBalance(this.uid, 1.00, 'refund', `${reason} - refund`);
      if (this.scene?.isActive()) {
        const fly = this.add.text(180, 460, '+$1.00 REFUNDED', {
          fontSize: '16px', color: '#00ff88', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(20).setAlpha(0);
        this.tweens.add({
          targets: fly, y: 420, alpha: 1, duration: 500, ease: 'Sine.easeOut',
          onComplete: () => { this.tweens.add({ targets: fly, alpha: 0, duration: 600, delay: 900, onComplete: () => fly.destroy() }); },
        });
      }
    } catch (err) { console.error('❌ Refund failed:', err); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI — identical to previous version
  // ─────────────────────────────────────────────────────────────────────────
  private buildStaticUI() {
    this.add.text(180, 32, '⚽ BALL CRUSH', { fontSize: '26px', color: '#ffaa00', fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
    this.add.text(180, 60, 'FINDING OPPONENT', { fontSize: '12px', color: '#ffaa00', letterSpacing: 4 }).setOrigin(0.5).setDepth(10);
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.25); div.beginPath(); div.moveTo(20, 76); div.lineTo(340, 76); div.strokePath();

    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x0d2b0d, 0.9); card.fillRoundedRect(55, 88, 250, 60, 12);
    card.lineStyle(1.5, 0xffaa00, 0.7); card.strokeRoundedRect(55, 88, 250, 60, 12);
    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0xffaa00, 0.12); strip.fillRoundedRect(55, 88, 250, 20, { tl: 12, tr: 12, bl: 0, br: 0 });
    this.add.text(100, 108, '⚽', { fontSize: '32px' }).setOrigin(0.5).setDepth(12);
    this.add.text(125, 101, this.displayName, { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setDepth(12);
    this.add.text(125, 120, `@${this.username}`, { fontSize: '11px', color: '#ffaa00' }).setDepth(12);
    const feeBadge = this.add.graphics().setDepth(11);
    feeBadge.fillStyle(0xff8800, 0.9); feeBadge.fillRoundedRect(255, 100, 42, 22, 8);
    this.add.text(276, 111, '$1.00', { fontSize: '10px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(12);

    this.buildCentralOrb();
    this.radarGfx = this.add.graphics().setDepth(9);

    this.searchText = this.add.text(180, 356, 'Searching', { fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(10);
    this.statusText = this.add.text(180, 384, 'Charging entry fee...', { fontSize: '13px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(10);
    this.timerText  = this.add.text(180, 406, '0s', { fontSize: '11px', color: '#555555' }).setOrigin(0.5).setDepth(10);

    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0x000000, 0.5); tipBg.fillRoundedRect(30, 424, 300, 28, 8);
    this.add.text(180, 438, '💡 Entry fee is refunded if no match is found', { fontSize: '10px', color: '#888888' }).setOrigin(0.5).setDepth(11);

    this.buildCancelButton();
  }

  private buildCentralOrb() {
    const cx = 180, cy = 270;
    [100, 80, 60].forEach((r, i) => { this.add.circle(cx, cy, r, 0xffaa00, 0.03 + i * 0.02).setDepth(8); });
    const orb = this.add.circle(cx, cy, 42, 0xffaa00, 0.95).setDepth(10);
    this.add.circle(cx, cy, 28, 0xffd060, 0.7).setDepth(11);
    this.add.circle(cx, cy, 14, 0xffffff, 0.4).setDepth(12);
    this.tweens.add({ targets: orb, scaleX: 1.08, scaleY: 1.08, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const qMark = this.add.text(cx, cy, '?', { fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#cc7700', strokeThickness: 3 }).setOrigin(0.5).setDepth(13);
    this.tweens.add({ targets: qMark, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    [0xffaa00, 0xff6600, 0xffcc44, 0xff8800, 0xffd080, 0xff9933].forEach((col, i) => {
      this.orbitBalls.push(this.add.circle(cx, cy, i % 2 === 0 ? 4 : 3, col, 0.9).setDepth(10));
    });
  }

  private buildCancelButton() {
    this.cancelImg   = this.add.image(0, 0, 'btn-dark').setDisplaySize(200, 48);
    this.cancelLabel = this.add.text(0, 0, '✖  CANCEL SEARCH', { fontSize: '14px', color: '#ff6666', fontStyle: 'bold', stroke: '#000000', strokeThickness: 1 }).setOrigin(0.5);
    this.cancelContainer = this.add.container(180, 510, [this.cancelImg, this.cancelLabel]);
    this.cancelContainer.setSize(200, 48).setInteractive({ useHandCursor: true }).setDepth(20);
    this.cancelContainer.on('pointerover',  () => { this.cancelLabel.setColor('#ff4444'); this.tweens.add({ targets: this.cancelContainer, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    this.cancelContainer.on('pointerout',   () => { this.cancelLabel.setColor('#ff6666'); this.tweens.add({ targets: this.cancelContainer, scaleX: 1, scaleY: 1, duration: 80 }); });
    this.cancelContainer.on('pointerdown',  () => { this.tweens.add({ targets: this.cancelContainer, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true, onComplete: () => this.cancelSearch() }); });
  }

  private showInsufficientFundsPopup() {
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.8); overlay.fillRect(0, 0, 360, 640);
    const card = this.add.graphics().setDepth(31);
    card.fillStyle(0x1a0000, 0.98); card.fillRoundedRect(40, 220, 280, 190, 16);
    card.lineStyle(2, 0xff4444, 0.9); card.strokeRoundedRect(40, 220, 280, 190, 16);
    this.add.text(180, 258, '💸', { fontSize: '40px' }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 302, 'Insufficient Funds', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 328, 'You need at least $1.00 to play', { fontSize: '13px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(32);
    const img   = this.add.image(0, 0, 'btn-dark').setDisplaySize(180, 44);
    const label = this.add.text(0, 0, '← BACK TO MENU', { fontSize: '13px', color: '#e0e8ff', fontStyle: 'bold' }).setOrigin(0.5);
    const c = this.add.container(180, 378, [img, label]).setDepth(33);
    c.setSize(180, 44).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { this.tweens.add({ targets: c, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true, onComplete: () => this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid }) }); });
  }

  private safeSetText(obj: Phaser.GameObjects.Text, value: string) {
    if (this.scene?.isActive() && obj?.active) obj.setText(value);
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
        if (li === 2) this.tweens.add({ targets: obj, alpha: alpha * 0.4, duration: Phaser.Math.Between(600, 1400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1200) });
        layer.push({ obj, speed: Phaser.Math.FloatBetween(def.speedMin, def.speedMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private scheduleShootingStars() {
    const next = () => { this.shootingStarTimer = this.time.delayedCall(Phaser.Math.Between(3000, 8000), () => { this.spawnShootingStar(); next(); }); };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120), angle = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(20, 160);
    const g = this.add.graphics().setDepth(-2); let prog = 0;
    const dur = Phaser.Math.Between(500, 900);
    const t = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      prog = Math.min(prog + 16 / dur, 1); g.clear();
      g.lineStyle(1, 0xffffff, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
      g.lineStyle(1, 0xddeeff, 0.45); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      g.lineStyle(2, 0xffffff, 0.9);  g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
      if (prog >= 1) { t.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
    }});
  }

  shutdown() {
    if (this.dotTimer) this.dotTimer.destroy();
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
    if (!this.matchFound && !this.cancelled && !this.isTransitioning && this.feeCharged) {
      this.issueRefund('Unexpected shutdown');
    }
    if (this.socket && !this.matchFound) {
      this.socket.emit('leaveMatchmaking', { uid: this.uid });
      this.socket.disconnect();
      this.socket = null;
    }
  }
}