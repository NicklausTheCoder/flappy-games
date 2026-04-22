// src/scenes/checkers/CheckersMatchmakingScene.ts
//
// WHAT CHANGED vs the Firebase version:
//   • joinQueue() now emits 'joinCheckersMatchmaking' over Socket.io
//   • leaveQueue() now emits 'leaveCheckersMatchmaking' over Socket.io
//   • Match notification now comes via socket.on('checkersMatchFound')
//     instead of Firebase onValue(matches/{uid})
//   • Socket connects AFTER fee is charged so connection doesn't sit idle
//   • Everything else — fee, refund, keep-alive, timeout, UI — unchanged
//
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

 const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';


export class CheckersMatchmakingScene extends Phaser.Scene {
  private username:    string = '';
  private uid:         string = '';
  private displayName: string = '';
  private avatar:      string = '';

  private searchTimer!:    Phaser.Time.TimerEvent;
  private cancelled:       boolean = false;
  private matchFound:      boolean = false;
  private transitioning:   boolean = false;
  private feeCharged:      boolean = false;
  private maxSearchTime:   number  = 60000;
  private searchStartTime: number  = 0;

  // Socket — only opened after fee is charged
  private socket: Socket | null = null;

  // UI refs
  private searchText!:      Phaser.GameObjects.Text;
  private statusText!:      Phaser.GameObjects.Text;
  private timerText!:       Phaser.GameObjects.Text;
  private queueCountText!:  Phaser.GameObjects.Text;
  private cancelContainer!: Phaser.GameObjects.Container;
  private cancelLabel!:     Phaser.GameObjects.Text;
  private cancelImg!:       Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

