// src/scenes/ball-crush/BallCrushLoaderScene.ts
import Phaser from 'phaser';
import { multiGameQueries } from '../../firebase/multiGameQueries';

const SERVER_BASE = (import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com').replace(/\/$/, '');

export class BallCrushLoaderScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = 'default';

  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 2500;
  private assetsLoaded: boolean = false;
  private loadProgress: number = 0;
  private serverOk: boolean = false;
  private serverChecked: boolean = false;
  private pingMs: number = 0;
  private pingChecked: boolean = false;
  private pingWarningShown: boolean = false;
  private networkAcknowledged: boolean = false;

  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  private progressBarFill!: Phaser.GameObjects.Graphics;
  private progressBarGlow!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;

  private orbitAngle: number = 0;
  private orbitBalls: Phaser.GameObjects.Arc[] = [];
  private orbGlow!: Phaser.GameObjects.Arc;
  private radarGfx!: Phaser.GameObjects.Graphics;
  private radarRadius: number = 0;
  private radarGrowing: boolean = true;

  private ballPreview: Phaser.GameObjects.Image | null = null;
  private previewAdded: boolean = false;

  constructor() {
    super({ key: 'BallCrushLoaderScene' });
  }

  // ─── init ─────────────────────────────────────────────────────────────────

  async init(data: { username: string; uid?: string }) {
    console.log('⚽ BallCrushLoaderScene init:', data);
    this.loadStartTime       = Date.now();
    this.assetsLoaded        = false;
    this.loadProgress        = 0;
    this.previewAdded        = false;
    this.ballPreview         = null;
    this.orbitAngle          = 0;
    this.orbitBalls          = [];
    this.starLayers          = [];
    this.serverOk            = false;
    this.serverChecked       = false;
    this.pingMs              = 0;
    this.pingChecked         = false;
    this.pingWarningShown    = false;
    this.networkAcknowledged = false;

    if (!data?.username) {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }

    this.username = data.username;
    this.uid      = data.uid || `temp_${Date.now()}`;

    try {
      const userData = await multiGameQueries.getUserByUid(this.uid);
      if (userData) {
        this.displayName = userData.public?.displayName || this.username;
        this.avatar      = userData.public?.avatar      || 'default';
      }
    } catch (err) {
      console.warn('Could not fetch user data:', err);
      this.displayName = this.username;
    }
  }

  // ─── preload ──────────────────────────────────────────────────────────────

  preload() {
    this.createLoadingUI();
    this.checkServer();

    this.load.on('progress', (v: number) => this.onProgress(v));
    this.load.on('complete',  ()          => this.onComplete());

    this.load.image('ball-background', '/assets/ball-crush/background.jpg');
    this.load.image('ball',             'assets/ball-crush/ball.png');
    this.load.image('player',           'assets/ball-crush/player.png');
    this.load.image('btn-orange',       'assets/button.png');
    this.load.image('btn-dark',         'assets/button2.png');

    this.load.on('loaderror', (file: any) => {
      console.warn(`⚠️ Asset missing: ${file.key}`);
    });
  }

  // ─── create / update ──────────────────────────────────────────────────────

  create() {}

  update(_t: number, delta: number) {
    const dt = delta / 1000;

    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );

    this.orbitAngle += dt * 75;
    const cx = 180, cy = 285;
    const r1 = 52, r2 = 72;
    this.orbitBalls.forEach((ball, i) => {
      const offset = (360 / this.orbitBalls.length) * i;
      const radius = i % 2 === 0 ? r1 : r2;
      const dir    = i % 2 === 0 ? 1 : -1;
      const rad    = Phaser.Math.DegToRad(this.orbitAngle * dir + offset);
      ball.x = cx + Math.cos(rad) * radius;
      ball.y = cy + Math.sin(rad) * radius;
    });

    if (this.radarGfx) {
      this.radarGrowing ? (this.radarRadius += delta * 0.055) : (this.radarRadius -= delta * 0.055);
      if (this.radarRadius > 95) this.radarGrowing = false;
      if (this.radarRadius < 2)  this.radarGrowing = true;
      const a = 1 - this.radarRadius / 95;
      this.radarGfx.clear();
      this.radarGfx.lineStyle(1.5, 0xffaa00, a * 0.55);
      this.radarGfx.strokeCircle(cx, cy, this.radarRadius);
    }
  }

  // ─── Server check ─────────────────────────────────────────────────────────

  private async checkServer() {
    this.statusText?.setText('Connecting to server...');
    try {
      const res = await fetch(`${SERVER_BASE}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        this.serverOk      = true;
        this.serverChecked = true;
        this.statusText?.setText('Server connected ✓');
        console.log('✅ Server reachable');
        this.runPingTest();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      this.serverChecked = true;
      this.serverOk      = false;
      console.error('❌ Server unreachable:', err);
      this.showServerError();
    }
  }

  private showServerError() {
    const dim = this.add.graphics().setDepth(50);
    dim.fillStyle(0x000000, 0.82);
    dim.fillRect(0, 0, 360, 640);

    const card = this.add.graphics().setDepth(51);
    card.fillStyle(0x1a0000, 1);
    card.fillRoundedRect(30, 220, 300, 200, 16);
    card.lineStyle(2, 0xff3300, 0.9);
    card.strokeRoundedRect(30, 220, 300, 200, 16);

    const icon    = this.add.text(180, 255, '⚠️', { fontSize: '36px' }).setOrigin(0.5).setDepth(52);
    const title   = this.add.text(180, 298, 'SERVER UNAVAILABLE', {
      fontSize: '15px', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(52);
    const msg     = this.add.text(180, 325, 'Could not connect to the\ngame server. Please check\nyour connection and try again.', {
      fontSize: '12px', color: '#cccccc', align: 'center',
    }).setOrigin(0.5).setDepth(52);

    const btnBg   = this.add.graphics().setDepth(52);
    btnBg.fillStyle(0xffaa00, 1);
    btnBg.fillRoundedRect(90, 370, 180, 38, 10);
    const btnText = this.add.text(180, 389, '🔄 RETRY', {
      fontSize: '14px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(53);

    const hitZone = this.add.rectangle(180, 389, 180, 38, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(54);
    hitZone.on('pointerdown', () => {
      [dim, card, icon, title, msg, btnBg, btnText, hitZone].forEach(o => o.destroy());
      this.serverOk = false; this.serverChecked = false;
      this.checkServer();
    });

    this.tweens.add({ targets: btnBg, alpha: 0.75, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ─── Ping test ────────────────────────────────────────────────────────────

  private async runPingTest() {
    this.statusText?.setText('Testing connection quality...');

    const PING_COUNT  = 5;
    const PING_BUDGET = 3000;
    const samples: number[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        const wsUrl = SERVER_BASE.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
        const ws    = new WebSocket(wsUrl);
        let sent    = 0;
        const timeout = setTimeout(() => { ws.close(); reject(new Error('Ping timeout')); }, PING_BUDGET);

        ws.onopen = () => {
          const send = () => {
            if (sent >= PING_COUNT) return;
            const t0 = Date.now();
            sent++;
            ws.send(`42["ping_check"]`);
            const handler = () => {
              samples.push(Date.now() - t0);
              if (samples.length >= PING_COUNT) {
                clearTimeout(timeout); ws.close(); resolve();
              } else {
                setTimeout(send, 200);
              }
              ws.removeEventListener('message', handler);
            };
            ws.addEventListener('message', handler);
          };
          setTimeout(send, 300);
        };

        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')); };
        ws.onclose = () => { if (samples.length < PING_COUNT) resolve(); };
      });
    } catch (e) {
      console.warn('⚠️ Ping test failed:', e);
      this.pingMs      = 999;
      this.pingChecked = true;
      this.showPingWarning(999);
      this.tryProceed();
      return;
    }

    if (samples.length === 0) {
      this.pingMs = 999; this.pingChecked = true;
      this.showPingWarning(999); this.tryProceed(); return;
    }

    samples.sort((a, b) => a - b);
    const trimmed = samples.length > 2 ? samples.slice(1, -1) : samples;
    this.pingMs   = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
    console.log(`📶 Ping test: ${samples.join(', ')}ms → avg=${this.pingMs}ms`);

    this.pingChecked = true;

    if (this.pingMs > 400) {
      this.showPingBlock(this.pingMs);
    } else {
      if (this.pingMs > 220) this.showPingWarning(this.pingMs);
      else                   this.statusText?.setText(`Connection: ${this.pingMs}ms ✓`);
      this.tryProceed();
    }
  }

  private showPingWarning(ping: number) {
    if (this.pingWarningShown) return;
    this.pingWarningShown = true;

    const card = this.add.graphics().setDepth(60);
    card.fillStyle(0x1a1000, 0.97);
    card.fillRoundedRect(30, 480, 300, 64, 12);
    card.lineStyle(2, 0xffaa00, 0.85);
    card.strokeRoundedRect(30, 480, 300, 64, 12);

    this.add.text(180, 499, `⚠️  Connection: ${ping}ms — may be unstable`, {
      fontSize: '12px', color: '#ffaa00', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(61);
    this.add.text(180, 520, 'Ball Crush needs a stable connection.\nConsider playing Checkers instead.', {
      fontSize: '10px', color: '#cccccc', align: 'center',
    }).setOrigin(0.5).setDepth(61);

    this.time.delayedCall(4000, () => { try { card.destroy(); } catch (_) {} });
  }

  private showPingBlock(ping: number) {
    const dim = this.add.graphics().setDepth(70);
    dim.fillStyle(0x000000, 0.85); dim.fillRect(0, 0, 360, 640);

    const card = this.add.graphics().setDepth(71);
    card.fillStyle(0x100a00, 1);
    card.fillRoundedRect(24, 180, 312, 280, 18);
    card.lineStyle(2.5, 0xff6600, 0.9);
    card.strokeRoundedRect(24, 180, 312, 280, 18);

    this.add.text(180, 220, '📶', { fontSize: '42px' }).setOrigin(0.5).setDepth(72);
    this.add.text(180, 268, 'HIGH PING DETECTED', {
      fontSize: '17px', color: '#ff6600', fontStyle: 'bold', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(72);
    this.add.text(180, 296, `Your ping: ${ping}ms`, {
      fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(72);
    this.add.text(180, 318, 'Ball Crush requires <400ms for\nfair real-time play. Your connection\nis too unstable right now.', {
      fontSize: '11px', color: '#aaaaaa', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5).setDepth(72);

    const retryBg = this.add.graphics().setDepth(72);
    retryBg.fillStyle(0xffaa00, 1);
    retryBg.fillRoundedRect(44, 365, 125, 40, 10);
    this.add.text(106, 385, '🔄 Retry', {
      fontSize: '13px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(73);
    const retryZone = this.add.rectangle(106, 385, 125, 40, 0, 0)
      .setInteractive({ useHandCursor: true }).setDepth(74);
    retryZone.on('pointerdown', () => {
      [dim, card, retryZone].forEach(o => o.destroy());
      this.pingChecked = false; this.pingWarningShown = false;
      this.statusText?.setText('Re-testing connection...');
      this.runPingTest();
    });

    const checkersBg = this.add.graphics().setDepth(72);
    checkersBg.fillStyle(0x1565c0, 1);
    checkersBg.fillRoundedRect(191, 365, 145, 40, 10);
    this.add.text(263, 385, '♟ Play Checkers', {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(73);
    const checkersZone = this.add.rectangle(263, 385, 145, 40, 0, 0)
      .setInteractive({ useHandCursor: true }).setDepth(74);
    checkersZone.on('pointerdown', () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        window.location.href = window.location.origin + '/checkers?user=' +
          encodeURIComponent(new URLSearchParams(window.location.search).get('user') || '');
      });
    });

    this.tweens.add({ targets: retryBg, alpha: 0.75, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ─── Proceed gate ─────────────────────────────────────────────────────────

  private tryProceed() {
    if (this.assetsLoaded && this.serverOk && this.pingChecked) {
      const elapsed   = Date.now() - this.loadStartTime;
      const remaining = Math.max(0, this.MIN_LOAD_TIME - elapsed);
      this.time.delayedCall(remaining, () => this.goToStart());
    }
  }

  private goToStart() {
    // Always show network notice first — user must acknowledge before entering
    if (!this.networkAcknowledged) {
      this.showNetworkNotice();
      return;
    }
    console.log('🚀 → BallCrushStartScene');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushStartScene', {
        username: this.username, uid: this.uid,
        displayName: this.displayName, avatar: this.avatar,
      });
    });
  }

  // ─── Network notice ───────────────────────────────────────────────────────

  private showNetworkNotice() {
    // Dim
    const dim = this.add.graphics().setDepth(80);
    dim.fillStyle(0x000000, 0.78);
    dim.fillRect(0, 0, 360, 640);

    // Card
    const card = this.add.graphics().setDepth(81);
    card.fillStyle(0x08080f, 1);
    card.fillRoundedRect(20, 140, 320, 360, 18);
    card.lineStyle(2, 0xffaa00, 0.85);
    card.strokeRoundedRect(20, 140, 320, 360, 18);
    // Gold strip at top
    card.fillStyle(0xffaa00, 0.12);
    card.fillRoundedRect(20, 140, 320, 36, { tl: 18, tr: 18, bl: 0, br: 0 });

    // Icon + title
    this.add.text(180, 158, '📶', { fontSize: '18px' }).setOrigin(0.5).setDepth(82);
    this.add.text(180, 192, 'NETWORK NOTICE', {
      fontSize: '15px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(82);

    // Divider
    const div = this.add.graphics().setDepth(82);
    div.lineStyle(1, 0xffaa00, 0.25);
    div.lineBetween(38, 210, 322, 210);

    // Bullet points
    const items = [
      { icon: '⚡', text: 'Ball Crush is real-time.\nA stable connection is required\nthroughout the entire match.' },
      { icon: '🔌', text: 'If your ping stays high mid-match\nyou will be auto-disconnected\nand your opponent awarded the win.' },
      { icon: '📱', text: 'Avoid switching between Wi-Fi\nand mobile data while playing.' },
    ];

    let y = 224;
    items.forEach(item => {
      this.add.text(36, y + 2, item.icon, { fontSize: '15px' }).setDepth(82);
      this.add.text(58, y, item.text, {
        fontSize: '11px', color: '#cccccc', lineSpacing: 3,
      }).setDepth(82);
      const lines = item.text.split('\n').length;
      y += lines * 15 + 20;
    });

    // Ping result
    const pingColor = this.pingMs < 150 ? '#00ff88' : this.pingMs < 220 ? '#ffdd00' : '#ff8800';
    const pingLabel = this.pingMs < 150 ? 'Excellent ✓' : this.pingMs < 220 ? 'Good ✓' : 'Fair — proceed with caution';
    this.add.text(180, y + 4, `Your ping: ${this.pingMs}ms — ${pingLabel}`, {
      fontSize: '11px', color: pingColor, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(82);

    // PROCEED button
    const btnY  = 448;
    const btnBg = this.add.graphics().setDepth(82);
    btnBg.fillStyle(0xffaa00, 1);
    btnBg.fillRoundedRect(55, btnY, 250, 46, 12);

    const btnLabel = this.add.text(180, btnY + 23, '✔  I UNDERSTAND — PROCEED', {
      fontSize: '13px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(83);

    const proceedZone = this.add.rectangle(180, btnY + 23, 250, 46, 0, 0)
      .setInteractive({ useHandCursor: true }).setDepth(84);

    proceedZone.on('pointerover', () => {
      btnBg.clear().fillStyle(0xffd060, 1).fillRoundedRect(55, btnY, 250, 46, 12);
    });
    proceedZone.on('pointerout', () => {
      btnBg.clear().fillStyle(0xffaa00, 1).fillRoundedRect(55, btnY, 250, 46, 12);
    });
    proceedZone.on('pointerdown', () => {
      this.networkAcknowledged = true;
      // Destroy all overlay objects
      [dim, card, div, proceedZone, btnBg, btnLabel].forEach(o => o.destroy());
      this.goToStart();
    });

    this.tweens.add({
      targets: btnBg, alpha: 0.82, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Back to games
    this.add.text(180, 506, '← Back to games', {
      fontSize: '11px', color: '#555555',
    }).setOrigin(0.5).setDepth(82)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function(this: Phaser.GameObjects.Text) { this.setColor('#888888'); })
      .on('pointerout',  function(this: Phaser.GameObjects.Text) { this.setColor('#555555'); })
      .on('pointerdown', () => { window.location.href = 'https://wintapgames.com/games'; });
  }

  // ─── Progress ─────────────────────────────────────────────────────────────

  private onProgress(value: number) {
    this.loadProgress = value;
    const pct  = Math.round(value * 100);
    const barY = 430, barW = 300;
    const fill = Math.max(barW * value, value > 0 ? 18 : 0);

    this.progressBarGlow.clear();
    this.progressBarGlow.fillStyle(0xffaa00, 0.15);
    this.progressBarGlow.fillRoundedRect(30, barY - 2, fill, 22, 9);

    this.progressBarFill.clear();
    this.progressBarFill.fillStyle(0xffaa00, 1);
    this.progressBarFill.fillRoundedRect(30, barY, fill, 18, 9);

    this.percentText?.setText(`${pct}%`);

    const msgs: Record<number, string> = {
      10: 'Loading background...', 30: 'Loading ball assets...',
      50: 'Loading player sprites...', 70: 'Loading UI assets...',
      90: 'Almost ready...', 100: 'Ready to play!',
    };
    const milestone = [10, 30, 50, 70, 90, 100].find(m => pct >= m);
    if (milestone && msgs[milestone]) this.loadingText?.setText(msgs[milestone]);

    if (pct > 20 && !this.previewAdded && this.textures.exists('ball')) {
      this.previewAdded = true;
      this.ballPreview  = this.add.image(180, 285, 'ball').setScale(0.18).setDepth(14);
      this.tweens.add({ targets: this.ballPreview, angle: 360, duration: 2000, repeat: -1, ease: 'Linear' });
    }
  }

  private onComplete() {
    console.log('✅ All assets loaded');
    this.assetsLoaded = true;
    this.loadingText?.setText('Ready!').setColor('#00ff88');
    this.percentText?.setText('100%');
    this.progressBarFill.clear();
    this.progressBarFill.fillStyle(0x00ff88, 1);
    this.progressBarFill.fillRoundedRect(30, 430, 300, 18, 9);

    if (this.serverOk)          this.statusText?.setText('Server connected ✓');
    else if (!this.serverChecked) this.statusText?.setText('Waiting for server...');

    this.tryProceed();
  }

  // ─── Loading UI ───────────────────────────────────────────────────────────

  private createLoadingUI() {
    this.cameras.main.setBackgroundColor('#05050f');
    this.createStarField();
    this.scheduleShootingStars();

    this.add.text(180, 36, 'BALL CRUSH', {
      fontSize: '30px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, 'LOADING', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 5,
    }).setOrigin(0.5).setDepth(10);

    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.2);
    div.beginPath(); div.moveTo(20, 80); div.lineTo(340, 80); div.strokePath();

    const card = this.add.graphics().setDepth(10);
    card.fillStyle(0x0d2b0d, 0.9);
    card.fillRoundedRect(60, 92, 240, 56, 12);
    card.lineStyle(1.5, 0xffaa00, 0.6);
    card.strokeRoundedRect(60, 92, 240, 56, 12);

    const strip = this.add.graphics().setDepth(11);
    strip.fillStyle(0xffaa00, 0.10);
    strip.fillRoundedRect(60, 92, 240, 18, { tl: 12, tr: 12, bl: 0, br: 0 });

    this.add.text(100, 108, '⚽', { fontSize: '28px' }).setOrigin(0.5).setDepth(12);
    this.add.text(122, 102, this.displayName || this.username, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setDepth(12);
    this.add.text(122, 120, `@${this.username}`, {
      fontSize: '10px', color: '#ffaa00',
    }).setDepth(12);

    this.buildOrb();
    this.radarGfx = this.add.graphics().setDepth(9);

    const barY  = 430;
    const barBg = this.add.graphics().setDepth(10);
    barBg.fillStyle(0x111111, 1);
    barBg.fillRoundedRect(30, barY, 300, 18, 9);
    barBg.lineStyle(1, 0xffaa00, 0.25);
    barBg.strokeRoundedRect(30, barY, 300, 18, 9);

    this.progressBarGlow = this.add.graphics().setDepth(10);
    this.progressBarFill = this.add.graphics().setDepth(11);

    this.percentText = this.add.text(180, barY + 9, '0%', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    this.loadingText = this.add.text(180, barY + 28, 'Loading assets...', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(10);

    this.statusText = this.add.text(180, barY + 46, 'Connecting to server...', {
      fontSize: '11px', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(10);

    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0x000000, 0.5);
    tipBg.fillRoundedRect(30, 498, 300, 36, 9);
    tipBg.lineStyle(1, 0xffaa00, 0.15);
    tipBg.strokeRoundedRect(30, 498, 300, 36, 9);

    const tips = [
      '💡 Entry fee is $1.00 per match',
      '💡 Winner takes $1.50',
      '💡 Fee is refunded if no match found',
      '💡 Opponent leaving refunds your fee',
    ];
    this.add.text(180, 516, tips[Phaser.Math.Between(0, tips.length - 1)], {
      fontSize: '10px', color: '#888888',
    }).setOrigin(0.5).setDepth(11);

    const statsY = 548;
    ([['🎮', 'MATCH', '1v1'], ['💰', 'ENTRY', '$1.00'], ['🏆', 'PRIZE', '$1.50']] as const).forEach(([icon, label, value], i) => {
      const sx     = 65 + i * 115;
      const statBg = this.add.graphics().setDepth(10);
      statBg.fillStyle(0x000000, 0.55);
      statBg.fillRoundedRect(sx - 44, statsY - 14, 88, 44, 8);
      statBg.lineStyle(1, 0xffaa00, 0.2);
      statBg.strokeRoundedRect(sx - 44, statsY - 14, 88, 44, 8);
      this.add.text(sx, statsY - 2,  `${icon} ${value}`, { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11);
      this.add.text(sx, statsY + 14, label, { fontSize: '9px', color: '#666666', letterSpacing: 2 }).setOrigin(0.5).setDepth(11);
    });

    this.add.text(180, 622, 'Ball Crush v1.0.0  ·  wintapgames.com', {
      fontSize: '9px', color: '#333333',
    }).setOrigin(0.5).setDepth(10);
  }

  private buildOrb() {
    const cx = 180, cy = 285;
    [95, 74, 55].forEach((r, i) => {
      this.add.circle(cx, cy, r, 0xffaa00, 0.025 + i * 0.015).setDepth(8);
    });
    this.orbGlow = this.add.circle(cx, cy, 40, 0xffaa00, 0.95).setDepth(10);
    this.add.circle(cx, cy, 26, 0xffd060, 0.75).setDepth(11);
    this.add.circle(cx, cy, 12, 0xffffff, 0.45).setDepth(12);
    this.tweens.add({ targets: this.orbGlow, scaleX: 1.1, scaleY: 1.1, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const icon = this.add.text(cx, cy, '⚽', { fontSize: '26px' }).setOrigin(0.5).setDepth(13);
    this.tweens.add({ targets: icon, angle: 360, duration: 3000, repeat: -1, ease: 'Linear' });
    const colors = [0xffaa00, 0xff6600, 0xffcc44, 0xff8800, 0xffd080, 0xff9933];
    colors.forEach((col, i) => {
      const b = this.add.circle(cx, cy, i % 2 === 0 ? 4 : 3, col, 0.9).setDepth(10);
      this.orbitBalls.push(b);
    });
  }

  // ─── Star field ───────────────────────────────────────────────────────────

  private createStarField() {
    const defs = [
      { count: 80, radius: 1,   speedMin: 14, speedMax: 22, alphaMin: 0.18, alphaMax: 0.38, color: 0xaabbff },
      { count: 45, radius: 1.4, speedMin: 30, speedMax: 46, alphaMin: 0.42, alphaMax: 0.68, color: 0xddeeff },
      { count: 20, radius: 2,   speedMin: 60, speedMax: 80, alphaMin: 0.72, alphaMax: 1.00, color: 0xffffff },
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
        Phaser.Math.Between(2500, 7000), () => { this.spawnShootingStar(); next(); }
      );
    };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(10, 180);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(450, 850);
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

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  shutdown() {
    this.load.off('progress');
    this.load.off('complete');
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
  }
}