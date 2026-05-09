// src/scenes/flappy-bird/FlappyBirdGameScene.ts
import Phaser from 'phaser';
import { CompleteUserData } from '../../firebase/simple';

// ── Physics tuning ────────────────────────────────────────────────────────────
//
//  The "feel" of Flappy Bird comes from a specific gravity/flap ratio.
//  Original FB: gravity ~1500, flap -380. That gives roughly 0.5s to apex
//  and 0.8s to fall back to start — the arc feels natural.
//
//  Key insight: wing animation should look fast when rising (player just
//  tapped) and the bird should visually feel like it's fighting gravity —
//  NOT like it's in free-fall. Gravity at 1800 with flap -480 was too
//  aggressive — the bird was essentially a rock with brief upward blips.
//
const GRAVITY         = 1400;   // px/s² — was 1800, smoother arc
const FLAP_VELOCITY   = -420;   // px/s  — was -480, less violent launch
const FLAP_ANIM_RATE  = 14;     // fps   — faster wing beat (was 10)
const IDLE_ANIM_RATE  = 6;      // fps   — slower wings while falling/gliding

// Pipe config
const PIPE_SPEED_BASE  = -155;   // px/s  base
const PIPE_GAP_BASE    = 160;    // px    — vertical gap
const PIPE_GAP_MIN     = 115;    // px    — minimum vertical gap at high scores
const PIPE_H_GAP       = 230;    // px    — desired horizontal clear-air distance
                                  //         between the RIGHT edge of one pipe pair
                                  //         and the LEFT edge of the next.
                                  //         Kept constant at all speeds so difficulty
                                  //         scales from vertical gap, not frantic pace.
const BIRD_SCALE       = 0.082;  // smaller bird (was 0.1)

// Speed progression
const SPEED_STEP       = 30;     // s between bumps
const SPEED_INCREMENT  = 0.16;
const SPEED_MAX        = 1.85;
const PIPE_WIDTH       = 52;     // px — must match setDisplaySize in spawnPipePair

// How many ms to wait before spawning the next pipe pair at a given speed multiplier.
// Formula: time for pipe to travel (PIPE_WIDTH + PIPE_H_GAP) px at current speed.
// This keeps the visual density of pipes constant regardless of speedMultiplier.
function pipeSpawnMs(multiplier: number): number {
  const speed = Math.abs(PIPE_SPEED_BASE) * multiplier; // px/s
  return Math.round((PIPE_WIDTH + PIPE_H_GAP) / speed * 1000);
}

export class FlappyBirdGameScene extends Phaser.Scene {
  userData!: CompleteUserData;
  username!: string;
  uid!: string;

  private bird!:   Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private pipes!:  Phaser.Physics.Arcade.Group;
  private ground!: Phaser.Types.Physics.Arcade.ImageWithStaticBody;

  private score:           number  = 0;
  private gameOver:        boolean = false;
  private gameStarted:     boolean = false;
  private elapsedTime:     number  = 0;
  private speedMultiplier: number  = 1;
  private speedTier:       number  = 0;
  private targetRotation:  number  = 0;

  // Wing sync state
  private lastVY:         number  = 0;
  private isRising:       boolean = false;

  // Speed-up warning
  private speedTickText?:    Phaser.GameObjects.Text;
  private speedTickTimer?:   Phaser.Time.TimerEvent;
  private speedTickShowing:  boolean = false;

