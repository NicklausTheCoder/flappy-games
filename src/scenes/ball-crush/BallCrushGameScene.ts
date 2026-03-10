// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  
  // Game objects
  private player!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Image; // Use Image instead of Rectangle
  
  // UI Elements
  private scoreText!: Phaser.GameObjects.Text;
  private score: number = 0;
  
  // Game state
  private gameActive: boolean = true;
  
  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 5;
  
  constructor() {
    super({ key: 'BallCrushGameScene' });
  }
  
  init(data: { username: string }) {
    this.username = data.username || 'Player';
    console.log('⚽ BallCrushGameScene started for:', this.username);
  }
  
  create() {
    // Enable physics with world bounds
    this.physics.world.setBounds(0, 0, 360, 640);
    
    // Set no gravity
    this.physics.world.gravity.y = 0;
    
    // Background
    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
      bg.setDepth(-1);
    } else {
      this.cameras.main.setBackgroundColor('#1a3a1a');
    }
    
    // Create the board/court surface
    this.createBoard();
    
    // Add some decorative elements
    this.addBackgroundEffects();
    
    // Create player (bottom paddle)
    this.createPlayer();
    
    // Create ball with realistic physics
    this.createBall();
    
    // Create UI
    this.createUI();
    
    // Set up input
    this.setupInput();
    
    // Start the game
    this.gameActive = true;
  }
  
  private createBoard() {
    // Create a transparent 1x1 pixel texture for the board
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff, 0);
    graphics.fillRect(0, 0, 1, 1);
    graphics.generateTexture('transparent', 1, 1);
    
    // Create the board as a physics image
    this.board = this.physics.add.image(180, 320, 'transparent');
    this.board.setDisplaySize(340, 600);
    this.board.setAlpha(0); // Invisible
    
    // Configure physics body
    const boardBody = this.board.body as Phaser.Physics.Arcade.Body;
    boardBody.setImmovable(true);
    boardBody.setAllowGravity(false);
    
    // Add collision between ball and board
    this.physics.add.collider(this.ball, this.board, this.hitBoard, undefined, this);
  }
  
  private createPlayer() {
    // Create player at bottom of screen
    this.player = this.physics.add.image(180, 550, 'player');
    this.player.setScale(0.15);
    
    // Configure physics body
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(40, 20);
    playerBody.setCollideWorldBounds(true);
    playerBody.setImmovable(true);
    
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
    this.ball = this.physics.add.image(180, 300, 'ball');
    this.ball.setScale(0.15);
    
    // Configure physics body
    const ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    
    // Random initial direction (any angle)
    const angle = Phaser.Math.Between(0, 360) * Math.PI / 180;
    const speed = 250;
    ballBody.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    
    // Physics properties
    ballBody.setBounce(1, 1); // Perfect bounce on walls
    ballBody.setCollideWorldBounds(true); // Let physics handle wall bounces
    ballBody.setCircle(12);
    ballBody.setDamping(false);
    ballBody.setDrag(0, 0);
    
    // Add collision between ball and player
    this.physics.add.collider(this.ball, this.player, this.hitPlayer, undefined, this);
    
    // Add trail effect using particles
    this.createTrailEffect();
  }
  
  private createTrailEffect() {
    // Create a particle trail for the ball
    if (!this.textures.exists('ball')) return;
    
    this.add.particles(0, 0, 'ball', {
      scale: { start: 0.08, end: 0.02 },
      alpha: { start: 0.3, end: 0 },
      lifespan: 300,
      frequency: 50,
      follow: this.ball,
      tint: 0xffaa00
    });
  }
  
  private hitPlayer(ball: any, player: any) {
    if (!this.gameActive) return;
    
    // Increase score on hit
    this.score++;
    this.scoreText.setText(`Score: ${this.score}`);
    
    // Visual feedback
    this.tweens.add({
      targets: this.player,
      scale: 0.2,
      duration: 100,
      yoyo: true
    });
    
    this.tweens.add({
      targets: this.ball,
      alpha: 0.5,
      duration: 100,
      yoyo: true
    });
    
    const ballBody = ball.body as Phaser.Physics.Arcade.Body;
    
    // Calculate where the ball hit the paddle
    const hitPosition = (ball.x - player.x) / 30;
    
    // Get current speed
    const currentSpeed = Math.sqrt(
      ballBody.velocity.x * ballBody.velocity.x + 
      ballBody.velocity.y * ballBody.velocity.y
    );
    
    // New velocity based on hit position
    ballBody.velocity.x = hitPosition * currentSpeed * 1.2;
    ballBody.velocity.y = -Math.abs(ballBody.velocity.y) * 1.1;
    
    // Ensure minimum speed
    if (Math.abs(ballBody.velocity.x) < 50) {
      ballBody.velocity.x = ballBody.velocity.x > 0 ? 50 : -50;
    }
    
    // Keep speed consistent
    const newSpeed = Math.sqrt(
      ballBody.velocity.x * ballBody.velocity.x + 
      ballBody.velocity.y * ballBody.velocity.y
    );
    
    ballBody.velocity.x = (ballBody.velocity.x / newSpeed) * currentSpeed;
    ballBody.velocity.y = (ballBody.velocity.y / newSpeed) * currentSpeed;
  }
  
  private hitBoard(ball: any, board: any) {
    if (!this.gameActive) return;
    
    console.log('⚽ Ball hit the board! Random direction!');
    
    // Visual feedback
    this.cameras.main.flash(200, 255, 200, 0, 0.5);
    
    const ballBody = ball.body as Phaser.Physics.Arcade.Body;
    
    // Get current speed
    const currentSpeed = Math.sqrt(
      ballBody.velocity.x * ballBody.velocity.x + 
      ballBody.velocity.y * ballBody.velocity.y
    );
    
    // Generate a random angle (0-360 degrees)
    const randomAngle = Phaser.Math.Between(0, 360) * Math.PI / 180;
    
    // Set new velocity in random direction
    ballBody.velocity.x = Math.cos(randomAngle) * currentSpeed;
    ballBody.velocity.y = Math.sin(randomAngle) * currentSpeed;
    
    // Ensure minimum speed
    if (Math.abs(ballBody.velocity.x) < 50) {
      ballBody.velocity.x = ballBody.velocity.x > 0 ? 50 : -50;
    }
    if (Math.abs(ballBody.velocity.y) < 50) {
      ballBody.velocity.y = ballBody.velocity.y > 0 ? 50 : -50;
    }
  }
  
  private createUI() {
    // Score display
    this.scoreText = this.add.text(180, 30, 'Score: 0', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    // Instructions
    this.add.text(180, 620, 'Move with ← → arrows or touch', {
      fontSize: '12px',
      color: '#ffffff'
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
  
  update() {
    if (!this.gameActive || !this.ball || !this.player) return;
    
    // Keyboard controls
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