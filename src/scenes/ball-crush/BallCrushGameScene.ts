// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com';
// const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

interface GameState {
  ball: { x: number; y: number };
  paddles: { my: number; opponent: number };
  health: { my: number; opponent: number };
}

export class BallCrushGameScene extends Phaser.Scene {
  // ── Identity ────────────────────────────────────────────────────────
  private username: string = '';
  private uid: string = '';
  private roomId: string = '';
  private myRole: 'bottom' | 'top' = 'bottom';

  // ── Socket ──────────────────────────────────────────────────────────
  private socket!: Socket;
  private lastSentPaddleX: number = 180;

  // ── Game objects ────────────────────────────────────────────────────
  private myPaddle!: Phaser.GameObjects.Image;
  private opponentPaddle!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;

  private targetBallX: number = 180;
  private targetBallY: number = 320;

  // ── UI ──────────────────────────────────────────────────────────────
  private scoreText!: Phaser.GameObjects.Text;
  private myHealthBars: Phaser.GameObjects.Image[] = [];
  private opponentHealthBars: Phaser.GameObjects.Image[] = [];
  private waitingText?: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;

  // Ping warning — repositioned to bottom center
  private pingWarningBanner?: Phaser.GameObjects.Text;
  private pingWarningTimer?: Phaser.Time.TimerEvent;

  // Lag freeze overlay
  private lagOverlay?: Phaser.GameObjects.Graphics;
  private lagText?: Phaser.GameObjects.Text;
  private lagFreezeActive: boolean = false;
  private lagFreezeTimer?: Phaser.Time.TimerEvent;

  // ── State ────────────────────────────────────────────────────────────
  private gameActive: boolean = false;
  private currentScore: number = 0;
  private gameStartTime: number = 0;

  // ── Input ────────────────────────────────────────────────────────────
  private pointerActive: boolean = false;
  private pointerX: number = 180;
  private inputLocked: boolean = true;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly moveSpeed: number = 6;

  // ── Layout ───────────────────────────────────────────────────────────
  private readonly MY_PADDLE_Y  = 550;
  private readonly OPP_PADDLE_Y = 50;
  private readonly MIN_PADDLE_X = 35;
  private readonly MAX_PADDLE_X = 325;
  private readonly CENTER_X     = 180;

  // ── Debug ────────────────────────────────────────────────────────────
  private frameCount: number = 0;
  private stateCount: number = 0;
  private lastBallYFromServer: number = -1;

  constructor() {
    super({ key: 'BallCrushGameScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string; role: 'bottom' | 'top' }) {
    this.username = data.username || 'Player';
    this.uid      = data.uid      || '';
    this.roomId   = data.lobbyId;
    this.myRole   = data.role     || 'bottom';
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
    this.connectSocket();
  }

  // ─── Socket ────────────────────────────────────────────────────────────────
  private connectSocket() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log(`🔌 Socket connected: ${this.socket.id}`);
      this.socket.emit('joinRoom', {
        roomId:   this.roomId,
        username: this.username,
        uid:      this.uid,
        role:     this.myRole,
      });
    });

    this.socket.on('ping_check', () => {
      this.socket.emit('pong_check');
    });

    this.socket.on('pingWarning', ({ socketId, rtt }: { socketId: string; rtt: number }) => {
      const isMe  = socketId === this.socket.id;
      const msg   = isMe
        ? `⚠️ Your connection is unstable (${rtt}ms)`
        : `⚠️ Opponent has poor connection (${rtt}ms)`;
      const color = isMe ? '#ff4444' : '#ffaa00';

      // Show banner at bottom of screen, above health bar
      this.showPingWarning(msg, color);

      // If it's MY lag and it's severe, freeze the game briefly
      if (isMe && rtt > 400) {
        this.activateLagFreeze(rtt);
      }
    });

