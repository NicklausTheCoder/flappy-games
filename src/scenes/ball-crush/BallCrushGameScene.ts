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
  paddles: { bottom: number; top: number };
  health:  { bottom: number; top: number };
}

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private roomId: string = '';
  private myRole: 'bottom' | 'top' = 'bottom';

  private socket!: Socket;
  private lastSentPaddleX: number = 0;

  private myPaddle!:       Phaser.GameObjects.Image;
  private opponentPaddle!: Phaser.GameObjects.Image;
  private ball!:           Phaser.GameObjects.Image;

  // Visual effects for hits
  private hitEffect!: Phaser.GameObjects.Graphics;
  private hitEffectTimer: number = 0;

  private scoreText!:         Phaser.GameObjects.Text;
  private myHealthBars:       Phaser.GameObjects.Image[] = [];
  private opponentHealthBars: Phaser.GameObjects.Image[] = [];
  private waitingText?:       Phaser.GameObjects.Text;

  private gameActive:    boolean = false;
  private currentScore:  number  = 0;
  private gameStartTime: number  = 0;

  // Smooth interpolation for ball
  private targetBallX: number = 180;
  private targetBallY: number = 320;
  private lastBallUpdate: number = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 6;

  private readonly BOTTOM_Y = 550;
  private readonly TOP_Y    = 50;
  private readonly MIN_PADDLE_X = 35;
  private readonly MAX_PADDLE_X = 325;
  private readonly GAME_HEIGHT = 640;

  constructor() {
    super({ key: 'BallCrushGameScene' });
  }

  init(data: { username: string; uid: string; lobbyId: string; role: 'bottom' | 'top' }) {
    this.username = data.username || 'Player';
    this.uid      = data.uid || '';
    this.roomId   = data.lobbyId;
    this.myRole   = data.role || 'bottom';
    console.log(`⚽ Role: ${this.myRole}`);
  }

  create() {
    this.gameStartTime = Date.now();
    this.lastSentPaddleX = 180;
    this.lastBallUpdate = Date.now();

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

  private flipY(y: number): number {
    if (this.myRole === 'top') {
      return this.GAME_HEIGHT - y;
    }
    return y;
  }

  private showHitEffect(x: number, y: number) {
    // Create a quick flash at hit position
    const hitCircle = this.add.circle(x, y, 15, 0xffff00, 0.8);
    this.tweens.add({
      targets: hitCircle,
      scale: 1.5,
      alpha: 0,
      duration: 150,
      onComplete: () => hitCircle.destroy()
    });
    
    // Also shake the paddle slightly
    const paddle = Math.abs(y - this.BOTTOM_Y) < 50 ? this.myPaddle : this.opponentPaddle;
    if (paddle) {
      this.tweens.add({
        targets: paddle,
        x: paddle.x + (Math.random() - 0.5) * 8,
        duration: 50,
        yoyo: true,
        repeat: 2
      });
    }
  }

  private connectSocket() {
    this.socket = io(SERVER_URL, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log('🔌 Socket connected:', this.socket.id);
      this.socket.emit('joinRoom', {
        roomId:   this.roomId,
        username: this.username,
        uid:      this.uid,
        role:     this.myRole
      });
    });

    this.socket.on('roomJoined', ({ role }: { role: 'bottom' | 'top' }) => {
      console.log(`✅ Room joined as ${role}`);
      if (this.waitingText) {
        this.waitingText.setText('Waiting for opponent...');
      }
    });

    this.socket.on('gameStart', ({ players }: { players: { bottom: string; top: string } }) => {
      if (this.waitingText) {
        this.waitingText.destroy();
        this.waitingText = undefined;
      }

      this.gameActive = true;

      const opponentName = this.myRole === 'bottom' ? players.top : players.bottom;
      const label = this.children.getByName('opponentLabel') as Phaser.GameObjects.Text;
      if (label) label.setText(opponentName);

      this.opponentPaddle.setVisible(true);
      this.opponentPaddle.setAlpha(1);

      const vs = this.add.text(180, 300, `VS ${opponentName}`, {
        fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => vs.destroy());

      console.log('🎮 Game started!');
    });

    this.socket.on('gameState', (state: GameState) => {
      if (!this.gameActive) return;

      // Set target position for smooth interpolation
      this.targetBallX = state.ball.x;
      this.targetBallY = this.flipY(state.ball.y);
      this.lastBallUpdate = Date.now();

      // Update opponent paddle
      if (this.opponentPaddle) {
        const opponentPaddleX = this.myRole === 'bottom' ? state.paddles.top : state.paddles.bottom;
        // Smooth opponent paddle movement
        this.opponentPaddle.x = Phaser.Math.Linear(this.opponentPaddle.x, opponentPaddleX, 0.3);
      }
    });

    this.socket.on('ballReset', ({ ball }: { ball: { x: number; y: number } }) => {
      if (this.ball) {
        this.targetBallX = ball.x;
        this.targetBallY = this.flipY(ball.y);
        // Instantly set position on reset
        this.ball.x = this.targetBallX;
        this.ball.y = this.targetBallY;
      }
    });

    this.socket.on('paddleHit', ({ role, score }: { role: 'bottom' | 'top'; score: number }) => {
      if (role === this.myRole) {
        this.currentScore = score;
        this.scoreText?.setText(`Score: ${score}`);
        this.tweens.add({ targets: this.myPaddle, scaleX: 0.18, scaleY: 0.18, duration: 100, yoyo: true });
        
        // Show hit effect at my paddle
        this.showHitEffect(this.myPaddle.x, this.myPaddle.y);
      } else {
        this.tweens.add({ targets: this.opponentPaddle, scaleX: 0.18, scaleY: 0.18, duration: 100, yoyo: true });
        
        // Show hit effect at opponent paddle
        this.showHitEffect(this.opponentPaddle.x, this.opponentPaddle.y);
      }
      
      // Small camera shake on hit
      this.cameras.main.shake(50, 0.003);
    });

    this.socket.on('point', ({ scorer, health }: { scorer: 'bottom' | 'top'; health: { bottom: number; top: number } }) => {
      this.updateHealthBars(health);

      if (scorer === this.myRole) {
        this.cameras.main.flash(300, 0, 255, 0, 0.5);
      } else {
        this.cameras.main.flash(300, 255, 0, 0, 0.5);
        // Stronger camera shake when scored on
        this.cameras.main.shake(200, 0.008);
      }
    });

    this.socket.on('speedBump', ({ multiplier }: { multiplier: number }) => {
      this.cameras.main.flash(500, 255, 255, 255, 0.3);
      const t = this.add.text(180, 200, `SPEED x${multiplier.toFixed(1)}!`, {
        fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#ff0000', strokeThickness: 4
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
    });

    this.socket.on('gameOver', ({ winnerRole, winnerUsername }: { winnerRole: 'bottom' | 'top'; winnerUsername: string }) => {
      const won = winnerRole === this.myRole;
      this.handleGameOver(won, winnerUsername);
    });

    this.socket.on('error', ({ message }: { message: string }) => {
      console.error('Socket error:', message);
      this.add.text(180, 320, `Error: ${message}`, {
        fontSize: '18px', color: '#ff4444', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5);
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

  update() {
    if (!this.gameActive || !this.myPaddle) return;

    // Smooth ball interpolation
    if (this.ball) {
      const now = Date.now();
      const timeSinceUpdate = Math.min(100, now - this.lastBallUpdate);
      const lerpFactor = Math.min(1, timeSinceUpdate / 50); // Interpolate over 50ms
      
      this.ball.x = Phaser.Math.Linear(this.ball.x, this.targetBallX, lerpFactor);
      this.ball.y = Phaser.Math.Linear(this.ball.y, this.targetBallY, lerpFactor);
      this.ball.rotation += 0.05;
    }

    // Paddle movement
    let newX = this.myPaddle.x;

    if (this.cursors) {
      if (this.cursors.left?.isDown) {
        newX = Math.max(this.MIN_PADDLE_X, newX - this.moveSpeed);
      }
      if (this.cursors.right?.isDown) {
        newX = Math.min(this.MAX_PADDLE_X, newX + this.moveSpeed);
      }
    }

    if (newX !== this.myPaddle.x) {
      this.myPaddle.x = newX;
    }

    // Send paddle position to server (throttled)
    if (Math.abs(this.myPaddle.x - this.lastSentPaddleX) > 2) {
      this.socket?.emit('paddleMove', { x: this.myPaddle.x });
      this.lastSentPaddleX = this.myPaddle.x;
    }
  }

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.myPaddle && this.gameActive) {
        this.myPaddle.x = Phaser.Math.Clamp(pointer.x, this.MIN_PADDLE_X, this.MAX_PADDLE_X);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.myPaddle && this.gameActive) {
        this.myPaddle.x = Phaser.Math.Clamp(pointer.x, this.MIN_PADDLE_X, this.MAX_PADDLE_X);
      }
    });
  }

  private createGameObjects() {
    this.myPaddle = this.add.image(180, this.BOTTOM_Y, 'player');
    this.myPaddle.setScale(0.15);
    this.myPaddle.setDepth(10);

    this.add.text(180, 590, 'YOU', {
      fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);

    this.opponentPaddle = this.add.image(180, this.TOP_Y, 'player');
    this.opponentPaddle.setScale(0.15);
    this.opponentPaddle.setFlipY(true);
    this.opponentPaddle.setDepth(10);
    this.opponentPaddle.setVisible(false);
    this.opponentPaddle.setAlpha(0);

    this.add.text(180, 30, 'OPPONENT', {
      fontSize: '14px', color: '#ff4444', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setName('opponentLabel');

    this.ball = this.add.image(180, 320, 'ball');
    this.ball.setScale(0.15);
    this.ball.setDepth(5);
  }

  private createUI() {
    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(80 + i * 40, 620, 'ball');
      bar.setScale(0.1);
      bar.setTint(0x00ff00);
      this.myHealthBars.push(bar);
    }

    for (let i = 0; i < 5; i++) {
      const bar = this.add.image(80 + i * 40, 20, 'ball');
      bar.setScale(0.1);
      bar.setTint(0xff0000);
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
  }

  private updateHealthBars(health: { bottom: number; top: number }) {
    const myHealth  = this.myRole === 'bottom' ? health.bottom : health.top;
    const oppHealth = this.myRole === 'bottom' ? health.top    : health.bottom;

    while (this.myHealthBars.length > myHealth) {
      this.myHealthBars.pop()?.destroy();
    }
    while (this.myHealthBars.length < myHealth) {
      const bar = this.add.image(80 + this.myHealthBars.length * 40, 620, 'ball');
      bar.setScale(0.1);
      bar.setTint(0x00ff00);
      this.myHealthBars.push(bar);
    }

    while (this.opponentHealthBars.length > oppHealth) {
      this.opponentHealthBars.pop()?.destroy();
    }
    while (this.opponentHealthBars.length < oppHealth) {
      const bar = this.add.image(80 + this.opponentHealthBars.length * 40, 20, 'ball');
      bar.setScale(0.1);
      bar.setTint(0xff0000);
      this.opponentHealthBars.push(bar);
    }
  }

  private async handleGameOver(won: boolean, winnerUsername: string) {
    this.gameActive = false;
    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);

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

    this.add.text(180, 280, 'GAME OVER', {
      fontSize: '32px', color: '#ff0000', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);

    const resultMsg = won ? 'You Win! 🏆' : `${winnerUsername} Wins!`;
    this.add.text(180, 320, resultMsg, {
      fontSize: '24px', color: won ? '#ffff00' : '#ff6666', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5);

    this.add.text(180, 360, `Score: ${this.currentScore}`, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(180, 410, 'Tap to return to menu', {
      fontSize: '16px', color: '#ffffff'
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => this.returnToMenu());
  }

  private returnToMenu() {
    this.socket?.disconnect();
    this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
  }

  private showWinningsPopup() {
    const t = this.add.text(180, 200, '+$0.50', {
      fontSize: '32px', color: '#ffff00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: 150, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => t.destroy() });
  }

  private addBackgroundEffects() {
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, 310);
      const y = Phaser.Math.Between(100, 540);
      const c = this.add.circle(x, y, 10, 0xffaa00, 0.05);
      this.tweens.add({
        targets: c, y: y + 20, alpha: 0.1, duration: 3000 + i * 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }
}