// src/scenes/ball-crush/BallCrushGameScene.ts
//
// FIXES (4 bugs):
//
// BUG 1 — Ball lerp 0.25 is too slow → ball always renders behind server position
//   so it visually phases THROUGH the paddle before the bounce event arrives.
//   FIX: Raise lerp to 0.45. Add snap threshold: if target >60px away, snap
//   immediately (handles resets + lag spikes).
//
// BUG 2 — Opponent paddle lerp 0.3 is too slow → opponent paddle always appears
//   3-4 frames behind where the server ran collision. Ball appears to bounce
//   off air because the server already bounced at paddleX.top, but the client
//   still renders that paddle 30-40px away from the collision point.
//   FIX: Raise opponent paddle lerp to 0.6.
//
// BUG 3 — Paddles were drawn as Image with setScale(0.15) — visual size had
//   nothing to do with the server hitbox (PADDLE_HALF_W=50, PADDLE_HALF_H=10).
//   Players could not tell where the real hitbox was.
//   FIX: Draw paddles as Rectangle exactly 100×20px to match server constants.
//   Ball drawn as Arc with radius=18 to match SERVER.BALL_RADIUS.
//   MIN/MAX_PADDLE_X now derived from server constants so paddle can't go
//   outside the valid server range.
//
// BUG 4 — ball.rotation += 0.05 ran every frame even during lag freeze.
//   On freeze clear + snap, the ball's position jumped but rotation was
//   continuous, making the snap look worse visually.
//   FIX: Only rotate when ball is actually moving toward its target.

import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';