    this.socket.on('roomJoined', ({ role }: { role: string }) => {
      console.log(`✅ roomJoined as ${role}`);
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
      if (this.stateCount <= 5 || this.stateCount % 120 === 0) {
        console.log(
          `[DEBUG][${this.myRole}] state #${this.stateCount}` +
          ` ball=(${state.ball.x.toFixed(1)},${state.ball.y.toFixed(1)})` +
          ` health my=${state.health.my} opp=${state.health.opponent}`
        );
      }

      this.lastBallYFromServer = state.ball.y;
      this.targetBallX         = state.ball.x;
      this.targetBallY         = state.ball.y;

      // If lag freeze is active, snap instead of lerp so when we unfreeze
      // the ball doesn't rubber-band across the screen
      if (this.lagFreezeActive && this.ball) {
        this.ball.x = state.ball.x;
        this.ball.y = state.ball.y;
      }

      if (this.opponentPaddle) {
        this.opponentPaddle.x = Phaser.Math.Linear(
          this.opponentPaddle.x, state.paddles.opponent, 0.3
        );
      }
    });

    this.socket.on('ballReset', ({ ball }: { ball: { x: number; y: number } }) => {
      console.log(`[DEBUG][${this.myRole}] ballReset → (${ball.x.toFixed(1)},${ball.y.toFixed(1)})`);
      this.targetBallX = ball.x;
      this.targetBallY = ball.y;
      // Always snap on reset — no lerp, prevents ghost ball drift
      if (this.ball) { this.ball.x = ball.x; this.ball.y = ball.y; }
    });

    this.socket.on('paddleHit', ({ role, score }: { role: 'bottom' | 'top'; score: number }) => {
      const isMine = role === this.myRole;
      if (isMine) {
        this.currentScore = score;
        this.scoreText?.setText(`Score: ${score}`);
        this.showHitEffect(this.myPaddle.x, this.myPaddle.y);
        this.tweens.add({ targets: this.myPaddle, scaleX: 0.18, scaleY: 0.18, duration: 100, yoyo: true });
      } else {
        this.showHitEffect(this.opponentPaddle.x, this.opponentPaddle.y);
        this.tweens.add({ targets: this.opponentPaddle, scaleX: 0.18, scaleY: 0.18, duration: 100, yoyo: true });
      }
      this.cameras.main.shake(50, 0.003);
    });

    this.socket.on('point', ({ scorer, health }: {
      scorer: 'bottom' | 'top';
      health: { bottom: number; top: number };
    }) => {
      const myHealth  = this.myRole === 'bottom' ? health.bottom : health.top;
      const oppHealth = this.myRole === 'bottom' ? health.top    : health.bottom;

      this.syncHealthBars(myHealth, oppHealth);

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
      this.tweens.add({
        targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2',
        onComplete: () => t.destroy(),
      });
    });