  // Visual
  private orbitAngle:  number = 0;
  private orbitPieces: Phaser.GameObjects.Arc[] = [];
  private radarGfx!:   Phaser.GameObjects.Graphics;
  private radarRadius: number = 0;
  private radarGrowing: boolean = true;
  private starLayers:  Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;
  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number }> = [];

  constructor() {
    super({ key: 'CheckersMatchmakingScene' });
  }

  // ─── init ──────────────────────────────────────────────────────────────────
  init(data: { username: string; uid: string; displayName?: string; avatar?: string; userData?: any }) {
    this.cancelled       = false;
    this.matchFound      = false;
    this.transitioning   = false;
    this.feeCharged      = false;
    this.orbitAngle      = 0;
    this.orbitPieces     = [];
    this.starLayers      = [];
    this.boardSquares    = [];
    this.searchStartTime = 0;

    if (this.searchTimer) { this.searchTimer.destroy(); this.searchTimer = null as any; }
    if (this.socket)      { this.socket.disconnect();  this.socket = null; }

    if (data.userData) {
      this.username    = data.username    || data.userData.username || '';
      this.uid         = data.uid         || data.userData.uid      || '';
      this.displayName = this.username;
      this.avatar      = data.userData.avatar || 'default';
    } else {
      this.username    = data.username    || '';
      this.uid         = data.uid         || '';
      this.displayName = data.displayName || this.username;
      this.avatar      = data.avatar      || 'default';
    }
  }

  // ─── create ────────────────────────────────────────────────────────────────
  async create() {
    this.searchStartTime = Date.now();
    this.addBackground();
    this.buildStaticUI();

    // ── STEP 1: Charge $1 fee ─────────────────────────────────────────────
    this.safeSetText(this.statusText, 'Charging entry fee...');

    const feeOk = await updateCheckersWalletBalance(
      this.uid, -1.00, 'game_fee', 'Checkers game fee'
    );

    if (!feeOk) {
      this.safeSetText(this.statusText, '❌ Insufficient funds!');
      this.showInsufficientFundsPopup();
      return;
    }

    this.feeCharged = true;
    this.safeSetText(this.statusText, 'Connecting to server...');

    // ── STEP 2: Connect socket and join server queue ───────────────────────
    this.connectAndQueue();

    // ── STEP 3: Animated dots + elapsed timer ─────────────────────────────
    let dots = 0;
    this.searchTimer = this.time.addEvent({
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

    // ── STEP 4: Timeout ───────────────────────────────────────────────────
    this.time.delayedCall(this.maxSearchTime, () => {
      if (!this.matchFound && !this.cancelled && !this.transitioning) this.handleTimeout();
    });
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
      s.obj.y -= s.drift * dt;
      s.obj.angle += s.drift * 0.3 * dt;
      if (s.obj.y < -20) { s.obj.y = 660; s.obj.x = Phaser.Math.Between(0, 360); }
    });

    this.orbitAngle += dt * 68;
    const cx = 180, cy = 270;
    this.orbitPieces.forEach((p, i) => {
      const offset = (360 / this.orbitPieces.length) * i;
      const r      = i % 2 === 0 ? 56 : 76;
      const dir    = i % 2 === 0 ? 1 : -1;
      const rad    = Phaser.Math.DegToRad(this.orbitAngle * dir + offset);
      p.x = cx + Math.cos(rad) * r;
      p.y = cy + Math.sin(rad) * r;
    });

    if (this.radarGfx) {
      this.radarGrowing ? (this.radarRadius += delta * 0.058) : (this.radarRadius -= delta * 0.058);
      if (this.radarRadius > 96) this.radarGrowing = false;
      if (this.radarRadius < 2)  this.radarGrowing = true;
      this.radarGfx.clear();
      this.radarGfx.lineStyle(1.5, 0xffaa00, (1 - this.radarRadius / 96) * 0.5);
      this.radarGfx.strokeCircle(cx, cy, this.radarRadius);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SOCKET — replaces Firebase onValue + checkersMultiplayer.joinQueue
  // ─────────────────────────────────────────────────────────────────────────
  private connectAndQueue() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log(`♟️ [Checkers] Socket connected: ${this.socket!.id}`);
      if (this.cancelled || this.matchFound) return;

      this.socket!.emit('joinCheckersMatchmaking', {
        uid:         this.uid,
        username:    this.username,
        displayName: this.displayName,
        avatar:      this.avatar,
      });
    });

    this.socket.on('checkersMatchmakingJoined', ({ position }: { position: number }) => {
      console.log(`✅ [Checkers] In queue — ~position ${position}`);
      this.safeSetText(this.statusText, 'In queue — waiting for opponent...');
      this.safeSetText(this.queueCountText, `~${position} player${position === 1 ? '' : 's'} in queue`);
    });

    // ── THE key event — replaces Firebase onValue(matches/{uid}) ──────────
    this.socket.on('checkersMatchFound', ({ lobbyId, opponentDisplayName }: {
      lobbyId: string;
      opponentDisplayName: string;
    }) => {
      console.log(`♟️ [Checkers] matchFound! lobbyId=${lobbyId} vs ${opponentDisplayName}`);
      if (this.matchFound || this.transitioning || this.cancelled) return;

      this.matchFound    = true;
      this.transitioning = true;

      this.safeSetText(this.statusText, `Matched vs ${opponentDisplayName}!`);
      this.safeSetText(this.searchText,  'Opponent found! ✅');

      if (this.searchTimer) this.searchTimer.destroy();
      this.cancelContainer.disableInteractive();
      this.cancelLabel.setColor('#555555');

      // Flash gold then fade
      this.cameras.main.flash(500, 255, 170, 0, 0.5);
      this.cameras.main.once('cameraflashcomplete', () => {
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          // Disconnect matchmaking socket — lobby scene uses Firebase directly
          this.socket?.disconnect();
          this.socket = null;
          this.scene.start('CheckersLobbyScene', {
            username: this.username,
            uid:      this.uid,
            lobbyId,
          });
        });
      });
    });

    this.socket.on('checkersMatchmakingTimeout', () => {
      if (!this.matchFound && !this.cancelled && !this.transitioning) this.handleTimeout();
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ [Checkers] Socket error:', err.message);
      if (!this.cancelled && !this.matchFound) {
        this.safeSetText(this.statusText, 'Connection error — retrying...');
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`♟️ [Checkers] Socket disconnected: ${reason}`);
      if (!this.matchFound && !this.cancelled && !this.transitioning) {
        this.safeSetText(this.statusText, 'Disconnected — reconnecting...');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CANCEL / TIMEOUT / REFUND
  // ─────────────────────────────────────────────────────────────────────────
  private async cancelSearch() {
    if (this.cancelled || this.matchFound || this.transitioning) return;
    this.cancelled     = true;
    this.transitioning = true;
    this.safeSetText(this.statusText, 'Cancelling...');
    if (this.searchTimer) this.searchTimer.destroy();

    // Tell server to remove from queue
    if (this.socket?.connected) {
      this.socket.emit('leaveCheckersMatchmaking', { uid: this.uid });
    }
    this.socket?.disconnect();
    this.socket = null;

    await this.issueRefund('Matchmaking cancelled');

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
    });
  }

  private async handleTimeout() {
    if (this.matchFound || this.cancelled || this.transitioning) return;
    this.cancelled     = true;
    this.transitioning = true;
    this.safeSetText(this.searchText,  'Timed out');
    this.safeSetText(this.statusText,  'No players found. Try again!');
    if (this.searchTimer) this.searchTimer.destroy();

    if (this.socket?.connected) this.socket.emit('leaveCheckersMatchmaking', { uid: this.uid });
    this.socket?.disconnect();
    this.socket = null;

    await this.issueRefund('Matchmaking timeout');

    // Swap button to TRY AGAIN
    this.cancelLabel.setText('🔄  TRY AGAIN').setColor('#3d1a00');
    if (this.textures.exists('wood-button')) {
      (this.cancelImg as Phaser.GameObjects.Image).setTint(0xffdd99);
    }
    this.cancelContainer.removeAllListeners();
    this.cancelContainer.setInteractive({ useHandCursor: true });
    this.cancelContainer.on('pointerover',  () => { this.cancelLabel.setColor('#ffaa00'); this.tweens.add({ targets: this.cancelContainer, scaleX:1.05, scaleY:1.05, duration:80 }); });
    this.cancelContainer.on('pointerout',   () => { this.cancelLabel.setColor('#3d1a00'); this.tweens.add({ targets: this.cancelContainer, scaleX:1, scaleY:1, duration:80 }); });
    this.cancelContainer.on('pointerdown',  () => {
      this.tweens.add({ targets: this.cancelContainer, scaleX:0.95, scaleY:0.95, duration:55, yoyo:true,
        onComplete: () => this.scene.restart({ username: this.username, uid: this.uid, displayName: this.displayName, avatar: this.avatar }),
      });
    });
  }

  private async issueRefund(reason: string) {
    if (!this.feeCharged) return;
    this.feeCharged = false;
    try {
      await updateCheckersWalletBalance(this.uid, 1.00, 'refund', `${reason} - refund`);
      if (this.scene?.isActive()) {
        const fly = this.add.text(180, 460, '+$1.00 REFUNDED', {
          fontSize: '16px', color: '#44ff44', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(20).setAlpha(0);
        this.tweens.add({
          targets: fly, y: 420, alpha: 1, duration: 500, ease: 'Sine.easeOut',
          onComplete: () => { this.tweens.add({ targets: fly, alpha:0, duration:600, delay:900, onComplete:()=>fly.destroy() }); },
        });
      }
    } catch (err) { console.error('❌ Refund failed:', err); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BACKGROUND  (identical to previous version)
  // ─────────────────────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#0f0800');

    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-2);
      const dim = this.add.graphics().setDepth(-1);
      dim.fillStyle(0x000000, 0.72);
      dim.fillRect(0, 0, 360, 640);
    }

    for (let i = 0; i < 14; i++) {
      const size = Phaser.Math.Between(12, 28);
      const sq   = this.add.rectangle(
        Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
        size, size, i % 2 === 0 ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.05, 0.14)
      ).setDepth(0).setAngle(45);
      this.boardSquares.push({ obj: sq, drift: Phaser.Math.FloatBetween(6, 20) });
    }

    const defs = [
      { count: 60, r: 1,   sMin: 10, sMax: 18, aMin: 0.12, aMax: 0.28, col: 0xcc9966 },
      { count: 35, r: 1.3, sMin: 24, sMax: 38, aMin: 0.30, aMax: 0.55, col: 0xddbb88 },
      { count: 15, r: 1.8, sMin: 50, sMax: 68, aMin: 0.55, aMax: 0.85, col: 0xffeedd },
    ];
    this.starLayers = [];
    defs.forEach((d, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < d.count; i++) {
        const a   = Phaser.Math.FloatBetween(d.aMin, d.aMax);
        const obj = this.add.circle(Phaser.Math.Between(0,360), Phaser.Math.Between(0,640), d.r, d.col, a).setDepth(-4 + li);
        if (li === 2) this.tweens.add({ targets: obj, alpha: a * 0.35, duration: Phaser.Math.Between(600,1400), yoyo:true, repeat:-1, ease:'Sine.easeInOut', delay: Phaser.Math.Between(0,1200) });
        layer.push({ obj, speed: Phaser.Math.FloatBetween(d.sMin, d.sMax) });
      }
      this.starLayers.push(layer);
    });

    this.scheduleShootingStars();
  }

  private scheduleShootingStars() {
    const next = () => {
      this.shootingStarTimer = this.time.delayedCall(Phaser.Math.Between(3000,8000), () => { this.spawnShootingStar(); next(); });
    };
    next();
  }

  private spawnShootingStar() {
    const len = Phaser.Math.Between(55,110), ang = Phaser.Math.DegToRad(Phaser.Math.Between(20,45));
    const dx = Math.cos(ang)*len, dy = Math.sin(ang)*len;
    const sx = Phaser.Math.Between(20,340), sy = Phaser.Math.Between(10,180);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(450,850);
    const t   = this.time.addEvent({ delay:16, loop:true, callback:() => {
      prog = Math.min(prog+16/dur,1); g.clear();
      g.lineStyle(1,0xffeedd,0.15); g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+dx*prog*0.6,sy+dy*prog*0.6); g.strokePath();
      g.lineStyle(1,0xddbb88,0.45); g.beginPath(); g.moveTo(sx+dx*prog*0.3,sy+dy*prog*0.3); g.lineTo(sx+dx*prog,sy+dy*prog); g.strokePath();
      g.lineStyle(2,0xffffff,0.9);  g.beginPath(); g.moveTo(sx+dx*prog*0.8,sy+dy*prog*0.8); g.lineTo(sx+dx*prog,sy+dy*prog); g.strokePath();
      if (prog>=1) { t.destroy(); this.tweens.add({ targets:g, alpha:0, duration:180, onComplete:()=>g.destroy() }); }
    }});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATIC UI  (identical to previous version)
  // ─────────────────────────────────────────────────────────────────────────
  private buildStaticUI() {
    this.add.text(180, 32, '♟ CHECKERS', {
      fontSize: '26px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 60, 'FINDING OPPONENT', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 4,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.25);
    div.beginPath(); div.moveTo(20,76); div.lineTo(340,76); div.strokePath();

    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x2a1200, 0.92);
    card.fillRoundedRect(55, 88, 250, 58, 12);
    card.lineStyle(1.5, 0xffaa00, 0.7);
    card.strokeRoundedRect(55, 88, 250, 58, 12);
    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0xffaa00, 0.1);
    strip.fillRoundedRect(55, 88, 250, 18, { tl:12, tr:12, bl:0, br:0 });

    this.add.circle(94, 110, 10, 0xcc2200, 1).setDepth(12);
    this.add.circle(94, 110,  7, 0xdd3300, 1).setDepth(13);
    this.add.circle(91, 107,  3, 0xffffff, 0.2).setDepth(14);

    this.add.text(112, 100, this.displayName, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setDepth(12);
    this.add.text(112, 118, `@${this.username}`, {
      fontSize: '10px', color: '#ffaa00',
    }).setDepth(12);

    const badge = this.add.graphics().setDepth(11);
    badge.fillStyle(0xff8800, 0.9);
    badge.fillRoundedRect(256, 100, 42, 22, 8);
    this.add.text(277, 111, '$1.00', {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    this.buildCentralOrb();
    this.radarGfx = this.add.graphics().setDepth(9);

    this.searchText = this.add.text(180, 358, 'Searching', {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    this.statusText = this.add.text(180, 384, 'Charging entry fee...', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(10);

    this.timerText = this.add.text(180, 404, '0s', {
      fontSize: '11px', color: '#555555',
    }).setOrigin(0.5).setDepth(10);

    this.queueCountText = this.add.text(180, 420, 'Checking queue...', {
      fontSize: '11px', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(10);

    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0x000000, 0.45);
    tipBg.fillRoundedRect(30, 438, 300, 28, 8);
    this.add.text(180, 452, '💡 Fee is refunded if no match is found', {
      fontSize: '10px', color: '#888888',
    }).setOrigin(0.5).setDepth(11);

    this.buildCancelButton();
  }

  private buildCentralOrb() {
    const cx = 180, cy = 270;
    [96, 76, 56].forEach((r, i) => {
      this.add.circle(cx, cy, r, 0xffaa00, 0.022 + i*0.016).setDepth(8);
    });
    this.add.circle(cx, cy, 44, 0x3d1a00, 1).setDepth(9);
    const body = this.add.circle(cx, cy, 40, 0xcc2200, 1).setDepth(10);
    this.add.circle(cx, cy, 30, 0xdd3300, 1).setDepth(11);
    this.add.circle(cx, cy, 18, 0xff5533, 1).setDepth(12);
    this.add.circle(cx - 9, cy - 9, 7, 0xffffff, 0.25).setDepth(13);
    this.tweens.add({ targets: body, scaleX: 1.07, scaleY: 1.07, duration: 1100, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    const qMark = this.add.text(cx, cy, '?', {
      fontSize: '28px', color: '#ffaa00', fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(14);
    this.tweens.add({ targets: qMark, alpha: 0.3, duration: 900, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });
    [0xcc2200, 0x222222, 0xdd3300, 0x333333, 0xff4422, 0x444444].forEach((col, i) => {
      this.orbitPieces.push(this.add.circle(cx, cy, i % 2 === 0 ? 5 : 4, col, 1).setDepth(10));
    });
  }

  private buildCancelButton() {
    const hasBtn = this.textures.exists('wood-button');
    if (hasBtn) {
      this.cancelImg = this.add.image(0, 0, 'wood-button').setDisplaySize(210, 48).setTint(0xbb6633);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x8b3a00, 0.95); g.fillRoundedRect(-105,-24,210,48,12);
      g.lineStyle(2, 0xffaa00, 0.7); g.strokeRoundedRect(-105,-24,210,48,12);
      this.cancelImg = g;
    }
    this.cancelLabel = this.add.text(0, 0, '✖  CANCEL SEARCH', {
      fontSize: '14px', color: '#3d1a00', fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);
    this.cancelContainer = this.add.container(180, 510, [this.cancelImg as any, this.cancelLabel]);
    this.cancelContainer.setSize(210, 48).setInteractive({ useHandCursor: true }).setDepth(20);
    this.cancelContainer.on('pointerover',  () => { this.cancelLabel.setColor('#ffaa00'); this.tweens.add({ targets: this.cancelContainer, scaleX:1.05, scaleY:1.05, duration:80 }); });
    this.cancelContainer.on('pointerout',   () => { this.cancelLabel.setColor('#3d1a00'); this.tweens.add({ targets: this.cancelContainer, scaleX:1, scaleY:1, duration:80 }); });
    this.cancelContainer.on('pointerdown',  () => {
      this.tweens.add({ targets: this.cancelContainer, scaleX:0.95, scaleY:0.95, duration:55, yoyo:true, onComplete:()=>this.cancelSearch() });
    });
  }

  private showInsufficientFundsPopup() {
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.82); overlay.fillRect(0, 0, 360, 640);
    const card = this.add.graphics().setDepth(31);
    card.fillStyle(0x2a1200, 0.98); card.fillRoundedRect(40, 218, 280, 195, 16);
    card.lineStyle(2, 0xff6600, 0.9); card.strokeRoundedRect(40, 218, 280, 195, 16);
    this.add.circle(180, 262, 28, 0x333333, 1).setDepth(32);
    this.add.circle(180, 262, 20, 0x444444, 1).setDepth(33);
    this.add.text(180, 262, '♛', { fontSize: '22px', color: '#ffaa00' }).setOrigin(0.5).setDepth(34);
    this.add.text(180, 302, 'Insufficient Funds!', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 2 }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 326, 'You need at least $1.00 to play', { fontSize: '13px', color: '#ccaa88', stroke: '#3d1a00', strokeThickness: 2 }).setOrigin(0.5).setDepth(32);
    const hasBtn = this.textures.exists('wood-button');
    const btnImg = hasBtn ? this.add.image(0,0,'wood-button').setDisplaySize(180,44).setTint(0xffdd99) : (() => { const g = this.add.graphics(); g.fillStyle(0xd4813a); g.fillRoundedRect(-90,-22,180,44,10); return g; })();
    const btnLbl = this.add.text(0, 0, '← BACK TO MENU', { fontSize: '13px', color: '#3d1a00', fontStyle: 'bold' }).setOrigin(0.5);
    const c = this.add.container(180, 378, [btnImg as any, btnLbl]).setDepth(33);
    c.setSize(180, 44).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { this.tweens.add({ targets:c, scaleX:0.95, scaleY:0.95, duration:55, yoyo:true, onComplete:()=>this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid }) }); });
  }

  private safeSetText(obj: Phaser.GameObjects.Text, value: string) {
    if (this.scene?.isActive() && obj?.active) obj.setText(value);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  shutdown() {
    if (this.searchTimer)       this.searchTimer.destroy();
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();

    if (!this.matchFound && !this.cancelled && !this.transitioning) {
      this.issueRefund('Unexpected shutdown');
    }

    if (this.socket && !this.matchFound) {
      this.socket.emit('leaveCheckersMatchmaking', { uid: this.uid });
      this.socket.disconnect();
      this.socket = null;
    }
  }
}