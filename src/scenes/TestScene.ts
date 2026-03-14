// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';

  // Game objects
  private player!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private opponent!: Phaser.GameObjects.Image;  // ← Add this
  // UI Elements
  private scoreText!: Phaser.GameObjects.Text;
  private score: number = 0;

  // Game state
  private gameActive: boolean = true;
  private ballSpeed: number = 200;
  private ballDirection: Phaser.Math.Vector2;
  private playerHealth: number = 5;        // ← Change from health
  private opponentHealth: number = 5;      // ← Add this
  private playerHealthBars: Phaser.GameObjects.Image[] = [];    // ← Change name
  private opponentHealthBars: Phaser.GameObjects.Image[] = [];  // ← Add this
  private opponentSpeed: number = 3;  // ← Add this (slightly slower than player)
  private speedMultiplier: number = 1.0;  // ← Add this
  private lastSpeedIncrease: number = 0;   // ← Add this
  private speedIncreaseInterval: number = 30000; // 30 seconds in milliseconds ← Add this
  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 5;

  constructor() {
    super({ key: 'BallCrushGameScene' });
    this.ballDirection = new Phaser.Math.Vector2(1, 1).normalize();
  }

  init(data: { username: string }) {
    this.username = data.username || 'Player';
    console.log('⚽ BallCrushGameScene started for:', this.username);
  }

  create() {
    // Background
    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
      bg.setDepth(-1);
    } else {
      this.cameras.main.setBackgroundColor('#1a3a1a');
    }

    // Add some decorative elements
    this.addBackgroundEffects();

    // Create player (as a regular image)
    this.createPlayer();

    // Create ball (as a regular image)
    this.createBall();

    // Create opponent  // ← Add this
    this.createOpponent();  // ← Add this
    // Create UI
    this.createUI();

    // Set up input
    this.setupInput();

    // Start the game
    this.gameActive = true;

    // Set initial random direction
    const angle = Phaser.Math.Between(0, 3) * 90 + 45; // 45, 135, 225, or 315 degrees
    const rad = Phaser.Math.DegToRad(angle);
    this.ballDirection.set(Math.cos(rad), Math.sin(rad));

    // Start speed increase timer
    this.lastSpeedIncrease = this.time.now;  // ← Add this
  }

  private createPlayer() {
    // Create player at bottom of screen
    this.player = this.add.image(180, 550, 'player');
    this.player.setScale(0.15);

    // Add player name
    this.add.text(180, 590, 'YOU', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
  }

  private createBall() {
    if (!this.textures.exists('ball')) {
      console.error('❌ Ball texture not found');
      return;
    }

    // Create ball at center
    this.ball = this.add.image(180, 300, 'ball');
    this.ball.setScale(0.15);
  }
  private hitOpponent() {
    // Visual feedback for opponent hit
    this.tweens.add({
      targets: this.opponent,
      scale: 0.2,
      duration: 100,
      yoyo: true
    });

    // Calculate where the ball hit the opponent paddle (-1 to 1)
    const hitPosition = (this.ball.x - this.opponent.x) / 30;
    const clampedHit = Phaser.Math.Clamp(hitPosition, -0.9, 0.9);

    // Add some randomness to make it less predictable
    const randomFactor = Phaser.Math.FloatBetween(-0.3, 0.3);

    // Force ball to go downward with angle based on hit position + randomness
    this.ballDirection.x = clampedHit * 1.2 + randomFactor;
    this.ballDirection.y = 0.7; // Base downward movement

    // Clamp x to prevent going straight sideways
    this.ballDirection.x = Phaser.Math.Clamp(this.ballDirection.x, -0.9, 0.9);

    // Normalize to maintain consistent speed
    this.ballDirection.normalize();

    // Make sure it's actually pointing downward
    if (this.ballDirection.y < 0) {
      this.ballDirection.y = Math.abs(this.ballDirection.y);
    }

    // Slight speed increase on each hit
    this.ballSpeed = Math.min(this.ballSpeed + 3, 400);
  }


  private checkPaddleCollision() {
    if (!this.gameActive || !this.ball || !this.player || !this.opponent) return;

    // Ball collision box
    const ballLeft = this.ball.x - 12;
    const ballRight = this.ball.x + 12;
    const ballTop = this.ball.y - 12;
    const ballBottom = this.ball.y + 12;

    // Check player paddle collision (ball moving downward)
    if (this.ballDirection.y > 0) {
      const paddleLeft = this.player.x - 35;
      const paddleRight = this.player.x + 35;
      const paddleTop = this.player.y - 10;
      const paddleBottom = this.player.y + 10;

      // Check if ball overlaps paddle and is at the right Y position
      if (ballLeft < paddleRight &&
        ballRight > paddleLeft &&
        ballBottom >= paddleTop &&
        ballTop <= paddleBottom) {

        // Make sure ball is actually hitting from above
        if (this.ball.y < this.player.y) {
          this.hitPlayer();
          // Adjust ball position to prevent sticking
          this.ball.y = this.player.y - 22;
        }
      }
    }

    // Check opponent paddle collision (ball moving upward)
    if (this.ballDirection.y < 0) {
      const paddleLeft = this.opponent.x - 20;
      const paddleRight = this.opponent.x + 20;
      const paddleTop = this.opponent.y - 10;
      const paddleBottom = this.opponent.y + 10;

      // Check if ball overlaps paddle and is at the right Y position
      if (ballLeft < paddleRight &&
        ballRight > paddleLeft &&
        ballBottom >= paddleTop &&
        ballTop <= paddleBottom) {

        // Make sure ball is actually hitting from below
        if (this.ball.y > this.opponent.y) {
          this.hitOpponent();
          // Adjust ball position to prevent sticking
          this.ball.y = this.opponent.y + 22;
        }
      }
    }
  }

  private hitPlayer() {

    // Visual feedback
    this.tweens.add({
      targets: this.player,
      scale: 0.2,
      duration: 100,
      yoyo: true
    });

    // Calculate where the ball hit the paddle (-1 to 1)
    const hitPosition = (this.ball.x - this.player.x) / 30;
    const clampedHit = Phaser.Math.Clamp(hitPosition, -0.9, 0.9);

    // Add randomness to make it less predictable
    const randomFactor = Phaser.Math.FloatBetween(-0.3, 0.3);

    // Force ball to go upward with angle based on hit position + randomness
    this.ballDirection.x = clampedHit * 1.2 + randomFactor;
    this.ballDirection.y = -0.7; // Base upward movement (negative for up)

    // Clamp x to prevent going straight sideways
    this.ballDirection.x = Phaser.Math.Clamp(this.ballDirection.x, -0.9, 0.9);

    // Normalize to maintain consistent speed
    this.ballDirection.normalize();

    // Make sure it's actually pointing upward
    if (this.ballDirection.y > 0) {
      this.ballDirection.y = -Math.abs(this.ballDirection.y);
    }

    // Slight speed increase on each hit
    this.ballSpeed = Math.min(this.ballSpeed + 5, 400);
  }
  private createUI() {


    const playerStartX = 80;
    for (let i = 0; i < this.playerHealth; i++) {
      const healthBar = this.add.image(playerStartX + (i * 40), 620, 'ball');
      healthBar.setScale(0.1);
      healthBar.setTint(0x00ff00); // Green for player
      this.playerHealthBars.push(healthBar);
    }
    // Instructions
    // Opponent health bars at top
    const opponentStartX = 80;
    for (let i = 0; i < this.opponentHealth; i++) {
      const healthBar = this.add.image(opponentStartX + (i * 40), 20, 'ball');
      healthBar.setScale(0.1);
      healthBar.setTint(0x00ff00); // Green for player
      this.opponentHealthBars.push(healthBar);
    }
  }
  private createOpponent() {
    // Create opponent at top of screen
    this.opponent = this.add.image(180, 50, 'player');  // Same sprite as player
    this.opponent.setScale(0.15);
    this.opponent.setFlipY(true);  // Flip it upside down to look different

    // Add opponent name
    this.add.text(180, 30, 'CPU', {
      fontSize: '14px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
  }
  private setupInput() {
    // Keyboard controls
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // Touch controls
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.player) {
        this.movePlayerWithPointer(pointer);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.player) {
        this.movePlayerWithPointer(pointer);
      }
    });
  }

  private movePlayerWithPointer(pointer: Phaser.Input.Pointer) {
    if (!this.player) return;

    let newX = Phaser.Math.Clamp(pointer.x, 30, 330);
    this.player.x = newX;
  }

  update(time: number, delta: number) {
    if (!this.gameActive || !this.ball || !this.player || !this.opponent) return;

    // Manual ball movement

    // Check for speed increase every 30 seconds
    if (time - this.lastSpeedIncrease >= this.speedIncreaseInterval) {
      this.increaseSpeed();
      this.lastSpeedIncrease = time;
    }


    const deltaSeconds = delta / 1000;

    // Move ball in current direction
    const moveX = this.ballDirection.x * this.ballSpeed * deltaSeconds;
    const moveY = this.ballDirection.y * this.ballSpeed * deltaSeconds;

    // Check for wall collisions
    if (this.ball.x + moveX <= 12 || this.ball.x + moveX >= 348) {
      this.ballDirection.x *= -1;
    }

    // Check if ball missed player paddle (bottom)
    if (this.ball.y + (this.ballDirection.y * this.ballSpeed * deltaSeconds) >= 628) {
      this.resetBall('opponent');
      return;
    }

    // Check if ball missed opponent paddle (top)
    if (this.ball.y + (this.ballDirection.y * this.ballSpeed * deltaSeconds) <= 12) {
      this.resetBall('player');
      return;
    }

    // Check for paddle collision
    this.checkPaddleCollision();

    // Check if ball missed the paddle
    if (this.ball.y + moveY >= 628) {
      this.resetBall();
      return;
    }

    // Opponent AI movement
    if (this.opponent && this.ball) {
      // Move opponent toward ball position
      const targetX = this.ball.x;
      const currentX = this.opponent.x;

      if (Math.abs(targetX - currentX) > this.opponentSpeed) {
        if (targetX > currentX) {
          this.opponent.x = Math.min(330, this.opponent.x + this.opponentSpeed);
        } else {
          this.opponent.x = Math.max(30, this.opponent.x - this.opponentSpeed);
        }
      }
    }

    // Apply movement
    this.ball.x += this.ballDirection.x * this.ballSpeed * deltaSeconds;
    this.ball.y += this.ballDirection.y * this.ballSpeed * deltaSeconds;

    // Keyboard controls for player
    if (this.cursors) {
      if (this.cursors.left?.isDown) {
        this.player.x = Math.max(30, this.player.x - this.moveSpeed);
      }
      if (this.cursors.right?.isDown) {
        this.player.x = Math.min(330, this.player.x + this.moveSpeed);
      }
    }

    // Add rotation for visual effect
    this.ball.rotation += 0.02;
  }

  private gameOver(message: string) {
    this.gameActive = false;

    // Show game over text
    this.add.text(180, 280, 'GAME OVER', {
      fontSize: '32px',
      color: '#ff0000',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(180, 320, message, {
      fontSize: '24px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.add.text(180, 360, 'Click to restart', {
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Add restart handler
    this.input.once('pointerdown', () => {
      this.scene.restart({ username: this.username });
    });
  }
  private resetBall(whoScored: 'player' | 'opponent') {
    if (whoScored === 'opponent') {
      // Opponent scored - remove player health
      this.playerHealth--;

      // Remove player health bar
      if (this.playerHealthBars.length > 0) {
        this.playerHealthBars[this.playerHealthBars.length - 1].destroy();
        this.playerHealthBars.pop();
      }

      // Flash red for player damage
      this.cameras.main.flash(300, 255, 0, 0, 0.5);

      // Check if player lost
      if (this.playerHealth <= 0) {
        this.speedMultiplier = 1.0;  // ← Reset speed
        this.gameOver('CPU Wins!');
        return;
      }
    } else {
      // Player scored - remove opponent health
      this.opponentHealth--;

      // Remove opponent health bar
      if (this.opponentHealthBars.length > 0) {
        this.opponentHealthBars[this.opponentHealthBars.length - 1].destroy();
        this.opponentHealthBars.pop();
      }

      // Flash blue for opponent damage
      this.cameras.main.flash(300, 0, 0, 255, 0.5);

      // Check if opponent lost
      if (this.opponentHealth <= 0) {
        this.speedMultiplier = 1.0;  // ← Reset speed
        this.gameOver('You Win!');
        return;
      }
    }

    // Reset ball position to center
    this.ball.x = 180;
    this.ball.y = 320;

    // Reset ball speed
    this.ballSpeed = 200;

    // Serve toward the player who just got scored on
    let angle;
    if (whoScored === 'opponent') {
      // Opponent scored, serve toward player (downward)
      angle = Phaser.Math.Between(225, 315);
    } else {
      // Player scored, serve toward opponent (upward)
      angle = Phaser.Math.Between(45, 135);
    }

    const rad = Phaser.Math.DegToRad(angle);
    this.ballDirection.set(Math.cos(rad), Math.sin(rad));
  }
  private increaseSpeed() {
    // Multiply speed by 1.5
    this.speedMultiplier *= 1.5;
    this.ballSpeed = 200 * this.speedMultiplier; // Reset base speed with multiplier

    // Visual feedback - flash white
    this.cameras.main.flash(500, 255, 255, 255, 0.3);

    // Show speed increase text
    const speedText = this.add.text(180, 200, `SPEED x${this.speedMultiplier.toFixed(1)}!`, {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#ff0000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Animate and remove the text
    this.tweens.add({
      targets: speedText,
      y: 150,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => {
        speedText.destroy();
      }
    });

    console.log(`⚡ Speed increased to ${this.ballSpeed} (${this.speedMultiplier}x)`);
  }
  private addBackgroundEffects() {
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(50, 310);
      const y = Phaser.Math.Between(100, 540);
      const circle = this.add.circle(x, y, 10, 0xffaa00, 0.05);

      this.tweens.add({
        targets: circle,
        y: y + 20,
        alpha: 0.1,
        duration: 3000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }
}