  // UI
  private scoreText!:     Phaser.GameObjects.Text;
  private timerText!:     Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private pipeInterval!:  Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'FlappyBirdGameScene' });
  }

  init(data: { username: string; uid: string; userData: CompleteUserData }) {
    if (!data?.username || !data?.uid) {
      this.scene.start('FlappyBirdStartScene');
      return;
    }
    this.username        = data.username;
    this.uid             = data.uid;
    this.userData        = data.userData;
    this.score           = 0;
    this.elapsedTime     = 0;
    this.speedMultiplier = 1;
    this.speedTier       = 0;
    this.gameStarted     = false;
    this.gameOver        = false;
    this.targetRotation  = 0;
    this.lastVY          = 0;
    this.isRising        = false;
    this.speedTickShowing = false;
    if (this.userData && !this.userData.uid) this.userData.uid = this.uid;
  }

  create() {
    this.addBackground();
    this.addGround();
    this.createBird();

    this.physics.world.setBounds(0, -9999, 360, 9999);
    this.bird.setCollideWorldBounds(false);
    this.physics.world.gravity.y = 0;

    if (this.pipes) this.pipes.destroy(true);
    this.pipes = this.physics.add.group();

    this.physics.add.collider(this.bird, this.ground, () => this.gameOverHandler());
    this.physics.add.overlap(this.bird, this.pipes,  () => this.gameOverHandler());

    // Score — top center
    this.scoreText = this.add.text(180, 52, '0', {
      fontSize: '52px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(10);

    // Timer — top right
    this.timerText = this.add.text(350, 14, '0s', {
      fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(10);

    // Balance — top left
    this.add.text(10, 14, `$${this.userData.balance.toFixed(2)}`, {
      fontSize: '13px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 2,
      backgroundColor: '#00000066', padding: { x: 5, y: 3 },
    }).setDepth(10);

    const getReady = this.add.text(180, 230, 'GET READY!', {
      fontSize: '28px', color: '#ffff00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.countdownText = this.add.text(180, 315, '3', {
      fontSize: '80px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(10);

    // Tap hint
    const tapHint = this.add.text(180, 400, 'Tap to flap!', {
      fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: tapHint, alpha: 0.3, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.setupInput();
    this.startCountdown(getReady, tapHint);
  }

  // ─── Background ────────────────────────────────────────────────────────────
  private addBackground() {
    if (this.textures.exists('background')) {
      this.add.image(180, 320, 'background').setDisplaySize(360, 640);
    } else {
      this.cameras.main.setBackgroundColor('#4EC0CA');
    }
  }

  // ─── Ground ────────────────────────────────────────────────────────────────
  private addGround() {
    const key = this.textures.exists('base') ? 'base' : 'ground-fb';
    if (!this.textures.exists('ground-fb')) {
      const g = this.add.graphics();
      g.fillStyle(0xDEB887); g.fillRect(0, 0, 360, 36);
      g.fillStyle(0x8B6914); g.fillRect(0, 0, 360, 6);
      g.generateTexture('ground-fb', 360, 36); g.destroy();
    }
    this.ground = this.physics.add.staticImage(180, 622, key) as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
    this.ground.setDisplaySize(360, 36);
    this.ground.refreshBody();
  }

  // ─── Bird ──────────────────────────────────────────────────────────────────
  //
  // HITBOX APPROACH:
  //   We use a VERY tight hitbox — 45% of texture dimensions, centred.
  //   This matches what the player actually sees as the "solid" part of the bird.
  //   Transparent padding in the texture means the actual drawn bird is much
  //   smaller than the full texture rect.
  //
  //   Additionally we use setCircle() for the physics body — a round bird
  //   feels much fairer than a rectangular hitbox, especially at angles.
  //
  private createBird() {
    if (!this.textures.exists('bird-fallback')) {
      const g = this.add.graphics();
      // Simple round yellow bird
      g.fillStyle(0xFFD700); g.fillCircle(16, 16, 13);
      g.fillStyle(0xFF8C00); g.fillCircle(23, 14, 4);   // beak
      g.fillStyle(0x000000); g.fillCircle(20, 12, 2.5); // eye
      g.fillStyle(0xFFFFFF); g.fillCircle(19, 11, 1);   // eye shine
      g.generateTexture('bird-fallback', 32, 32); g.destroy();
    }

    const key = this.textures.exists('bird-frame1') ? 'bird-frame1' : 'bird-fallback';
    this.bird = this.physics.add.sprite(90, 300, key) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.bird.setScale(BIRD_SCALE).setDepth(5);

    // ── Circular hitbox — much fairer than rect at all angles ──────────
    // setCircle(radius, offsetX, offsetY) — all in texture-space pixels
    // Texture is ~300px wide. At scale 0.082 that's 24.6px rendered width.
    // We want about a 9px radius circle = 110 texture pixels, centred.
    // Centre offset: (300 - 220) / 2 = 40 each side
    const texW = this.bird.width;   // actual texture width
    const texH = this.bird.height;
    const radius  = texW * 0.37;    // 37% of texture width as radius
    const offsetX = texW / 2 - radius;
    const offsetY = texH / 2 - radius;
    this.bird.body.setCircle(radius, offsetX, offsetY);

    // Build animation if not already exists
    if (!this.anims.exists('fly') && this.textures.exists('bird-frame2')) {
      this.anims.create({
        key: 'fly',
        frames: [{ key: 'bird-frame1' }, { key: 'bird-frame2' }],
        frameRate: IDLE_ANIM_RATE,
        repeat: -1,
      });
    }
    if (this.textures.exists('bird-frame1')) this.bird.play('fly');
  }

  // ─── Input ─────────────────────────────────────────────────────────────────
  private setupInput() {
    this.input.off('pointerdown');
    this.input.on('pointerdown', () => {
      if (this.gameStarted && !this.gameOver) this.flap();
    });
    if (this.input.keyboard) {
      this.input.keyboard.off('keydown-SPACE');
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.gameStarted && !this.gameOver) this.flap();
      });
    }
  }

  // ─── Countdown ─────────────────────────────────────────────────────────────
  private startCountdown(getReady: Phaser.GameObjects.Text, tapHint: Phaser.GameObjects.Text) {
    // Gentle waiting bob
    this.tweens.add({
      targets: this.bird, y: 292,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    let count = 3;
    this.countdownText.setText('3');

    const tick = this.time.addEvent({
      delay: 1000, repeat: 2,
      callback: () => {
        count--;
        if (count > 0) {
          this.countdownText.setText(count.toString());
          this.tweens.add({
            targets: this.countdownText,
            scaleX: 1.4, scaleY: 1.4,
            duration: 180, yoyo: true, ease: 'Back.easeOut',
          });
        } else {
          this.countdownText.destroy();
          getReady.destroy();
          tapHint.destroy();
          tick.destroy();
          this.startGame();
        }
      },
    });
  }

  // ─── Game start ────────────────────────────────────────────────────────────
  private startGame() {
    this.gameStarted = true;
    this.elapsedTime = 0;
    this.tweens.killTweensOf(this.bird);

    this.physics.world.gravity.y = GRAVITY;
    this.bird.setVelocityY(-120);

    // First pair after a fixed comfortable delay so player can orient
    this.time.delayedCall(1200, () => {
      if (!this.gameOver) {
        this.spawnPipePair();
        this.resetPipeInterval(); // start the rolling interval after first spawn
      }
    });
  }

  // Recreate the pipe interval using the CURRENT speed so horizontal
  // density stays consistent. Called after every speed-up.
  private resetPipeInterval() {
    if (this.pipeInterval) this.pipeInterval.destroy();
    this.pipeInterval = this.time.addEvent({
      delay: pipeSpawnMs(this.speedMultiplier),
      loop:  true,
      callback: this.spawnPipePair,
      callbackScope: this,
    });
  }

  // ─── update ────────────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    if (!this.gameStarted || this.gameOver) return;

    // ── Time + speed tier ──────────────────────────────────────────────
    this.elapsedTime += delta / 1000;
    this.timerText.setText(`${Math.floor(this.elapsedTime)}s`);

    const targetTier = Math.floor(this.elapsedTime / SPEED_STEP);
    if (targetTier > this.speedTier) {
      this.speedTier++;
      this.speedMultiplier = Math.min(SPEED_MAX, 1 + this.speedTier * SPEED_INCREMENT);
      this.applySpeedUp();
    }

    // Speed-up warning: show 5s before next tier
    const toNext = (this.speedTier + 1) * SPEED_STEP - this.elapsedTime;
    if (toNext <= 5 && toNext > 0 && !this.speedTickShowing) {
      this.speedTickShowing = true;
      this.startSpeedTick(Math.ceil(toNext));
    }

    // ── Wing animation synced to vertical velocity ─────────────────────
    //
    // This is the fix for the wing/fall mismatch.
    // When the bird is rising (just flapped): fast wing beats — the bird
    // is actively fighting gravity, wings are working hard.
    // When the bird is falling: slow lazy wing beats — it's gliding/falling.
    // We detect the transition between rising and falling and update the
    // animation rate only on state change, not every frame (perf).
    //
    if (this.bird?.body) {
      const vy        = this.bird.body.velocity.y;
      const nowRising = vy < -60;

      if (nowRising !== this.isRising) {
        this.isRising = nowRising;
        if (this.bird.anims.isPlaying) {
          this.bird.anims.msPerFrame = nowRising
            ? 1000 / FLAP_ANIM_RATE   // fast: ~71ms per frame
            : 1000 / IDLE_ANIM_RATE;  // slow: ~167ms per frame
        }
      }

      // ── Rotation — lerped to feel natural ────────────────────────────
      // Map: rising fast → nose up (-25°), falling fast → nose down (45°)
      // Using a gentler curve than before so it doesn't feel exaggerated
      const normVY = Phaser.Math.Clamp(vy / 500, -1, 1);
      this.targetRotation = normVY * 0.7; // max ±40°
      this.bird.rotation  = Phaser.Math.Linear(
        this.bird.rotation,
        this.targetRotation,
        Math.min(1, delta / 90) // 90ms to reach target — slightly slower = smoother
      );
    }

    // ── Off-screen death ───────────────────────────────────────────────
    if (this.bird && (this.bird.y < -60 || this.bird.y > 680)) {
      this.gameOverHandler();
      return;
    }

    // ── Scoring — per-frame, no timer gap ─────────────────────────────
    this.pipes.getChildren().forEach((p: any) => {
      if (!p.isTop && !p.scored && p.active) {
        if (p.x + p.displayWidth / 2 < this.bird.x - 6) {
          p.scored = true;
          this.score++;
          this.scoreText.setText(this.score.toString());
          this.tweens.add({
            targets: this.scoreText,
            scaleX: 1.25, scaleY: 1.25,
            duration: 80, yoyo: true, ease: 'Sine.easeOut',
          });
          if (navigator.vibrate) navigator.vibrate(6);
        }
      }
    });

    // ── Cull pipes ─────────────────────────────────────────────────────
    this.pipes.getChildren().forEach((p: any) => {
      if (p.x < -80) p.destroy();
    });
  }

  // ─── Flap ──────────────────────────────────────────────────────────────────
  private flap() {
    this.bird.setVelocityY(FLAP_VELOCITY);

    // Immediate rotation kick — nose up snap then lerp back
    this.bird.rotation = -0.3;

    // Wing squish — vertical compress on flap, feels punchy
    this.tweens.killTweensOf(this.bird);
    this.tweens.add({
      targets: this.bird,
      scaleX: BIRD_SCALE * 1.15,  // slight horizontal spread
      scaleY: BIRD_SCALE * 0.72,  // compress vertically
      duration: 55,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Restore exact scale after squish
        this.bird.setScale(BIRD_SCALE);
      },
    });
  }

  // ─── Pipe spawning ─────────────────────────────────────────────────────────
  private spawnPipePair() {
    if (this.gameOver || !this.textures.exists('pipe')) return;

    // Gap shrinks with score — starts harder than before
    const gap     = Math.max(PIPE_GAP_MIN, PIPE_GAP_BASE - Math.floor(this.score / 6) * 8);
    const centreY = Phaser.Math.Between(165, 435);
    const pipeW   = 52;
    const groundY = 604;
    const vel     = PIPE_SPEED_BASE * this.speedMultiplier;

    const topHeight    = centreY - gap / 2;
    const bottomTop    = centreY + gap / 2;
    const bottomHeight = groundY - bottomTop;

    if (topHeight > 10) {
      const top = this.pipes.create(415, topHeight / 2, 'pipe') as any;
      top.setDisplaySize(pipeW, topHeight);
      top.setFlipY(true).setImmovable(true);
      top.body.allowGravity = false;
      top.body.setVelocityX(vel);
      top.refreshBody();
      top.scored = false; top.isTop = true;
      top.setDepth(4);
    }

    if (bottomHeight > 10) {
      const bot = this.pipes.create(415, bottomTop + bottomHeight / 2, 'pipe') as any;
      bot.setDisplaySize(pipeW, bottomHeight);
      bot.setImmovable(true);
      bot.body.allowGravity = false;
      bot.body.setVelocityX(vel);
      bot.refreshBody();
      bot.scored = false; bot.isTop = false;
      bot.setDepth(4);
    }
  }

  // ─── Speed up ──────────────────────────────────────────────────────────────
  private applySpeedUp() {
    const vel = PIPE_SPEED_BASE * this.speedMultiplier;
    this.pipes.getChildren().forEach((p: any) => {
      if (p.body) p.body.setVelocityX(vel);
    });
    this.clearSpeedTick();
    // Restart the spawn interval at the new speed so horizontal gap stays constant
    this.resetPipeInterval();
    this.cameras.main.flash(300, 255, 150, 0, 0.35);

    const label = this.add.text(180, 188, '⚡ SPEED UP!', {
      fontSize: '26px', color: '#ffdd00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: label, y: 148, alpha: 0,
      duration: 1200, ease: 'Sine.easeIn',
      onComplete: () => label.destroy(),
    });
  }

  // ─── Speed-up warning ──────────────────────────────────────────────────────
  private startSpeedTick(startCount: number) {
    if (this.speedTickText)  this.speedTickText.destroy();
    if (this.speedTickTimer) this.speedTickTimer.destroy();

    this.speedTickText = this.add.text(350, 38, `⚡${startCount}`, {
      fontSize: '19px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(15);

    let n = startCount;
    this.speedTickTimer = this.time.addEvent({
      delay: 1000, repeat: startCount - 1,
      callback: () => {
        n--;
        if (!this.speedTickText || this.gameOver) return;
        if (n <= 0) {
          this.clearSpeedTick();
        } else {
          this.speedTickText.setText(`⚡${n}`);
          if (n <= 2) this.speedTickText.setColor('#ff4444');
          this.tweens.add({
            targets: this.speedTickText,
            scaleX: 1.45, scaleY: 1.45,
            duration: 110, yoyo: true,
          });
        }
      },
    });
  }

  private clearSpeedTick() {
    this.speedTickShowing = false;
    if (this.speedTickTimer) { this.speedTickTimer.destroy(); this.speedTickTimer = undefined; }
    if (this.speedTickText)  { this.speedTickText.destroy();  this.speedTickText  = undefined; }
  }

  // ─── Game over ─────────────────────────────────────────────────────────────
  private gameOverHandler() {
    if (this.gameOver) return;
    this.gameOver = true;

    this.physics.pause();
    if (this.pipeInterval) this.pipeInterval.destroy();
    this.clearSpeedTick();

    this.bird.setTint(0xff4444);
    this.cameras.main.shake(200, 0.013);

    this.time.delayedCall(620, () => {
      this.scene.start('FlappyBirdGameOverScene', {
        userData:     this.userData,
        score:        this.score,
        uid:          this.uid,
        newHighScore: this.score > this.userData.highScore,
      });
    });
  }
}