    this.socket.on('gameOver', ({ winnerRole, winnerUsername, winnerUid }: {
      winnerRole: 'bottom' | 'top';
      winnerUsername: string;
      winnerUid: string;
    }) => {
      console.log(`[DEBUG][${this.myRole}] gameOver winner=${winnerRole} (${winnerUsername})`);
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

  // ─── Ping warning (bottom center, above health bar) ───────────────────────
  private showPingWarning(msg: string, color: string) {
    // Clear existing auto-hide timer
    if (this.pingWarningTimer) {
      this.pingWarningTimer.destroy();
      this.pingWarningTimer = undefined;
    }

    if (!this.pingWarningBanner) {
      this.pingWarningBanner = this.add.text(180, 600, msg, {
        fontSize: '12px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: '#000000cc',
        padding: { x: 8, y: 4 },
        align: 'center',
      }).setOrigin(0.5).setDepth(200);
    } else {
      this.pingWarningBanner.setText(msg).setColor(color);
    }

    // Auto-hide after 4 s
    this.pingWarningTimer = this.time.delayedCall(4000, () => {
      if (this.pingWarningBanner) {
        this.tweens.add({
          targets: this.pingWarningBanner, alpha: 0, duration: 400,
          onComplete: () => {
            this.pingWarningBanner?.destroy();
            this.pingWarningBanner = undefined;
          },
        });
      }
    });
  }

  // ─── Lag freeze — pauses visual + input when RTT is severe ───────────────
  //
  // Strategy:
  //   When our own ping exceeds 400ms we know the server is running ahead
  //   of us by ~200ms+. We briefly freeze local input and rendering so the
  //   server can catch up, then resume. This prevents the ball appearing to
  //   teleport when the backlog of state updates arrives all at once.
  //
  //   We do NOT actually pause the server — the game continues authoritatively.
  //   We just stop sending paddle updates and snap ball to server position
  //   on resume rather than lerping from a stale position.

  private activateLagFreeze(rtt: number) {
    if (this.lagFreezeActive) return; // already frozen
    if (!this.gameActive) return;

    const freezeDuration = Math.min(rtt * 0.6, 1500); // cap at 1.5 s
    this.lagFreezeActive = true;
    this.inputLocked     = true;

    console.log(`❄️  Lag freeze activated — RTT=${rtt}ms, freeze=${freezeDuration.toFixed(0)}ms`);

    // Dim overlay
    this.lagOverlay = this.add.graphics().setDepth(150);
    this.lagOverlay.fillStyle(0x000000, 0.55);
    this.lagOverlay.fillRect(0, 0, 360, 640);

    this.lagText = this.add.text(180, 310, '📶 Poor connection\nResyncing...', {
      fontSize: '16px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(151);

    // Pulse the text
    this.tweens.add({
      targets: this.lagText,
      alpha: 0.4,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    // Resume after freeze duration
    this.lagFreezeTimer = this.time.delayedCall(freezeDuration, () => {
      this.clearLagFreeze();
    });
  }

  private clearLagFreeze() {
    if (!this.lagFreezeActive) return;
    this.lagFreezeActive = false;

    // Snap ball to latest server position to avoid rubber-band on resume
    if (this.ball) {
      this.ball.x = this.targetBallX;
      this.ball.y = this.targetBallY;
    }

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

    console.log('✅ Lag freeze cleared — resuming');
  }

  // ─── update ────────────────────────────────────────────────────────────────
  update() {
    this.frameCount++;

    // Ball smoothing — always run so it looks alive during waiting
    if (this.ball && !this.lagFreezeActive) {
      this.ball.x = Phaser.Math.Linear(this.ball.x, this.targetBallX, 0.25);
      this.ball.y = Phaser.Math.Linear(this.ball.y, this.targetBallY, 0.25);
      this.ball.rotation += 0.05;
    }

    // No input during freeze, lock, or game-over
    if (!this.gameActive || this.inputLocked || this.lagFreezeActive || !this.myPaddle) return;

    let newX = this.myPaddle.x;

    if (this.cursors) {
      if (this.cursors.left?.isDown)  newX = Math.max(this.MIN_PADDLE_X, newX - this.moveSpeed);
      if (this.cursors.right?.isDown) newX = Math.min(this.MAX_PADDLE_X, newX + this.moveSpeed);
    }

    if (this.pointerActive) {
      newX = Phaser.Math.Clamp(this.pointerX, this.MIN_PADDLE_X, this.MAX_PADDLE_X);
    }

    this.myPaddle.x = newX;

    if (Math.abs(newX - this.lastSentPaddleX) > 1) {
      this.socket?.emit('paddleMove', { x: newX });
      this.lastSentPaddleX = newX;
    }

    if (this.debugText) {
      this.debugText.setText(
        `role: ${this.myRole}\n` +
        `ball: (${this.ball?.x.toFixed(0)},${this.ball?.y.toFixed(0)})\n` +
        `target: (${this.targetBallX.toFixed(0)},${this.targetBallY.toFixed(0)})\n` +
        `myPaddle: ${this.myPaddle?.x.toFixed(0)}\n` +
        `frozen: ${this.lagFreezeActive}\n` +
        `locked: ${this.inputLocked}`
      );
    }
  }

  // ─── Input setup ───────────────────────────────────────────────────────────
  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inputLocked || this.lagFreezeActive) return;
      this.pointerActive = true;
      this.pointerX      = pointer.x;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.inputLocked || this.lagFreezeActive || !pointer.isDown) return;
      this.pointerActive = true;
      this.pointerX      = pointer.x;
    });

    this.input.on('pointerup',  () => { this.pointerActive = false; });
    this.input.on('pointerout', () => { this.pointerActive = false; });
  }

  // ─── Game objects ──────────────────────────────────────────────────────────
  private createGameObjects() {
    this.myPaddle = this.add.image(this.CENTER_X, this.MY_PADDLE_Y, 'player');
    this.myPaddle.setScale(0.15).setDepth(10);

    this.add.text(180, 590, 'YOU', {
      fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.opponentPaddle = this.add.image(this.CENTER_X, this.OPP_PADDLE_Y, 'player');
    this.opponentPaddle.setScale(0.15).setFlipY(true).setDepth(10).setVisible(false);

    this.add.text(180, 30, 'OPPONENT', {
      fontSize: '14px', color: '#ff4444', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setName('opponentLabel');

    this.ball = this.add.image(this.CENTER_X, 320, 'ball');
    this.ball.setScale(0.15).setDepth(5);
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  private createUI() {
    // My health bars — bottom left
    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(30 + i * 28, 615, 'ball');
      bar.setScale(0.08).setTint(0x00ff00);
      this.myHealthBars.push(bar);
    }

    // Opponent health bars — top left
    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(30 + i * 28, 25, 'ball');
      bar.setScale(0.08).setTint(0xff4444);
      this.opponentHealthBars.push(bar);
    }

    this.scoreText = this.add.text(180, 300, 'Score: 0', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(180, 570, 'Drag or use ← → to move', {
      fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);

    this.waitingText = this.add.text(180, 320, 'Connecting to server...', {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Debug overlay — top left, small
    this.debugText = this.add.text(4, 45, '', {
      fontSize: '10px', color: '#00ffff',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 3 },
    }).setDepth(100);
  }

  // ─── Health bars ───────────────────────────────────────────────────────────
  private syncHealthBars(myHealth: number, oppHealth: number) {
    while (this.myHealthBars.length > myHealth) {
      const bar = this.myHealthBars.pop();
      if (bar) {
        this.tweens.add({ targets: bar, alpha: 0, scaleX: 0.2, duration: 200, onComplete: () => bar.destroy() });
      }
    }
    while (this.opponentHealthBars.length > oppHealth) {
      const bar = this.opponentHealthBars.pop();
      if (bar) {
        this.tweens.add({ targets: bar, alpha: 0, scaleX: 0.2, duration: 200, onComplete: () => bar.destroy() });
      }
    }
  }

  private showHitEffect(x: number, y: number) {
    const c = this.add.circle(x, y, 15, 0xffff00, 0.8);
    this.tweens.add({ targets: c, scale: 1.5, alpha: 0, duration: 150, onComplete: () => c.destroy() });
  }

  // ─── Game over ─────────────────────────────────────────────────────────────
  private handleGameOver(won: boolean, winnerUsername: string, winnerUid: string) {
    this.gameActive  = false;
    this.inputLocked = true;
    this.clearLagFreeze();

    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);

    this.socket?.disconnect();

    this.scene.start('BallCrushGameOverScene', {
      score:          this.currentScore,
      won,
      winnerUsername,
      winnerUid,       // ← now passed correctly so prize fires
      uid:            this.uid,
      username:       this.username,
      duration,
      lobbyId:        this.roomId,  // ← now passed so endGame can update lobby status
    });

    this.scene.stop();
  }

  private returnToMenu() {
    this.socket?.disconnect();
    this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
  }

  // ─── Background ────────────────────────────────────────────────────────────
  private addBackgroundEffects() {
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

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  shutdown() {
    this.clearLagFreeze();
    if (this.pingWarningTimer) this.pingWarningTimer.destroy();
    this.socket?.disconnect();
  }
}