// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import {
  updateBallCrushProfileStats,
  addBallCrushWinnings,
} from '../../firebase/ballCrushSimple';

const SERVER_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

interface GameState {
  ball:    { x: number; y: number };
  paddles: { my: number; opponent: number };
  health:  { my: number; opponent: number };
}

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  private uid:      string = '';
  private roomId:   string = '';
  private myRole:   'bottom' | 'top' = 'bottom';

  private socket!:         Socket;
  private lastSentPaddleX: number = 180;

  private myPaddle!:       Phaser.GameObjects.Image;
  private opponentPaddle!: Phaser.GameObjects.Image;
  private ball!:           Phaser.GameObjects.Image;

  private targetBallX: number = 180;
  private targetBallY: number = 320;

  private scoreText!:         Phaser.GameObjects.Text;
  private myHealthBars:       Phaser.GameObjects.Image[] = [];
  private opponentHealthBars: Phaser.GameObjects.Image[] = [];
  private waitingText?:       Phaser.GameObjects.Text;
  private debugText!:         Phaser.GameObjects.Text;

  private gameActive:    boolean = false;
  private currentScore:  number  = 0;
  private gameStartTime: number  = 0;

  // ── Input state ─────────────────────────────────────────────────────
  // Track pointer separately so we can ignore stale presses from lobby
  private pointerActive:   boolean = false;
  private pointerX:        number  = 180;
  private inputLocked:     boolean = true;   // locked until gameStart fires
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 6;

  // Layout — identical for both players (server sends perspective-correct coords)
  private readonly MY_PADDLE_Y  = 550;
  private readonly OPP_PADDLE_Y = 50;
  private readonly MIN_PADDLE_X = 35;
  private readonly MAX_PADDLE_X = 325;
  private readonly CENTER_X     = 180;

  // Debug
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
    this.inputLocked     = true;   // ← locked until server says gameStart
    this.pointerActive   = false;
    this.gameActive      = false;
    this.stateCount      = 0;
    this.frameCount      = 0;

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
        role:     this.myRole
      });
    });

    this.socket.on('roomJoined', ({ role }: { role: string }) => {
      console.log(`✅ roomJoined as ${role}`);
      if (this.waitingText) this.waitingText.setText('Waiting for opponent...');
    });

    this.socket.on('gameStart', ({ opponentName }: { opponentName: string }) => {
      console.log(`🎮 gameStart — opponent: ${opponentName}, myRole: ${this.myRole}`);

      if (this.waitingText) {
        this.waitingText.destroy();
        this.waitingText = undefined;
      }

      // ── KEY FIX: Reset paddle to centre and unlock input ─────────────
      this.myPaddle.x      = this.CENTER_X;
      this.lastSentPaddleX = this.CENTER_X;
      this.pointerActive   = false;        // discard any stale touch
      this.pointerX        = this.CENTER_X;
      this.inputLocked     = false;        // NOW allow input
      // ─────────────────────────────────────────────────────────────────

      this.gameActive = true;
      this.opponentPaddle.setVisible(true);

      const label = this.children.getByName('opponentLabel') as Phaser.GameObjects.Text;
      if (label) label.setText(opponentName);

      const vs = this.add.text(180, 300, `VS ${opponentName}`, {
        fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => vs.destroy());
    });

    // Game state — no flip needed, server already perspective-corrected
    this.socket.on('gameState', (state: GameState) => {
      if (!this.gameActive) return;

      this.stateCount++;
      if (this.stateCount <= 5 || this.stateCount % 120 === 0) {
        console.log(
          `[DEBUG][${this.myRole}] state #${this.stateCount}` +
          ` ball=(${state.ball.x.toFixed(1)}, ${state.ball.y.toFixed(1)})` +
          ` myPaddle=${state.paddles.my.toFixed(1)}` +
          ` oppPaddle=${state.paddles.opponent.toFixed(1)}` +
          ` health my=${state.health.my} opp=${state.health.opponent}` +
          ` inputLocked=${this.inputLocked}`
        );
      }

      this.lastBallYFromServer = state.ball.y;
      this.targetBallX = state.ball.x;
      this.targetBallY = state.ball.y;

      if (this.opponentPaddle) {
        this.opponentPaddle.x = Phaser.Math.Linear(
          this.opponentPaddle.x, state.paddles.opponent, 0.3
        );
      }
    });

    this.socket.on('ballReset', ({ ball }: { ball: { x: number; y: number } }) => {
      console.log(`[DEBUG][${this.myRole}] ballReset → (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)})`);
      this.targetBallX = ball.x;
      this.targetBallY = ball.y;
      if (this.ball) { this.ball.x = ball.x; this.ball.y = ball.y; }
    });

    this.socket.on('paddleHit', ({ role, score }: { role: 'bottom' | 'top'; score: number }) => {
      const isMine = role === this.myRole;
      console.log(`[DEBUG][${this.myRole}] paddleHit role=${role} isMine=${isMine} score=${score}`);

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

    this.socket.on('point', ({ scorer, health }: { scorer: 'bottom' | 'top'; health: { bottom: number; top: number } }) => {
      const myHealth  = this.myRole === 'bottom' ? health.bottom : health.top;
      const oppHealth = this.myRole === 'bottom' ? health.top    : health.bottom;

      console.log(
        `[DEBUG][${this.myRole}] point by ${scorer}` +
        ` myHealth=${myHealth} oppHealth=${oppHealth}` +
        ` myPaddle.x=${this.myPaddle?.x.toFixed(1)}` +
        ` ball.y=${this.lastBallYFromServer.toFixed(1)}`
      );

      this.syncHealthBars(myHealth, oppHealth);

      if (scorer === this.myRole) {
        this.cameras.main.flash(300, 0, 255, 0, 0.4);
      } else {
        this.cameras.main.flash(300, 255, 0, 0, 0.5);
        this.cameras.main.shake(200, 0.008);
      }
    });

    this.socket.on('speedBump', ({ multiplier }: { multiplier: number }) => {
      console.log(`[DEBUG][${this.myRole}] speedBump x${multiplier.toFixed(2)}`);
      this.cameras.main.flash(500, 255, 255, 255, 0.3);
      const t = this.add.text(180, 200, `SPEED x${multiplier.toFixed(1)}!`, {
        fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#ff0000', strokeThickness: 4
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
    });

    this.socket.on('gameOver', ({ winnerRole, winnerUsername }: { winnerRole: 'bottom' | 'top'; winnerUsername: string }) => {
      console.log(`[DEBUG][${this.myRole}] gameOver winner=${winnerRole} (${winnerUsername})`);
      this.handleGameOver(winnerRole === this.myRole, winnerUsername);
    });

    this.socket.on('error', ({ message }: { message: string }) => {
      console.error(`[ERROR][${this.myRole}] ${message}`);
    });

    this.socket.on('disconnect', () => {
      if (this.gameActive) {
        this.gameActive = false;
        this.add.text(180, 320, 'Opponent disconnected!', {
          fontSize: '20px', color: '#ff4444', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        this.time.delayedCall(3000, () => this.returnToMenu());
      }
    });
  }

  // ─── update ────────────────────────────────────────────────────────────────
  update() {
    this.frameCount++;

    // Smooth ball always (even while waiting, so it looks alive)
    if (this.ball) {
      this.ball.x = Phaser.Math.Linear(this.ball.x, this.targetBallX, 0.25);
      this.ball.y = Phaser.Math.Linear(this.ball.y, this.targetBallY, 0.25);
      this.ball.rotation += 0.05;
    }

    // Input only when game is live AND input is unlocked
    if (!this.gameActive || this.inputLocked || !this.myPaddle) return;

    let newX = this.myPaddle.x;

    // Keyboard
    if (this.cursors) {
      if (this.cursors.left?.isDown)  newX = Math.max(this.MIN_PADDLE_X, newX - this.moveSpeed);
      if (this.cursors.right?.isDown) newX = Math.min(this.MAX_PADDLE_X, newX + this.moveSpeed);
    }

    // Touch/pointer — only use if actively pressed
    if (this.pointerActive) {
      newX = Phaser.Math.Clamp(this.pointerX, this.MIN_PADDLE_X, this.MAX_PADDLE_X);
    }

    this.myPaddle.x = newX;

    // Send to server only when moved more than 1px
    if (Math.abs(newX - this.lastSentPaddleX) > 1) {
      if (this.frameCount % 60 === 0) {
        console.log(`[DEBUG][${this.myRole}] Sending paddle x=${newX.toFixed(1)}`);
      }
      this.socket?.emit('paddleMove', { x: newX });
      this.lastSentPaddleX = newX;
    }

    // Debug overlay
    if (this.debugText) {
      this.debugText.setText(
        `role: ${this.myRole}\n` +
        `ball: (${this.ball?.x.toFixed(0)}, ${this.ball?.y.toFixed(0)})\n` +
        `target: (${this.targetBallX.toFixed(0)}, ${this.targetBallY.toFixed(0)})\n` +
        `myPaddle: ${this.myPaddle?.x.toFixed(0)}\n` +
        `ptr: ${this.pointerActive} x=${this.pointerX.toFixed(0)}\n` +
        `locked: ${this.inputLocked}`
      );
    }
  }

  // ─── Input setup ───────────────────────────────────────────────────────────
  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // Track pointer state explicitly — don't snap on every pointerdown
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inputLocked) {
        console.log(`[DEBUG][${this.myRole}] pointerdown IGNORED (inputLocked)`);
        return;
      }
      this.pointerActive = true;
      this.pointerX      = pointer.x;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.inputLocked || !pointer.isDown) return;
      this.pointerActive = true;
      this.pointerX      = pointer.x;
    });

    this.input.on('pointerup', () => {
      this.pointerActive = false;
    });

    // Also cancel pointer if it leaves the canvas
    this.input.on('pointerout', () => {
      this.pointerActive = false;
    });
  }

  // ─── Scene objects ─────────────────────────────────────────────────────────
  private createGameObjects() {
    this.myPaddle = this.add.image(this.CENTER_X, this.MY_PADDLE_Y, 'player');
    this.myPaddle.setScale(0.15);
    this.myPaddle.setDepth(10);

    this.add.text(180, 590, 'YOU', {
      fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);

    this.opponentPaddle = this.add.image(this.CENTER_X, this.OPP_PADDLE_Y, 'player');
    this.opponentPaddle.setScale(0.15);
    this.opponentPaddle.setFlipY(true);
    this.opponentPaddle.setDepth(10);
    this.opponentPaddle.setVisible(false);

    this.add.text(180, 30, 'OPPONENT', {
      fontSize: '14px', color: '#ff4444', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setName('opponentLabel');

    this.ball = this.add.image(this.CENTER_X, 320, 'ball');
    this.ball.setScale(0.15);
    this.ball.setDepth(5);
  }

  private createUI() {
    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(80 + i * 40, 620, 'ball');
      bar.setScale(0.1); bar.setTint(0x00ff00);
      this.myHealthBars.push(bar);
    }
    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(80 + i * 40, 20, 'ball');
      bar.setScale(0.1); bar.setTint(0xff0000);
      this.opponentHealthBars.push(bar);
    }

    this.scoreText = this.add.text(180, 300, 'Score: 0', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(180, 560, 'Move with ← → arrows or drag', {
      fontSize: '12px', color: '#ffffff'
    }).setOrigin(0.5);

    this.waitingText = this.add.text(180, 320, 'Connecting to server...', {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5);

    // Cyan debug overlay
    this.debugText = this.add.text(4, 45, '', {
      fontSize: '10px', color: '#00ffff',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 3 }
    }).setDepth(100);
  }

  private syncHealthBars(myHealth: number, oppHealth: number) {
    while (this.myHealthBars.length > myHealth)        this.myHealthBars.pop()?.destroy();
    while (this.opponentHealthBars.length > oppHealth) this.opponentHealthBars.pop()?.destroy();
  }

  private showHitEffect(x: number, y: number) {
    const c = this.add.circle(x, y, 15, 0xffff00, 0.8);
    this.tweens.add({ targets: c, scale: 1.5, alpha: 0, duration: 150, onComplete: () => c.destroy() });
  }

  private async handleGameOver(won: boolean, winnerUsername: string) {
    this.gameActive  = false;
    this.inputLocked = true;
    const duration   = Math.floor((Date.now() - this.gameStartTime) / 1000);

    if (this.uid) {
      try {
        await updateBallCrushProfileStats(this.uid, this.currentScore, won, duration);
        if (won) {
          await addBallCrushWinnings(this.uid, 0.50, `Ball Crush victory - Score: ${this.currentScore}`);
          this.showWinningsPopup();
        }
      } catch (err) {
        console.error('Firebase error:', err);
      }
    }

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, 360, 640);
    overlay.setDepth(20);

    this.add.text(180, 260, 'GAME OVER', {
      fontSize: '32px', color: '#ff0000', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(21);

    this.add.text(180, 310, won ? 'You Win! 🏆' : `${winnerUsername} Wins!`, {
      fontSize: '24px', color: won ? '#ffff00' : '#ff6666', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(21);

    this.add.text(180, 355, `Score: ${this.currentScore}`, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    this.add.text(180, 400, 'Tap to return to menu', {
      fontSize: '16px', color: '#cccccc'
    }).setOrigin(0.5).setDepth(21);

    // Short delay before allowing tap so they don't accidentally dismiss
    this.time.delayedCall(800, () => {
      this.input.once('pointerdown', () => this.returnToMenu());
    });
  }

  private returnToMenu() {
    this.socket?.disconnect();
    this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
  }

  private showWinningsPopup() {
    const t = this.add.text(180, 200, '+$0.50', {
      fontSize: '32px', color: '#ffff00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
  }

  private addBackgroundEffects() {
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, 310);
      const y = Phaser.Math.Between(100, 540);
      const c = this.add.circle(x, y, 10, 0xffaa00, 0.05);
      this.tweens.add({ targets: c, y: y + 20, alpha: 0.1, duration: 3000 + i * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }
}