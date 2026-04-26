// src/scenes/flappy-bird/FlappyBirdLoaderScene.ts
import Phaser from 'phaser';

const SERVER_BASE = (import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com').replace(/\/$/, '');

export class FlappyBirdLoaderScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private assetsLoaded: boolean = false;
  private serverOk: boolean = false;
  private serverChecked: boolean = false;
  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 2500;

  private clouds: Array<{ obj: Phaser.GameObjects.Graphics; speed: number; y: number }> = [];
  private birdOrb!: Phaser.GameObjects.Sprite;
  private orbRings: Phaser.GameObjects.Graphics[] = [];
  private progressFill!: Phaser.GameObjects.Graphics;
  private progressGlow!: Phaser.GameObjects.Graphics;
  private loadingText!:  Phaser.GameObjects.Text;
  private percentText!:  Phaser.GameObjects.Text;
  private statusText!:   Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'FlappyBirdLoaderScene' });
  }

  init(data: { username: string; uid?: string }) {
    if (!data?.username) { this.scene.start('CookieScene'); return; }
    this.username  = data.username;
    this.uid       = data.uid || '';
    this.clouds    = [];
    this.orbRings  = [];
    this.assetsLoaded   = false;
    this.serverOk       = false;
    this.serverChecked  = false;
    this.loadStartTime  = Date.now();
  }

  preload() {
    this.createLoadingUI();
    this.checkServer();

    this.load.on('progress', (v: number) => this.onProgress(v));
    this.load.on('complete',  ()          => this.onComplete());

    this.load.image('background',    'assets/backgrounds/bg.png');
    this.load.image('background-alt','assets/backgrounds/bg2.jpg');
    this.load.image('bird-frame1',   'assets/bird/frame-1.png');
    this.load.image('bird-frame2',   'assets/bird/frame-2.png');
    this.load.image('pipe',          'assets/pipe/pipe-green.png');
    this.load.image('base',          'assets/base/base.png');
    this.load.image('blue-button',   'assets/buttons/blue-button.png');

    this.load.on('loaderror', (f: any) => console.warn('\u26a0\ufe0f Missing:', f.key));
  }

  create() {}

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.clouds.forEach(c => {
      c.obj.x -= c.speed * dt;
      if (c.obj.x < -120) c.obj.x = 400;
    });
    this.orbRings.forEach((ring, i) => {
      ring.alpha = 0.15 + 0.1 * Math.sin(Date.now() / 600 + i * 1.2);
    });
  }

  // ── Server check ─────────────────────────────────────────────────────────
  private async checkServer() {
    this.statusText?.setText('Connecting to server...');
    try {
      const res = await fetch(`${SERVER_BASE}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        this.serverOk = true;
        this.serverChecked = true;
        this.statusText?.setText('Server connected \u2713');
        this.tryProceed();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      this.serverChecked = true;
      this.serverOk = false;
      this.showServerError();
    }
  }

  private showServerError() {
    const dim = this.add.graphics().setDepth(50);
    dim.fillStyle(0x000000, 0.82);
    dim.fillRect(0, 0, 360, 640);

    const card = this.add.graphics().setDepth(51);
    card.fillStyle(0x001a00, 1);
    card.fillRoundedRect(30, 220, 300, 200, 16);
    card.lineStyle(2, 0xff3300, 0.9);
    card.strokeRoundedRect(30, 220, 300, 200, 16);

    this.add.text(180, 255, '\u26a0\ufe0f', { fontSize: '36px' }).setOrigin(0.5).setDepth(52);
    this.add.text(180, 298, 'SERVER UNAVAILABLE', {
      fontSize: '15px', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(52);
    this.add.text(180, 325, 'Could not connect to the\ngame server. Please check\nyour connection and try again.', {
      fontSize: '12px', color: '#cccccc', align: 'center',
    }).setOrigin(0.5).setDepth(52);

    const btnBg = this.add.graphics().setDepth(52);
    btnBg.fillStyle(0x33cc33, 1);
    btnBg.fillRoundedRect(90, 370, 180, 38, 10);
    this.add.text(180, 389, '\ud83d\udd04 RETRY', {
      fontSize: '14px', color: '#000000', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(53);

    this.tweens.add({ targets: btnBg, alpha: 0.75, duration: 700, yoyo: true, repeat: -1 });
    this.add.rectangle(180, 389, 180, 38, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(54)
      .on('pointerdown', () => { this.scene.restart(); });
  }

  private tryProceed() {
    if (this.assetsLoaded && this.serverOk) {
      const elapsed   = Date.now() - this.loadStartTime;
      const remaining = Math.max(0, this.MIN_LOAD_TIME - elapsed);
      this.time.delayedCall(remaining, () => {
        this.cameras.main.fadeOut(400, 255, 255, 255);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('FlappyBirdStartScene', { username: this.username, uid: this.uid });
        });
      });
    }
  }

  private createLoadingUI() {
    this.cameras.main.setBackgroundColor('#00BFFF');

    if (this.textures.exists('background')) {
      this.add.image(180, 320, 'background').setDisplaySize(360, 640).setDepth(-2);
    } else if (this.textures.exists('background-alt')) {
      this.add.image(180, 320, 'background-alt').setDisplaySize(360, 640).setDepth(-2);
    }

    this.spawnLoadingClouds();

    const titleBg = this.add.graphics().setDepth(10);
    titleBg.fillStyle(0xffffff, 0.25);
    titleBg.fillRoundedRect(30, 22, 300, 68, 14);
    titleBg.lineStyle(2, 0xffffff, 0.7);
    titleBg.strokeRoundedRect(30, 22, 300, 68, 14);

    this.add.text(180, 42, 'FLAPPY BIRD', {
      fontSize: '32px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#1a6a00', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(11);
    this.add.text(180, 74, 'ONLINE', {
      fontSize: '13px', color: '#ffffff', letterSpacing: 8,
      stroke: '#1a6a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    this.buildBirdOrb();

    const greetBg = this.add.graphics().setDepth(10);
    greetBg.fillStyle(0xffffff, 0.3);
    greetBg.fillRoundedRect(60, 340, 240, 46, 10);
    greetBg.lineStyle(1.5, 0xffffff, 0.6);
    greetBg.strokeRoundedRect(60, 340, 240, 46, 10);
    this.add.text(180, 355, `Hello, ${this.username}!`, {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#1a6a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);
    this.add.text(180, 375, 'Loading your game...', {
      fontSize: '11px', color: '#ffffff', stroke: '#006600', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);

    const barY = 408;
    const barBg = this.add.graphics().setDepth(10);
    barBg.fillStyle(0x000000, 0.3);
    barBg.fillRoundedRect(30, barY, 300, 22, 11);
    barBg.lineStyle(2, 0xffffff, 0.6);
    barBg.strokeRoundedRect(30, barY, 300, 22, 11);
    this.progressGlow = this.add.graphics().setDepth(10);
    this.progressFill = this.add.graphics().setDepth(11);
    this.percentText = this.add.text(180, barY + 11, '0%', {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#006600', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    this.loadingText = this.add.text(180, barY + 32, 'Loading assets...', {
      fontSize: '11px', color: '#ffffff', stroke: '#006600', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);
    this.statusText = this.add.text(180, barY + 50, 'Connecting to server...', {
      fontSize: '11px', color: '#ffffff', stroke: '#006600', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    const tipBg = this.add.graphics().setDepth(10);
    tipBg.fillStyle(0xffffff, 0.2);
    tipBg.fillRoundedRect(30, 474, 300, 30, 8);
    const tips = ['\ud83d\udca1 Tap or press space to flap', '\ud83d\udca1 Gap gets narrower as you score more', '\ud83d\udca1 Speed bumps every 30 seconds', '\ud83d\udca1 Top your high score to climb the leaderboard'];
    this.add.text(180, 489, tips[Phaser.Math.Between(0, tips.length - 1)], {
      fontSize: '10px', color: '#ffffff', stroke: '#006600', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);

    const infoY = 518;
    const infoBg = this.add.graphics().setDepth(10);
    infoBg.fillStyle(0x000000, 0.25);
    infoBg.fillRoundedRect(10, infoY, 340, 50, 10);
    [
      { x: 70,  icon: '\ud83c\udfae', label: 'MODE',  value: '1 Player' },
      { x: 180, icon: '\ud83d\udcb0', label: 'ENTRY', value: '$1.00' },
      { x: 290, icon: '\ud83c\udfc6', label: 'PRIZE', value: 'High Score' },
    ].forEach(s => {
      this.add.text(s.x, infoY + 12, `${s.icon} ${s.value}`, { fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#006600', strokeThickness: 2 }).setOrigin(0.5).setDepth(11);
      this.add.text(s.x, infoY + 30, s.label, { fontSize: '9px', color: '#ccffcc', letterSpacing: 2, stroke: '#006600', strokeThickness: 2 }).setOrigin(0.5).setDepth(11);
    });

    this.add.text(180, 580, 'wintapgames.com', { fontSize: '10px', color: '#ffffff', stroke: '#006600', strokeThickness: 2 }).setOrigin(0.5).setDepth(10);
  }

  private buildBirdOrb() {
    const cx = 180, cy = 230;
    for (let i = 0; i < 3; i++) {
      const r = this.add.graphics().setDepth(8);
      r.lineStyle(2, 0xffffff, 0.2);
      r.strokeCircle(cx, cy, 52 + i * 18);
      this.orbRings.push(r);
    }
    const orb = this.add.graphics().setDepth(9);
    orb.fillStyle(0xffffff, 0.9);
    orb.fillCircle(cx, cy, 44);
    orb.lineStyle(3, 0x88ddff, 0.8);
    orb.strokeCircle(cx, cy, 44);
    this.tweens.add({ targets: orb, scaleX: 1.06, scaleY: 1.06, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (this.textures.exists('bird-frame1')) {
      this.birdOrb = this.add.sprite(cx, cy, 'bird-frame1').setScale(0.15).setDepth(10);
      if (!this.anims.exists('fly-load')) {
        this.anims.create({ key: 'fly-load', frames: [{ key: 'bird-frame1' }, { key: 'bird-frame2' }], frameRate: 6, repeat: -1 });
      }
      this.birdOrb.play('fly-load');
      this.tweens.add({ targets: this.birdOrb, y: cy - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.add.text(cx, cy, '\ud83d\udc26', { fontSize: '40px' }).setOrigin(0.5).setDepth(10);
    }
  }

  private spawnLoadingClouds() {
    const cloudDefs = [
      { x: 60,  y: 110, w: 90,  h: 28, alpha: 0.55, speed: 12 },
      { x: 220, y: 95,  w: 110, h: 32, alpha: 0.45, speed: 8  },
      { x: 320, y: 120, w: 70,  h: 22, alpha: 0.5,  speed: 15 },
      { x: 10,  y: 140, w: 80,  h: 24, alpha: 0.4,  speed: 10 },
      { x: 160, y: 160, w: 100, h: 28, alpha: 0.35, speed: 6  },
      { x: 360, y: 105, w: 85,  h: 26, alpha: 0.5,  speed: 11 },
    ];
    cloudDefs.forEach(def => {
      const g = this.add.graphics().setDepth(2);
      g.x = def.x; g.y = def.y;
      g.fillStyle(0xffffff, def.alpha);
      g.fillEllipse(0, 0, def.w, def.h);
      g.fillEllipse(-def.w * 0.2, -def.h * 0.3, def.w * 0.6, def.h * 0.7);
      g.fillEllipse(def.w * 0.15, -def.h * 0.25, def.w * 0.5, def.h * 0.6);
      this.clouds.push({ obj: g, speed: def.speed, y: def.y });
    });
  }

  private onProgress(v: number) {
    const pct  = Math.round(v * 100);
    const barY = 408, barW = 300;
    const fill = Math.max(barW * v, v > 0 ? 22 : 0);
    this.progressGlow.clear();
    this.progressGlow.fillStyle(0xffffff, 0.3);
    this.progressGlow.fillRoundedRect(30, barY - 2, fill, 26, 11);
    this.progressFill.clear();
    this.progressFill.fillStyle(0x33cc33, 1);
    this.progressFill.fillRoundedRect(30, barY, fill, 22, 11);
    this.percentText?.setText(`${pct}%`);
    const msgs: Record<number, string> = { 10: 'Loading sky...', 30: 'Loading bird...', 55: 'Loading pipes...', 75: 'Loading ground...', 90: 'Almost ready!', 100: '\u2705 Ready!' };
    const m = [10,30,55,75,90,100].find(n => pct >= n);
    if (m && msgs[m]) this.loadingText?.setText(msgs[m]);
  }

  private onComplete() {
    this.assetsLoaded = true;
    this.progressFill.clear();
    this.progressFill.fillStyle(0x33ee33, 1);
    this.progressFill.fillRoundedRect(30, 408, 300, 22, 11);
    this.loadingText?.setText('\u2705 Ready!');
    this.percentText?.setText('100%');
    if (this.serverOk) {
      this.statusText?.setText('Server connected \u2713');
      this.tryProceed();
    } else if (!this.serverChecked) {
      this.statusText?.setText('Waiting for server...');
    }
  }

  shutdown() {
    this.load.off('progress');
    this.load.off('complete');
  }
}