// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';
import { 
  updateBallCrushProfileStats, 
  addBallCrushWinnings,
  getBallCrushBalance,
  updateBallCrushWalletBalance 
} from '../../firebase/ballCrushSimple';

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = ''; // Add this to store user ID

  // Game objects
  private player!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private opponent!: Phaser.GameObjects.Image;
  
  // UI Elements
  private scoreText!: Phaser.GameObjects.Text;
  private score: number = 0;

  // Game state
  private gameActive: boolean = true;
  private ballSpeed: number = 200;
  private ballDirection: Phaser.Math.Vector2;
  private playerHealth: number = 5;
  private opponentHealth: number = 5;
  private playerHealthBars: Phaser.GameObjects.Image[] = [];
  private opponentHealthBars: Phaser.GameObjects.Image[] = [];
  private opponentSpeed: number = 3;
  private speedMultiplier: number = 1.0;
  private lastSpeedIncrease: number = 0;
  private speedIncreaseInterval: number = 30000;
  
  // Game tracking
  private gameStartTime: number = 0;
  private currentScore: number = 0;
  
  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 5;

  constructor() {
    super({ key: 'BallCrushGameScene' });
    this.ballDirection = new Phaser.Math.Vector2(1, 1).normalize();
  }

  init(data: { username: string; uid: string }) {
    this.username = data.username || 'Player';
    this.uid = data.uid || '';
    console.log('⚽ BallCrushGameScene started for:', this.username, 'UID:', this.uid);
  }

  create() {
    // Track game start time
    this.gameStartTime = Date.now();
    this.currentScore = 0;

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

    // Create opponent
    this.createOpponent();
    
    // Create UI
    this.createUI();

    // Set up input
    this.setupInput();

    // Start the game
    this.gameActive = true;

    // Set initial random direction
    const angle = Phaser.Math.Between(0, 3) * 90 + 45;
    const rad = Phaser.Math.DegToRad(angle);
    this.ballDirection.set(Math.cos(rad), Math.sin(rad));

    // Start speed increase timer
    this.lastSpeedIncrease = this.time.now;
  }

  private createPlayer() {
    this.player = this.add.image(180, 550, 'player');
    this.player.setScale(0.15);

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

    this.ball = this.add.image(180, 300, 'ball');
    this.ball.setScale(0.15);
  }

  private hitOpponent() {
    this.tweens.add({
      targets: this.opponent,
      scale: 0.2,
      duration: 100,
      yoyo: true
    });

    const hitPosition = (this.ball.x - this.opponent.x) / 30;
    const clampedHit = Phaser.Math.Clamp(hitPosition, -0.9, 0.9);
    const randomFactor = Phaser.Math.FloatBetween(-0.3, 0.3);

    this.ballDirection.x = clampedHit * 1.2 + randomFactor;
    this.ballDirection.y = 0.7;
    this.ballDirection.x = Phaser.Math.Clamp(this.ballDirection.x, -0.9, 0.9);
    this.ballDirection.normalize();

    if (this.ballDirection.y < 0) {
      this.ballDirection.y = Math.abs(this.ballDirection.y);
    }

    this.ballSpeed = Math.min(this.ballSpeed + 3, 400);
  }

  private checkPaddleCollision() {
    if (!this.gameActive || !this.ball || !this.player || !this.opponent) return;

    const ballLeft = this.ball.x - 12;
    const ballRight = this.ball.x + 12;
    const ballTop = this.ball.y - 12;
    const ballBottom = this.ball.y + 12;

    // Player paddle collision
    if (this.ballDirection.y > 0) {
      const paddleLeft = this.player.x - 35;
      const paddleRight = this.player.x + 35;
      const paddleTop = this.player.y - 10;
      const paddleBottom = this.player.y + 10;

      if (ballLeft < paddleRight &&
        ballRight > paddleLeft &&
        ballBottom >= paddleTop &&
        ballTop <= paddleBottom &&
        this.ball.y < this.player.y) {
        
        this.hitPlayer();
        this.ball.y = this.player.y - 22;
      }
    }

    // Opponent paddle collision
    if (this.ballDirection.y < 0) {
      const paddleLeft = this.opponent.x - 35;
      const paddleRight = this.opponent.x + 35;
      const paddleTop = this.opponent.y - 10;
      const paddleBottom = this.opponent.y + 10;

      if (ballLeft < paddleRight &&
        ballRight > paddleLeft &&
        ballBottom >= paddleTop &&
        ballTop <= paddleBottom &&
        this.ball.y > this.opponent.y) {
        
        this.hitOpponent();
        this.ball.y = this.opponent.y + 22;
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

    // Increase score on hit
    this.score++;
    this.currentScore = this.score;
    this.scoreText.setText(`Score: ${this.score}`);

    const hitPosition = (this.ball.x - this.player.x) / 30;
    const clampedHit = Phaser.Math.Clamp(hitPosition, -0.9, 0.9);
    const randomFactor = Phaser.Math.FloatBetween(-0.3, 0.3);

    this.ballDirection.x = clampedHit * 1.2 + randomFactor;
    this.ballDirection.y = -0.7;
    this.ballDirection.x = Phaser.Math.Clamp(this.ballDirection.x, -0.9, 0.9);
    this.ballDirection.normalize();

    if (this.ballDirection.y > 0) {
      this.ballDirection.y = -Math.abs(this.ballDirection.y);
    }

    this.ballSpeed = Math.min(this.ballSpeed + 5, 400);
  }

  private createUI() {
    // Player health bars (bottom)
    const playerStartX = 80;
    for (let i = 0; i < this.playerHealth; i++) {
      const healthBar = this.add.image(playerStartX + (i * 40), 620, 'ball');
      healthBar.setScale(0.1);
      healthBar.setTint(0x00ff00);
      this.playerHealthBars.push(healthBar);
    }

    // Opponent health bars (top) - FIXED: Changed from green to red
    const opponentStartX = 80;
    for (let i = 0; i < this.opponentHealth; i++) {
      const healthBar = this.add.image(opponentStartX + (i * 40), 20, 'ball');
      healthBar.setScale(0.1);
      healthBar.setTint(0xff0000); // Red for opponent
      this.opponentHealthBars.push(healthBar);
    }

    // Score display
    this.scoreText = this.add.text(180, 300, 'Score: 0', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Instructions
    this.add.text(180, 560, 'Move with ← → arrows or touch', {
      fontSize: '12px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  private createOpponent() {
    this.opponent = this.add.image(180, 50, 'player');
    this.opponent.setScale(0.15);
    this.opponent.setFlipY(true);

    this.add.text(180, 30, 'CPU', {
      fontSize: '14px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
  }

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

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
    if (this.ball.y + moveY >= 628) {
      this.resetBall('opponent');
      return;
    }

    // Check if ball missed opponent paddle (top)
    if (this.ball.y + moveY <= 12) {
      this.resetBall('player');
      return;
    }

    // Check for paddle collision
    this.checkPaddleCollision();

    // Opponent AI movement
    if (this.opponent && this.ball) {
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
    this.ball.x += moveX;
    this.ball.y += moveY;

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

  private async gameOver(message: string, won: boolean) {
    this.gameActive = false;

    // Calculate game duration
    const duration = Math.floor((Date.now() - this.gameStartTime) / 1000);
    
    console.log(`🏁 Game Over - Won: ${won}, Score: ${this.currentScore}, Duration: ${duration}s`);

    // Update profile stats in Firebase
    if (this.uid) {
      try {
        await updateBallCrushProfileStats(
          this.uid,
          this.currentScore,
          won,
          duration
        );
        console.log('✅ Profile stats updated');

        // If player won, add winnings
        if (won) {
          await addBallCrushWinnings(
            this.uid,
            0.50,
            `Ball Crush victory - Score: ${this.currentScore}`
          );
          console.log('💰 Added $0.50 to winnings');
          
          // Show winnings popup
          this.showWinningsPopup();
        }

        // Deduct game fee (already deducted at start, but ensure it's recorded)
        // This is just for record keeping if needed
        console.log('💳 Game completed');

      } catch (error) {
        console.error('❌ Error updating game stats:', error);
      }
    }

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
      color: won ? '#ffff00' : '#ff6666',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Show score
    this.add.text(180, 360, `Score: ${this.currentScore}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(180, 400, 'Click to return to menu', {
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Add restart handler
    this.input.once('pointerdown', () => {
      this.scene.start('BallCrushStartScene', { 
        username: this.username,
        uid: this.uid 
      });
    });
  }

  private showWinningsPopup() {
    const popup = this.add.text(180, 200, '+$0.50', {
      fontSize: '32px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({
      targets: popup,
      y: 150,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => popup.destroy()
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
        this.speedMultiplier = 1.0;
        this.gameOver('CPU Wins!', false); // Pass false for lost
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

      // Check if opponent lost (PLAYER WINS!)
      if (this.opponentHealth <= 0) {
        this.speedMultiplier = 1.0;
        this.gameOver('You Win!', true); // Pass true for won
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
      angle = Phaser.Math.Between(225, 315); // Downward
    } else {
      angle = Phaser.Math.Between(45, 135);  // Upward
    }

    const rad = Phaser.Math.DegToRad(angle);
    this.ballDirection.set(Math.cos(rad), Math.sin(rad));
  }

  private increaseSpeed() {
    this.speedMultiplier *= 1.5;
    this.ballSpeed = 200 * this.speedMultiplier;

    this.cameras.main.flash(500, 255, 255, 255, 0.3);

    const speedText = this.add.text(180, 200, `SPEED x${this.speedMultiplier.toFixed(1)}!`, {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#ff0000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({
      targets: speedText,
      y: 150,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => speedText.destroy()
    });
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