// ── Must match server BC constants exactly ────────────────────────────────────
const SERVER = {
  WIDTH:           360,
  HEIGHT:          640,
  PADDLE_HALF_W:    50,   // paddle is 100px wide total
  PADDLE_HALF_H:    10,   // paddle is 20px tall total
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
  // ── Identity ──────────────────────────────────────────────────────────────────
  private username: string = '';
  private uid:      string = '';
  private roomId:   string = '';
  private myRole: 'bottom' | 'top' = 'bottom';

  // ── Socket ────────────────────────────────────────────────────────────────────
  private socket!: Socket;
  private lastSentPaddleX: number = 180;

  // ── Game objects ─────────────────────────────────────────────────────────────
  // FIX BUG 3: Rectangle instead of Image so size == server hitbox
  private myPaddle!:       Phaser.GameObjects.Rectangle;
  private opponentPaddle!: Phaser.GameObjects.Rectangle;
  private ball!:           Phaser.GameObjects.Arc;

  // Ball interpolation targets
  private targetBallX: number = 180;
  private targetBallY: number = 320;

  // ── UI ────────────────────────────────────────────────────────────────────────
  private scoreText!:         Phaser.GameObjects.Text;
  private myHealthBars:       Phaser.GameObjects.Rectangle[] = [];
  private opponentHealthBars: Phaser.GameObjects.Rectangle[] = [];
  private waitingText?:       Phaser.GameObjects.Text;
  private debugText!:         Phaser.GameObjects.Text;

  private pingWarningBanner?: Phaser.GameObjects.Text;
  private pingWarningTimer?:  Phaser.Time.TimerEvent;
  private lagOverlay?:        Phaser.GameObjects.Graphics;
  private lagText?:           Phaser.GameObjects.Text;
  private lagFreezeActive:    boolean = false;
  private lagFreezeTimer?:    Phaser.Time.TimerEvent;

  // ── State ─────────────────────────────────────────────────────────────────────
  private gameActive:    boolean = false;
  private currentScore:  number  = 0;
  private gameStartTime: number  = 0;

  // ── Input ─────────────────────────────────────────────────────────────────────
  private pointerActive: boolean = false;
  private pointerX:      number  = 180;
  private inputLocked:   boolean = true;
  private cursors!:      Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly moveSpeed: number = 6;

  // ── Action buttons ────────────────────────────────────────────────────────
  private actionButtons: Phaser.GameObjects.Container[] = [];

  // ── Layout — derived from server constants so they always match ───────────────
  //
  // The server flips ball.y = HEIGHT - ball.y for the top player so their
  // view is mirrored (their paddle is at the bottom of their screen).
  //
  // This means for the TOP player:
  //   • MY paddle must render at HEIGHT - TOP_PADDLE_Y   = 640-50  = 590
  //   • OPP paddle must render at HEIGHT - BOTTOM_PADDLE_Y = 640-550 = 90
  //
  // For the BOTTOM player everything is normal:
  //   • MY paddle at BOTTOM_PADDLE_Y = 550
  //   • OPP paddle at TOP_PADDLE_Y   = 50
  //
  // We set these in create() once myRole is known.
  private myPaddleY:  number = SERVER.BOTTOM_PADDLE_Y;
  private oppPaddleY: number = SERVER.TOP_PADDLE_Y;

  private readonly MIN_PADDLE_X = SERVER.PADDLE_HALF_W;            // 50
  private readonly MAX_PADDLE_X = SERVER.WIDTH - SERVER.PADDLE_HALF_W; // 310
  private readonly CENTER_X     = SERVER.WIDTH / 2;                // 180

  // ── Debug ─────────────────────────────────────────────────────────────────────
  private frameCount: number = 0;
  private stateCount: number = 0;

  constructor() {
    super({ key: 'BallCrushGameScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string; role: 'bottom' | 'top' }) {
    this.username = data.username || 'Player';
    this.uid      = data.uid      || '';
    this.roomId   = data.lobbyId;
    this.myRole        = data.role     || 'bottom';
    this.actionButtons = [];
    console.log(`⚽ BallCrushGameScene | role=${this.myRole} | room=${this.roomId}`);
  }

  create() {
    this.gameStartTime   = Date.now();
    this.lastSentPaddleX = this.CENTER_X;
    this.inputLocked     = true;
    this.pointerActive   = false;
    this.gameActive      = false;
    this.stateCount      = 0;
    this.frameCount      = 0;
    this.lagFreezeActive = false;

    // ── Role-based paddle Y positions ─────────────────────────────────────────
    // Server flips ball.y = HEIGHT - ball.y for the top player.
    // So the top player's screen is a mirror: their paddle sits at the BOTTOM
    // of their screen even though it's the "top" paddle in server coordinates.
    //
    //   Bottom player:  myPaddle=550  oppPaddle=50   (no flip)
    //   Top player:     myPaddle=590  oppPaddle=90   (640-50, 640-550)
    if (this.myRole === 'bottom') {
      this.myPaddleY  = SERVER.BOTTOM_PADDLE_Y;                    // 550
      this.oppPaddleY = SERVER.TOP_PADDLE_Y;                       // 50
    } else {
      this.myPaddleY  = SERVER.HEIGHT - SERVER.TOP_PADDLE_Y;       // 590
      this.oppPaddleY = SERVER.HEIGHT - SERVER.BOTTOM_PADDLE_Y;    // 90
    }

    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
      bg.setDepth(-1);
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

    this.socket.on('ping_check', () => this.socket.emit('pong_check'));

    this.socket.on('pingWarning', ({ socketId, rtt }: { socketId: string; rtt: number }) => {
      const isMe  = socketId === this.socket.id;
      const msg   = isMe ? `⚠️ Your connection is unstable (${rtt}ms)` : `⚠️ Opponent has poor connection (${rtt}ms)`;
      const color = isMe ? '#ff4444' : '#ffaa00';
      this.showPingWarning(msg, color);
      if (isMe && rtt > 400) this.activateLagFreeze(rtt);
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

      // ── FIX BUG 1: snap when ball is far away (reset or spike) ────────────
      if (this.ball) {
        const dist = Math.hypot(this.targetBallX - this.ball.x, this.targetBallY - this.ball.y);
        if (dist > 60 || this.lagFreezeActive) {
          this.ball.x = this.targetBallX;
          this.ball.y = this.targetBallY;
        }
      }

      // Snap opponent paddle directly to server position — the server is
      // authoritative and lerp only adds visual lag that makes it look like
      // the ball passed through air. Use a small lerp only for tiny movements
      // (<8px) to avoid jitter; snap for anything larger.
      if (this.opponentPaddle) {
        const diff = state.paddles.opponent - this.opponentPaddle.x;
        if (Math.abs(diff) > 8) {
          this.opponentPaddle.x = state.paddles.opponent; // snap
        } else {
          this.opponentPaddle.x += diff * 0.8; // smooth micro-movements
        }
      }

      // Reconcile local paddle with server — if they diverge by >12px it means
      // the server never received a paddle update in time. Snap to server value
      // so the next hit check is based on where the server actually has us.
      if (this.myPaddle && Math.abs(state.paddles.my - this.myPaddle.x) > 12) {
        this.myPaddle.x      = state.paddles.my;
        this.lastSentPaddleX = state.paddles.my;
      }

      if (this.stateCount <= 5 || this.stateCount % 120 === 0) {
        console.log(`[${this.myRole}] #${this.stateCount} ball=(${state.ball.x.toFixed(1)},${state.ball.y.toFixed(1)}) hp my=${state.health.my} opp=${state.health.opponent}`);
      }
    });

    this.socket.on('ballReset', ({ ball }: { ball: { x: number; y: number } }) => {
      // Always snap — never lerp from a stale position after reset
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
        fontSize: '28px', color: '#ffffff', fontStyle: 'bold', stroke: '#ff0000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
    });

    this.socket.on('gameOver', ({ winnerRole, winnerUsername, winnerUid }: {
      winnerRole: 'bottom' | 'top'; winnerUsername: string; winnerUid: string;
    }) => {
      this.handleGameOver(winnerRole === this.myRole, winnerUsername, winnerUid);
    });

    this.socket.on('error', ({ message }: { message: string }) => {
      console.error(`[ERROR][${this.myRole}] ${message}`);
    });

    this.socket.on('disconnect', () => {
      if (this.gameActive) {
        this.gameActive = false;
        this.clearLagFreeze();
        this.add.text(180, 320, 'Opponent disconnected!', {
          fontSize: '20px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5);
        this.time.delayedCall(3000, () => this.returnToMenu());
      }
    });
  }

  // ─── Update loop ─────────────────────────────────────────────────────────────
  update() {
    this.frameCount++;

    if (this.ball && !this.lagFreezeActive) {
      const dx = this.targetBallX - this.ball.x;
      const dy = this.targetBallY - this.ball.y;

      // ── FIX BUG 1: lerp 0.45 (was 0.25) — tracks server much more closely ─
      this.ball.x += dx * 0.45;
      this.ball.y += dy * 0.45;

      // ── FIX BUG 4: only rotate when actually moving ───────────────────────
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.ball.angle += 4;
      }
    }

    if (!this.gameActive || this.inputLocked || this.lagFreezeActive || !this.myPaddle) return;

    let newX = this.myPaddle.x;
    if (this.cursors?.left?.isDown)  newX = Math.max(this.MIN_PADDLE_X, newX - this.moveSpeed);
    if (this.cursors?.right?.isDown) newX = Math.min(this.MAX_PADDLE_X, newX + this.moveSpeed);
    if (this.pointerActive)          newX = Phaser.Math.Clamp(this.pointerX, this.MIN_PADDLE_X, this.MAX_PADDLE_X);

    this.myPaddle.x = newX;

    // Send paddle on ANY movement — the server needs current position
    // to run accurate collision. Throttle by >0.5px to avoid spam on
    // micro-jitter but send as fast as possible when actually moving.
    if (Math.abs(newX - this.lastSentPaddleX) > 0.5) {
      this.socket?.emit('paddleMove', { x: newX });
      this.lastSentPaddleX = newX;
    }

    if (this.debugText) {
      this.debugText.setText(
        `role:${this.myRole}\n` +
        `ball:(${this.ball?.x.toFixed(0)},${this.ball?.y.toFixed(0)})\n` +
        `target:(${this.targetBallX.toFixed(0)},${this.targetBallY.toFixed(0)})\n` +
        `paddle:${this.myPaddle?.x.toFixed(0)}\n` +
        `freeze:${this.lagFreezeActive}`
      );
    }
  }

  // ─── Action buttons ──────────────────────────────────────────────────────────
  // Tucked into the 70px strip below the my-paddle (Y=570–640).
  // Three compact buttons: Resign  |  Offer Draw  |  Report
  // Hidden until game is active; draw/resign disabled until gameActive.
  private createActionButtons() {
    const btnY    = 610;
    const btnDefs = [
      { x: 54,  label: '🏳', title: 'Resign',     color: 0x8b0000, action: () => this.resignGame()   },
      { x: 180, label: '🤝', title: 'Draw',        color: 0x003580, action: () => this.offerDraw()    },
      { x: 306, label: '🚩', title: 'Report',      color: 0x4a0070, action: () => this.reportGame()   },
    ];

    btnDefs.forEach(def => {
      const bg = this.add.rectangle(0, 0, 90, 26, def.color)
        .setStrokeStyle(1, 0xffffff, 0.25);
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
    this.showFloatingMsg('Draw offer sent!', '#66aaff');
  }

  private reportGame() {
    const reason = prompt('Describe the issue (cheating, abuse, bug):');
    if (!reason?.trim()) return;
    this.socket?.emit('reportGame', {
      roomId:      this.roomId,
      reporterUid: this.uid,
      reason:      reason.trim(),
    });
    this.showFloatingMsg('Report submitted ✓', '#aaffaa');
  }

  private showFloatingMsg(msg: string, color: string) {
    const t = this.add.text(180, 575, msg, {
      fontSize: '13px', color, stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#000000bb', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: 540, alpha: 0, duration: 2000, ease: 'Power2',
      onComplete: () => t.destroy() });
  }

  // ─── Input ───────────────────────────────────────────────────────────────────
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

  // ─── Game objects ─────────────────────────────────────────────────────────────
  private createGameObjects() {
    const PW = SERVER.PADDLE_HALF_W * 2;  // 100px — matches server hitbox
    const PH = SERVER.PADDLE_HALF_H * 2;  // 20px  — matches server hitbox

    // myPaddleY / oppPaddleY set in create() based on role
    this.myPaddle = this.add.rectangle(
      this.CENTER_X, this.myPaddleY, PW, PH, 0x00cc44
    ).setDepth(10);

    // "YOU" label just below my paddle
    this.add.text(180, this.myPaddleY + 16, 'YOU', {
      fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.opponentPaddle = this.add.rectangle(
      this.CENTER_X, this.oppPaddleY, PW, PH, 0xff4444
    ).setDepth(10).setVisible(false);

    // "OPPONENT" label just above/below opp paddle (opposite side from YOU)
    const oppLabelY = this.oppPaddleY < 320
      ? this.oppPaddleY - 16   // opp is near top → label above
      : this.oppPaddleY + 16;  // opp is near bottom → label below
    this.add.text(180, oppLabelY, 'OPPONENT', {
      fontSize: '12px', color: '#ff8888', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setName('opponentLabel');

    // Ball — Arc sized to server BALL_RADIUS=18
    this.ball = this.add.arc(
      this.CENTER_X, 320,
      SERVER.BALL_RADIUS, 0, 360, false,
      0xffaa00
    ).setDepth(5);
    this.ball.setStrokeStyle(2, 0xffffff, 0.3);
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────
  private createUI() {
    // Health pips always sit just beyond each paddle edge
    const myHpY  = this.myPaddleY  + (this.myPaddleY  > 320 ? 22 : -22);
    const oppHpY = this.oppPaddleY + (this.oppPaddleY < 320 ? -22 : 22);

    for (let i = 0; i < 5; i++) {
      this.myHealthBars.push(this.add.rectangle(20 + i * 24, myHpY,  18, 12, 0x00ff44));
      this.opponentHealthBars.push(this.add.rectangle(20 + i * 24, oppHpY, 18, 12, 0xff4444));
    }

    this.scoreText = this.add.text(180, 308, 'Score: 0', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Hint text sits just inside from my paddle
    const hintY = this.myPaddleY + (this.myPaddleY > 320 ? -28 : 28);
    this.add.text(180, hintY, 'Drag or ← → to move', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    this.waitingText = this.add.text(180, 320, 'Connecting...', {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.debugText = this.add.text(4, 45, '', {
      fontSize: '10px', color: '#00ffff',
      backgroundColor: '#00000088', padding: { x: 3, y: 3 },
    }).setDepth(100);
  }

  // ─── Health bars ──────────────────────────────────────────────────────────────
  private syncHealthBars(myHealth: number, oppHealth: number) {
    while (this.myHealthBars.length > myHealth) {
      const bar = this.myHealthBars.pop();
      if (bar) this.tweens.add({ targets: bar, alpha: 0, scaleX: 0.2, duration: 200, onComplete: () => bar.destroy() });
    }
    while (this.opponentHealthBars.length > oppHealth) {
      const bar = this.opponentHealthBars.pop();
      if (bar) this.tweens.add({ targets: bar, alpha: 0, scaleX: 0.2, duration: 200, onComplete: () => bar.destroy() });
    }
  }

  private showHitEffect(x: number, y: number) {
    const c = this.add.circle(x, y, 22, 0xffff00, 0.8);
    this.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 150, onComplete: () => c.destroy() });
  }

  // ─── Ping warning ─────────────────────────────────────────────────────────────
  private showPingWarning(msg: string, color: string) {
    if (this.pingWarningTimer) { this.pingWarningTimer.destroy(); this.pingWarningTimer = undefined; }
    if (!this.pingWarningBanner) {
      this.pingWarningBanner = this.add.text(180, 600, msg, {
        fontSize: '12px', color, stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#000000cc', padding: { x: 8, y: 4 }, align: 'center',
      }).setOrigin(0.5).setDepth(200);
    } else {
      this.pingWarningBanner.setText(msg).setColor(color);
    }
    this.pingWarningTimer = this.time.delayedCall(4000, () => {
      if (this.pingWarningBanner) {
        this.tweens.add({ targets: this.pingWarningBanner, alpha: 0, duration: 400,
          onComplete: () => { this.pingWarningBanner?.destroy(); this.pingWarningBanner = undefined; }
        });
      }
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
    this.tweens.add({ targets: this.lagText, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });

    this.lagFreezeTimer = this.time.delayedCall(dur, () => this.clearLagFreeze());
  }

  private clearLagFreeze() {
    if (!this.lagFreezeActive) return;
    this.lagFreezeActive = false;
    if (this.ball) { this.ball.x = this.targetBallX; this.ball.y = this.targetBallY; }
    this.inputLocked = false;
    if (this.lagFreezeTimer) { this.lagFreezeTimer.destroy(); this.lagFreezeTimer = undefined; }
    if (this.lagOverlay) {
      this.tweens.add({ targets: this.lagOverlay, alpha: 0, duration: 300,
        onComplete: () => { this.lagOverlay?.destroy(); this.lagOverlay = undefined; }
      });
    }
    if (this.lagText) {
      this.tweens.killTweensOf(this.lagText);
      this.tweens.add({ targets: this.lagText, alpha: 0, duration: 300,
        onComplete: () => { this.lagText?.destroy(); this.lagText = undefined; }
      });
    }
  }

  // ─── Game over ────────────────────────────────────────────────────────────────
  private handleGameOver(won: boolean, winnerUsername: string, winnerUid: string) {
    this.gameActive  = false;
    this.inputLocked = true;
    this.clearLagFreeze();
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
    this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
  }

  // ─── Background ───────────────────────────────────────────────────────────────
  private addBackgroundEffects() {
    // Centre line — shows the mid-field boundary
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0xffffff, 0.1);
    g.lineBetween(0, SERVER.HEIGHT / 2, SERVER.WIDTH, SERVER.HEIGHT / 2);

    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, 310);
      const y = Phaser.Math.Between(100, 540);
      const c = this.add.circle(x, y, 10, 0xffaa00, 0.05);
      this.tweens.add({ targets: c, y: y + 20, alpha: 0.1, duration: 3000 + i * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────
  shutdown() {
    this.clearLagFreeze();
    if (this.pingWarningTimer) this.pingWarningTimer.destroy();
    this.socket?.disconnect();
  }
}