// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';

const SERVER = {
  WIDTH:           360,
  HEIGHT:          640,
  PADDLE_HALF_W:    50,
  PADDLE_HALF_H:    10,
  BOTTOM_PADDLE_Y: 550,
  TOP_PADDLE_Y:     50,
  BALL_RADIUS:      10,
};

interface GameState {
  ball:    { x: number; y: number };
  paddles: { my: number; opponent: number };
  health:  { my: number; opponent: number };
  score:   { my: number; opponent: number };
}

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  private uid:      string = '';
  private roomId:   string = '';
  private myRole: 'bottom' | 'top' = 'bottom';

  private socket!: Socket;
  private lastSentPaddleX: number = 180;

  private myPaddle!:       Phaser.GameObjects.Rectangle;
  private opponentPaddle!: Phaser.GameObjects.Rectangle;
  private ball!:           Phaser.GameObjects.Arc;

  private targetBallX: number = 180;
  private targetBallY: number = 320;

  private scoreText!:         Phaser.GameObjects.Text;
  private myHealthBars:       Phaser.GameObjects.Rectangle[] = [];
  private opponentHealthBars: Phaser.GameObjects.Rectangle[] = [];
  private waitingText?:       Phaser.GameObjects.Text;

  private pingWarningBanner?: Phaser.GameObjects.Text;
  private pingWarningTimer?:  Phaser.Time.TimerEvent;
  private lagOverlay?:        Phaser.GameObjects.Graphics;
  private lagText?:           Phaser.GameObjects.Text;
  private lagFreezeActive:    boolean = false;
  private lagFreezeTimer?:    Phaser.Time.TimerEvent;

  private gameActive:    boolean = false;
  private currentScore:  number  = 0;
  private gameStartTime: number  = 0;

  private pointerActive: boolean = false;
  private pointerX:      number  = 180;
  private inputLocked:   boolean = true;
  private cursors!:      Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly moveSpeed: number = 6;

  private actionButtons: Phaser.GameObjects.Container[] = [];

  // In-game ping tracking
  private pingHistory:     number[] = [];
  private avgPing:         number   = 0;
  private pingIndicator!:  Phaser.GameObjects.Text;
  private pingTriangle?:   Phaser.GameObjects.Container;
  private wasDisconnected: boolean  = false;

  private myPaddleY:  number = SERVER.BOTTOM_PADDLE_Y;
  private oppPaddleY: number = SERVER.TOP_PADDLE_Y;

  private readonly MIN_PADDLE_X = SERVER.PADDLE_HALF_W;
  private readonly MAX_PADDLE_X = SERVER.WIDTH - SERVER.PADDLE_HALF_W;
  private readonly CENTER_X     = SERVER.WIDTH / 2;

  private frameCount: number = 0;
  private stateCount: number = 0;

  constructor() { super({ key: 'BallCrushGameScene' }); }

  init(data: { username: string; uid: string; lobbyId: string; role: 'bottom' | 'top' }) {
    this.username        = data.username || 'Player';
    this.uid             = data.uid      || '';
    this.roomId          = data.lobbyId;
    this.myRole          = data.role     || 'bottom';
    this.actionButtons   = [];
    this.pingHistory     = [];
    this.avgPing         = 0;
    this.wasDisconnected = false;
    console.log(`⚽ BallCrushGameScene | role=${this.myRole} | room=${this.roomId}`);
  }

  create() {
    this.gameStartTime      = Date.now();
    this.lastSentPaddleX    = this.CENTER_X;
    this.inputLocked        = true;
    this.pointerActive      = false;
    this.gameActive         = false;
    this.stateCount         = 0;
    this.frameCount         = 0;
    this.lagFreezeActive    = false;
    this.myHealthBars       = [];
    this.opponentHealthBars = [];

    if (this.myRole === 'bottom') {
      this.myPaddleY  = SERVER.BOTTOM_PADDLE_Y;
      this.oppPaddleY = SERVER.TOP_PADDLE_Y;
    } else {
      this.myPaddleY  = SERVER.HEIGHT - SERVER.TOP_PADDLE_Y;
      this.oppPaddleY = SERVER.HEIGHT - SERVER.BOTTOM_PADDLE_Y;
    }

    if (this.textures.exists('ball-background')) {
      this.add.image(180, 320, 'ball-background').setDisplaySize(360, 640).setDepth(-1);
    } else {
      this.cameras.main.setBackgroundColor('#1a3a1a');
    }

    this.addBackgroundEffects();
    this.createGameObjects();
    this.createUI();
    this.setupInput();
    this.createActionButtons();
    this.connectSocket();
  }

  // ─── Socket ──────────────────────────────────────────────────────────────────

  private connectSocket() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log(`🔌 Socket connected: ${this.socket.id}`);
      this.socket.emit('joinRoom', {
        roomId: this.roomId, username: this.username, uid: this.uid, role: this.myRole,
      });
    });

    this.socket.on('ping_check', () => {
      this.socket.emit('pong_check');
    });

    // Good ping — only sent to this socket
    this.socket.on('pingUpdate', ({ rtt }: { rtt: number }) => {
      this.pingHistory.push(rtt);
      if (this.pingHistory.length > 5) this.pingHistory.shift();
      this.avgPing = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
      this.updatePingIndicator();
    });

    // Bad ping — broadcast to room so both players see warning
    this.socket.on('pingWarning', ({ socketId, rtt }: { socketId: string; rtt: number }) => {
      if (socketId === this.socket.id) {
        this.pingHistory.push(rtt);
        if (this.pingHistory.length > 5) this.pingHistory.shift();
        this.avgPing = Math.round(this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length);
        this.updatePingIndicator();
        if (rtt > 500) this.activateLagFreeze(rtt);
      } else {
        if (rtt > 500) this.showFloatingMsg(`⚠️ Opponent unstable (${rtt}ms)`, '#ffaa00', 3000);
      }
    });

    this.socket.on('pingKickWarning', (data: { rtt: number; strikes: number; maxStrikes: number; remaining: number; message: string }) => {
      this.showFloatingMsg(`📶 ${data.message}`, data.remaining <= 1 ? '#ff2222' : '#ff8800', 4000);
      this.cameras.main.flash(300, 255, 0, 0, 0.3);
    });

    this.socket.on('kickedForPing', (data: { rtt: number; message: string }) => {
      this.gameActive  = false;
      this.inputLocked = true;
      this.clearLagFreeze();
      this.hidePingTriangle();
      const overlay = this.add.graphics().setDepth(200);
      overlay.fillStyle(0x000000, 0.88);
      overlay.fillRect(0, 0, 360, 640);
      this.add.text(180, 260, '📶', { fontSize: '52px' }).setOrigin(0.5).setDepth(201);
      this.add.text(180, 320, 'DISCONNECTED', {
        fontSize: '22px', color: '#ff4444', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(201);
      this.add.text(180, 355, `High ping: ${data.rtt}ms`, {
        fontSize: '14px', color: '#ffaa00', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(201);
      this.add.text(180, 385, 'Your opponent has been\nawarded the win.', {
        fontSize: '13px', color: '#cccccc', align: 'center', lineSpacing: 4,
      }).setOrigin(0.5).setDepth(201);
      this.time.delayedCall(3500, () => this.returnToMenu());
    });

    this.socket.on('opponentKickedForPing', (data: { kickedUsername: string; rtt: number }) => {
      this.showFloatingMsg(`${data.kickedUsername} disconnected (ping: ${data.rtt}ms) — you win!`, '#66ff88', 4000);
    });

    this.socket.on('roomJoined', () => {
      if (this.waitingText) this.waitingText.setText('Waiting for opponent...');
    });

    this.socket.on('gameStart', ({ opponentName }: { opponentName: string }) => {
      console.log(`🎮 gameStart — opponent: ${opponentName}`);
      if (this.waitingText) { this.waitingText.destroy(); this.waitingText = undefined; }
      this.myPaddle.x      = this.CENTER_X;
      this.lastSentPaddleX = this.CENTER_X;
      this.pointerActive   = false;
      this.pointerX        = this.CENTER_X;
      this.inputLocked     = false;
      this.gameActive      = true;
      this.opponentPaddle.setVisible(true);
      const label = this.children.getByName('opponentLabel') as Phaser.GameObjects.Text;
      if (label) label.setText(opponentName);
      const vs = this.add.text(180, 300, `VS ${opponentName}`, {
        fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => vs.destroy());
    });

    this.socket.on('gameState', (state: GameState) => {
      if (!this.gameActive) return;
      this.stateCount++;

      this.targetBallX = state.ball.x;
      this.targetBallY = state.ball.y;

      if (this.ball) {
        const dist = Math.hypot(this.targetBallX - this.ball.x, this.targetBallY - this.ball.y);
        if (dist > 60 || this.lagFreezeActive) {
          this.ball.x = this.targetBallX;
          this.ball.y = this.targetBallY;
        }
      }

      // Snap opponent paddle — lerp only for micro-movements to avoid jitter
      if (this.opponentPaddle) {
        const diff = state.paddles.opponent - this.opponentPaddle.x;
        if (Math.abs(diff) > 8) {
          this.opponentPaddle.x = state.paddles.opponent;
        } else {
          this.opponentPaddle.x += diff * 0.8;
        }
      }

      // NOTE: do NOT reconcile myPaddle — client is authority on own paddle

      if (this.stateCount <= 5 || this.stateCount % 120 === 0) {
        console.log(`[${this.myRole}] #${this.stateCount} ball=(${state.ball.x.toFixed(1)},${state.ball.y.toFixed(1)}) hp my=${state.health.my} opp=${state.health.opponent}`);
      }
    });

    this.socket.on('ballReset', ({ ball }: { ball: { x: number; y: number } }) => {
      this.targetBallX = ball.x;
      this.targetBallY = ball.y;
      if (this.ball) { this.ball.x = ball.x; this.ball.y = ball.y; }
      console.log(`[${this.myRole}] ballReset snap → (${ball.x}, ${ball.y})`);
    });

    this.socket.on('paddleHit', ({ role, score }: { role: 'bottom' | 'top'; score: number }) => {
      const isMine = role === this.myRole;
      if (isMine) {
        this.currentScore = score;
        this.scoreText?.setText(`Score: ${score}`);
        this.showHitEffect(this.myPaddle.x, this.myPaddle.y);
        this.tweens.add({ targets: this.myPaddle, scaleX: 1.2, scaleY: 0.6, duration: 80, yoyo: true });
      } else {
        this.showHitEffect(this.opponentPaddle.x, this.opponentPaddle.y);
        this.tweens.add({ targets: this.opponentPaddle, scaleX: 1.2, scaleY: 0.6, duration: 80, yoyo: true });
      }
      this.cameras.main.shake(50, 0.003);
    });

    this.socket.on('point', ({ scorer, health }: {
      scorer: 'bottom' | 'top'; health: { bottom: number; top: number };
    }) => {
      const myH  = this.myRole === 'bottom' ? health.bottom : health.top;
      const oppH = this.myRole === 'bottom' ? health.top    : health.bottom;
      this.syncHealthBars(myH, oppH);
      if (scorer === this.myRole) {
        this.cameras.main.flash(300, 0, 255, 0, 0.4);
      } else {
        this.cameras.main.flash(300, 255, 0, 0, 0.5);
        this.cameras.main.shake(200, 0.008);
      }
    });

    this.socket.on('speedBump', ({ multiplier }: { multiplier: number }) => {
      this.cameras.main.flash(500, 255, 255, 255, 0.3);
      const t = this.add.text(180, 200, `SPEED x${multiplier.toFixed(1)}!`, {
        fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#ff0000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
    });

    this.socket.on('gameOver', ({ winnerRole, winnerUsername, winnerUid }: {
      winnerRole: 'bottom' | 'top'; winnerUsername: string; winnerUid: string;
    }) => {
      this.handleGameOver(winnerRole === this.myRole, winnerUsername, winnerUid);
    });

    this.socket.on('drawOffer', () => {
      if (!this.gameActive) return;
      const accepted = confirm('Your opponent offers a draw. Accept?');
      this.socket.emit('respondDraw', { roomId: this.roomId, uid: this.uid, accept: accepted });
    });

    this.socket.on('drawDeclined', () => {
      this.showFloatingMsg('Draw declined', '#ff8800', 2000);
    });

    this.socket.on('drawAccepted', () => {
      this.gameActive  = false;
      this.inputLocked = true;
      this.clearLagFreeze();
      this.socket.disconnect();
      this.scene.start('BallCrushGameOverScene', {
        score: this.currentScore, won: false, winnerUsername: 'Draw',
        winnerUid: '', uid: this.uid, username: this.username,
        duration: Math.floor((Date.now() - this.gameStartTime) / 1000),
        lobbyId: this.roomId,
      });
    });

    this.socket.on('error', ({ message }: { message: string }) => {
      console.error(`[ERROR][${this.myRole}] ${message}`);
    });

    // Distinguish: did WE drop or did the server/opponent cause this?
    this.socket.on('disconnect', (reason: string) => {
      if (!this.gameActive) return;
      this.gameActive = false;
      this.clearLagFreeze();
      this.hidePingTriangle();

      const weDropped = ['transport close', 'transport error', 'ping timeout'].includes(reason);

      if (weDropped) {
        this.wasDisconnected = true;
        const overlay = this.add.graphics().setDepth(200);
        overlay.fillStyle(0x000000, 0.88);
        overlay.fillRect(0, 0, 360, 640);
        this.add.text(180, 240, '📶', { fontSize: '52px' }).setOrigin(0.5).setDepth(201);
        this.add.text(180, 300, 'CONNECTION LOST', {
          fontSize: '20px', color: '#ff4444', fontStyle: 'bold',
          stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(201);
        this.add.text(180, 334, 'Your internet connection dropped.\nThe game has ended.', {
          fontSize: '13px', color: '#cccccc', align: 'center', lineSpacing: 4,
        }).setOrigin(0.5).setDepth(201);
        this.add.text(180, 374, `(${reason})`, {
          fontSize: '10px', color: '#555555',
        }).setOrigin(0.5).setDepth(201);
      } else {
        this.add.text(180, 320, 'Opponent disconnected!', {
          fontSize: '20px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5);
      }

      this.time.delayedCall(3500, () => this.returnToMenu());
    });
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  update() {
    this.frameCount++;

    if (this.ball && !this.lagFreezeActive) {
      const dx = this.targetBallX - this.ball.x;
      const dy = this.targetBallY - this.ball.y;
      this.ball.x += dx * 0.45;
      this.ball.y += dy * 0.45;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) this.ball.angle += 4;
    }

    if (!this.gameActive || this.inputLocked || this.lagFreezeActive || !this.myPaddle) return;

    let newX = this.myPaddle.x;
    if (this.cursors?.left?.isDown)  newX = Math.max(this.MIN_PADDLE_X, newX - this.moveSpeed);
    if (this.cursors?.right?.isDown) newX = Math.min(this.MAX_PADDLE_X, newX + this.moveSpeed);
    if (this.pointerActive)          newX = Phaser.Math.Clamp(this.pointerX, this.MIN_PADDLE_X, this.MAX_PADDLE_X);

    this.myPaddle.x = newX;

    if (Math.abs(newX - this.lastSentPaddleX) > 0.5) {
      this.socket?.emit('paddleMove', { x: newX });
      this.lastSentPaddleX = newX;
    }
  }

  // ─── Action buttons ───────────────────────────────────────────────────────────

  private createActionButtons() {
    const btnY    = 610;
    const btnDefs = [
      { x: 54,  label: '🏳', title: 'Resign', color: 0x8b0000, action: () => this.resignGame()  },
      { x: 180, label: '🤝', title: 'Draw',   color: 0x003580, action: () => this.offerDraw()   },
      { x: 306, label: '🚩', title: 'Report', color: 0x4a0070, action: () => this.reportGame()  },
    ];

    btnDefs.forEach(def => {
      const bg   = this.add.rectangle(0, 0, 90, 26, def.color).setStrokeStyle(1, 0xffffff, 0.25);
      const icon = this.add.text(-22, 0, def.label, { fontSize: '13px' }).setOrigin(0.5);
      const lbl  = this.add.text(8, 0, def.title, {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const c = this.add.container(def.x, btnY, [bg, icon, lbl]);
      c.setSize(90, 26).setInteractive({ useHandCursor: true }).setDepth(50).setAlpha(0.85);
      c.on('pointerover',  () => { bg.setAlpha(0.7); c.setAlpha(1); });
      c.on('pointerout',   () => { bg.setAlpha(1);   c.setAlpha(0.85); });
      c.on('pointerdown',  () => { bg.setAlpha(0.4); });
      c.on('pointerup',    () => { bg.setAlpha(1); def.action(); });
      this.actionButtons.push(c);
    });
  }

  private resignGame() {
    if (!this.gameActive) return;
    if (!confirm('Resign this game? This counts as a loss.')) return;
    this.gameActive = false;
    this.socket?.emit('resign', { roomId: this.roomId, uid: this.uid });
    this.returnToMenu();
  }

  private offerDraw() {
    if (!this.gameActive) return;
    if (!confirm('Offer a draw to your opponent?')) return;
    this.socket?.emit('offerDraw', { roomId: this.roomId, uid: this.uid });
    this.showFloatingMsg('Draw offer sent!', '#66aaff', 3000);
  }

  private reportGame() {
    const reason = prompt('Describe the issue (cheating, abuse, bug):');
    if (!reason?.trim()) return;
    this.socket?.emit('reportGame', {
      roomId: this.roomId, reporterUid: this.uid, reason: reason.trim(),
    });
    this.showFloatingMsg('Report submitted ✓', '#aaffaa', 3000);
  }

  private showFloatingMsg(msg: string, color: string, duration: number = 2000) {
    const t = this.add.text(180, 575, msg, {
      fontSize: '13px', color, stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#000000bb', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({
      targets: t, y: 530, alpha: 0, duration, ease: 'Power2',
      onComplete: () => t.destroy(),
    });
  }

  // ─── Input ────────────────────────────────────────────────────────────────────

  private setupInput() {
    if (this.input.keyboard) this.cursors = this.input.keyboard.createCursorKeys();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.inputLocked || this.lagFreezeActive) return;
      this.pointerActive = true; this.pointerX = p.x;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.inputLocked || this.lagFreezeActive || !p.isDown) return;
      this.pointerActive = true; this.pointerX = p.x;
    });
    this.input.on('pointerup',  () => { this.pointerActive = false; });
    this.input.on('pointerout', () => { this.pointerActive = false; });
  }

  // ─── Game objects ──────────────────────────────────────────────────────────────

  private createGameObjects() {
    const PW = SERVER.PADDLE_HALF_W * 2;
    const PH = SERVER.PADDLE_HALF_H * 2;

    this.myPaddle = this.add.rectangle(
      this.CENTER_X, this.myPaddleY, PW, PH, 0x00cc44
    ).setDepth(10);

    this.add.text(180, this.myPaddleY + 16, 'YOU', {
      fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.opponentPaddle = this.add.rectangle(
      this.CENTER_X, this.oppPaddleY, PW, PH, 0xff4444
    ).setDepth(10).setVisible(false);

    const oppLabelY = this.oppPaddleY < 320 ? this.oppPaddleY - 16 : this.oppPaddleY + 16;
    this.add.text(180, oppLabelY, 'OPPONENT', {
      fontSize: '12px', color: '#ff8888', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setName('opponentLabel');

    this.ball = this.add.arc(
      this.CENTER_X, 320, SERVER.BALL_RADIUS, 0, 360, false, 0xffaa00
    ).setDepth(5);
    this.ball.setStrokeStyle(2, 0xffffff, 0.3);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────────

  private createUI() {
    const myHpY  = this.myPaddleY  + (this.myPaddleY  > 320 ?  22 : -22);
    const oppHpY = this.oppPaddleY + (this.oppPaddleY < 320 ? -22 :  22);

    for (let i = 0; i < 5; i++) {
      this.myHealthBars.push(
        this.add.rectangle(20 + i * 24, myHpY, 18, 12, 0x00ff44)
      );
      this.opponentHealthBars.push(
        this.add.rectangle(20 + i * 24, oppHpY, 18, 12, 0xff4444)
      );
    }

    this.scoreText = this.add.text(180, 308, 'Score: 0', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    const hintY = this.myPaddleY + (this.myPaddleY > 320 ? -28 : 28);
    this.add.text(180, hintY, 'Drag or use arrow keys', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    this.waitingText = this.add.text(180, 320, 'Connecting...', {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Top-right ping dot — always visible
    this.pingIndicator = this.add.text(354, 4, '●', {
      fontSize: '11px', color: '#00ff88', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(100);
  }

  // ─── Health bars ─────────────────────────────────────────────────────────────

  private syncHealthBars(myHealth: number, oppHealth: number) {
    while (this.myHealthBars.length > myHealth) {
      const bar = this.myHealthBars.pop();
      if (bar) this.tweens.add({
        targets: bar, alpha: 0, scaleX: 0.2, duration: 200,
        onComplete: () => bar.destroy(),
      });
    }
    while (this.opponentHealthBars.length > oppHealth) {
      const bar = this.opponentHealthBars.pop();
      if (bar) this.tweens.add({
        targets: bar, alpha: 0, scaleX: 0.2, duration: 200,
        onComplete: () => bar.destroy(),
      });
    }
  }

  private showHitEffect(x: number, y: number) {
    const c = this.add.circle(x, y, 22, 0xffff00, 0.8);
    this.tweens.add({
      targets: c, scale: 1.8, alpha: 0, duration: 150,
      onComplete: () => c.destroy(),
    });
  }

  // ─── Ping indicator + triangle ────────────────────────────────────────────────

  private updatePingIndicator() {
    if (!this.pingIndicator) return;
    const p     = this.avgPing;
    const color = p > 400 ? '#ff2222' : p > 300 ? '#ff6600' : p > 150 ? '#ffdd00' : '#00ff88';
    const label = p > 150 ? `${p}ms` : '●';
    this.pingIndicator.setText(label).setColor(color);

    // Mid-screen warning triangle when ping is really bad
    if (p > 300) {
      this.showPingTriangle(p);
    } else {
      this.hidePingTriangle();
    }
  }

  private showPingTriangle(ping: number) {
    // Update label if already showing
    if (this.pingTriangle?.active) {
      const ms = this.pingTriangle.getAt(2) as Phaser.GameObjects.Text;
      if (ms) ms.setText(`${ping}ms`);
      return;
    }

    // Semi-transparent triangle centred above mid-field — won't block paddles
    const cx = 180, cy = 285;

    const g = this.add.graphics();
    g.fillStyle(0xff6600, 0.3);
    g.fillTriangle(cx, cy - 30, cx - 26, cy + 16, cx + 26, cy + 16);
    g.lineStyle(2, 0xff8800, 0.55);
    g.strokeTriangle(cx, cy - 30, cx - 26, cy + 16, cx + 26, cy + 16);

    const exclaim = this.add.text(cx, cy - 4, '!', {
      fontSize: '22px', color: '#ffcc00', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.7);

    const ms = this.add.text(cx, cy + 28, `${ping}ms`, {
      fontSize: '11px', color: '#ffaa44',
    }).setOrigin(0.5).setAlpha(0.65);

    this.pingTriangle = this.add.container(0, 0, [g, exclaim, ms]).setDepth(30);

    // Slow pulse — noticeable but not distracting
    this.tweens.add({
      targets: this.pingTriangle,
      alpha: 0.5,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private hidePingTriangle() {
    if (!this.pingTriangle?.active) return;
    this.tweens.killTweensOf(this.pingTriangle);
    const tri = this.pingTriangle;
    this.pingTriangle = undefined;
    this.tweens.add({
      targets: tri, alpha: 0, duration: 400,
      onComplete: () => tri.destroy(),
    });
  }

  // ─── Lag freeze ───────────────────────────────────────────────────────────────

  private activateLagFreeze(rtt: number) {
    if (this.lagFreezeActive || !this.gameActive) return;
    const dur = Math.min(rtt * 0.6, 1500);
    this.lagFreezeActive = true;
    this.inputLocked     = true;

    this.lagOverlay = this.add.graphics().setDepth(150);
    this.lagOverlay.fillStyle(0x000000, 0.55);
    this.lagOverlay.fillRect(0, 0, 360, 640);

    this.lagText = this.add.text(180, 310, '📶 Poor connection\nResyncing...', {
      fontSize: '16px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5).setDepth(151);
    this.tweens.add({
      targets: this.lagText, alpha: 0.4, duration: 400, yoyo: true, repeat: -1,
    });

    this.lagFreezeTimer = this.time.delayedCall(dur, () => this.clearLagFreeze());
  }

  private clearLagFreeze() {
    if (!this.lagFreezeActive) return;
    this.lagFreezeActive = false;
    if (this.ball) { this.ball.x = this.targetBallX; this.ball.y = this.targetBallY; }
    this.inputLocked = false;
    if (this.lagFreezeTimer) { this.lagFreezeTimer.destroy(); this.lagFreezeTimer = undefined; }
    if (this.lagOverlay) {
      this.tweens.add({
        targets: this.lagOverlay, alpha: 0, duration: 300,
        onComplete: () => { this.lagOverlay?.destroy(); this.lagOverlay = undefined; },
      });
    }
    if (this.lagText) {
      this.tweens.killTweensOf(this.lagText);
      this.tweens.add({
        targets: this.lagText, alpha: 0, duration: 300,
        onComplete: () => { this.lagText?.destroy(); this.lagText = undefined; },
      });
    }
  }

  // ─── Game over ────────────────────────────────────────────────────────────────

  private handleGameOver(won: boolean, winnerUsername: string, winnerUid: string) {
    this.gameActive  = false;
    this.inputLocked = true;
    this.clearLagFreeze();
    this.hidePingTriangle();
    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);
    this.socket?.disconnect();
    this.scene.start('BallCrushGameOverScene', {
      score: this.currentScore, won, winnerUsername, winnerUid,
      uid: this.uid, username: this.username, duration, lobbyId: this.roomId,
    });
    this.scene.stop();
  }

  private returnToMenu() {
    this.socket?.disconnect();
    this.scene.start('BallCrushStartScene', {
      username: this.username, uid: this.uid,
    });
  }

  // ─── Background ───────────────────────────────────────────────────────────────

  private addBackgroundEffects() {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0xffffff, 0.1);
    g.lineBetween(0, SERVER.HEIGHT / 2, SERVER.WIDTH, SERVER.HEIGHT / 2);

    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, 310);
      const y = Phaser.Math.Between(100, 540);
      const c = this.add.circle(x, y, 10, 0xffaa00, 0.05);
      this.tweens.add({
        targets: c, y: y + 20, alpha: 0.1,
        duration: 3000 + i * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  shutdown() {
    this.clearLagFreeze();
    this.hidePingTriangle();
    if (this.pingWarningTimer) this.pingWarningTimer.destroy();
    this.socket?.disconnect();
  }
}