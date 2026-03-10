import Phaser from 'phaser';
import { CompleteUserData } from '../../firebase/simple';

export class FlappyBirdGameScene extends Phaser.Scene {
  // User data from StartScene
  private userData!: CompleteUserData;
  
  // Game objects
  private bird!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private pipes!: Phaser.Physics.Arcade.Group;
  private ground!: Phaser.Types.Physics.Arcade.ImageWithStaticBody;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private gameOver: boolean = false;
  private gameStarted: boolean = false;
  private countdown: number = 3;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownInterval!: Phaser.Time.TimerEvent;
  private pipeInterval!: Phaser.Time.TimerEvent;
  
  // Mobile optimization
  private isMobile: boolean;
  
  constructor() {
    super({ key: 'FlappyBirdGameScene' });
    
    // Detect mobile
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  
  init(data: { userData: CompleteUserData }) {
    console.log('🎮 GameScene initialized with data:', data);
    
    if (!data || !data.userData) {
      console.error('❌ No user data received!');
      this.scene.start('FlappyBirdStartScene');
      return;
    }
    
    this.userData = data.userData;
    console.log('👤 Playing as:', this.userData.displayName);
    console.log('💰 Balance:', this.userData.balance);
    
    // Reset game state
    this.gameOver = false;
    this.gameStarted = false;
    this.score = 0;
    this.countdown = 3;
  }
  
  create() {
    console.log('🎨 Creating GameScene...');
    
    // Add background
    this.addBackground();
    
    // Add ground (with collision)
    this.addGround();
    
    // Create bird
    this.createBird();
    
    // Set world bounds
    this.physics.world.setBounds(0, 0, 360, 640);
    this.bird.setCollideWorldBounds(true);
    
    // Add gravity (bird will start falling after countdown)
    this.physics.world.gravity.y = 0; // Start with no gravity
    
    // Score text (top center)
    this.scoreText = this.add.text(180, 50, '0', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5, 0);
    
    // Get ready text
    this.add.text(180, 250, 'GET READY!', {
      fontSize: '28px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);
    
    // Countdown text
    this.countdownText = this.add.text(180, 320, '3', {
      fontSize: '72px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);
    
    // Balance display (top left)
    this.add.text(10, 10, `$${this.userData.balance.toFixed(2)}`, {
      fontSize: '14px',
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 5, y: 2 }
    });
    
    // Pipes group (clear any existing pipes)
    if (this.pipes) {
      this.pipes.clear(true, true);
    } else {
      this.pipes = this.physics.add.group();
    }
    
    // Input handlers
    this.setupInput();
    
    // Start countdown
    this.startCountdown();
    
    console.log('✅ GameScene created');
  }
  
  private addBackground() {
    if (this.textures.exists('background')) {
      const bg = this.add.image(180, 320, 'background');
      bg.setDisplaySize(360, 640);
    } else {
      this.cameras.main.setBackgroundColor('#87CEEB');
    }
  }
  
  private addGround() {
    if (this.textures.exists('base')) {
      // Add ground at bottom of screen
      this.ground = this.physics.add.staticImage(180, 620, 'base') as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
      this.ground.setDisplaySize(360, 40);
      this.ground.setOffset(0, 0);
      this.ground.refreshBody();
    } else {
      // Fallback if base texture missing
      const groundGraphics = this.add.graphics();
      groundGraphics.fillStyle(0x8B4513, 1);
      groundGraphics.fillRect(0, 620, 360, 20);
      groundGraphics.generateTexture('ground-fallback', 360, 20);
      
      this.ground = this.physics.add.staticImage(180, 630, 'ground-fallback') as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
      this.ground.setDisplaySize(360, 20);
      this.ground.refreshBody();
    }
  }
  
  private createBird() {
    if (this.textures.exists('bird-frame1')) {
      this.bird = this.physics.add.sprite(100, 300, 'bird-frame1') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      this.bird.setScale(0.1);
      
      // Wait a frame for body to initialize
      this.time.delayedCall(50, () => {
        if (this.bird && this.bird.body) {
          // Make collision body EXACTLY match the visual size
          // Original bird image is likely around 40x40, scaled to 0.1 = 4x4 pixels
          // Let's make it a bit bigger for better collision detection
          this.bird.body.setSize(8, 8); // Slightly larger than visual for better feel
          this.bird.body.setOffset(2, 2);
          console.log('✅ Bird collision body adjusted');
        }
      });
      
      // Create flying animation
      if (!this.anims.exists('fly')) {
        this.anims.create({
          key: 'fly',
          frames: [
            { key: 'bird-frame1' },
            { key: 'bird-frame2' }
          ],
          frameRate: 8,
          repeat: -1
        });
      }
      
      this.bird.play('fly');
    } else {
      // Fallback
      console.warn('Bird assets not found, using fallback');
      const birdGraphics = this.add.graphics();
      birdGraphics.fillStyle(0xffff00, 1);
      birdGraphics.fillCircle(0, 0, 15);
      birdGraphics.generateTexture('bird-fallback', 30, 30);
      this.bird = this.physics.add.sprite(100, 300, 'bird-fallback') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      this.bird.setScale(1);
    }
    
    // Add collision with ground
    if (this.ground) {
      this.physics.add.collider(this.bird, this.ground, () => this.gameOverHandler());
    }
  }
  
  private startCountdown() {
    // Stop any existing countdown
    if (this.countdownInterval) {
      this.countdownInterval.destroy();
    }
    
    // Countdown timer
    this.countdown = 3;
    this.countdownText.setText(this.countdown.toString());
    this.countdownText.setVisible(true);
    
    // Make bird bob slightly while waiting
    this.tweens.add({
      targets: this.bird,
      y: 290,
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    
    // Countdown interval
    this.countdownInterval = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;
        
        if (this.countdown > 0) {
          // Update countdown text
          this.countdownText.setText(this.countdown.toString());
          
          // Scale effect
          this.tweens.add({
            targets: this.countdownText,
            scale: 1.5,
            duration: 200,
            yoyo: true
          });
        } else {
          // Countdown finished
          this.countdownText.destroy();
          this.countdownInterval.destroy();
          
          // Start the game
          this.startGame();
        }
      },
      callbackScope: this,
      loop: true,
      startAt: 0
    });
  }
  
  private setupInput() {
    // Clear any existing input listeners
    this.input.off('pointerdown');
    
    // Mobile touch
    this.input.on('pointerdown', () => {
      if (this.gameStarted && !this.gameOver) {
        this.flap();
      }
    });
    
    // Keyboard for testing
    if (this.input.keyboard) {
      this.input.keyboard.off('keydown-SPACE');
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.gameStarted && !this.gameOver) {
          this.flap();
        }
      });
    }
  }
  
  startGame() {
    console.log('🚀 Game started');
    this.gameStarted = true;
    
    // Stop the bobbing animation
    this.tweens.killTweensOf(this.bird);
    
    // Enable gravity
    this.physics.world.gravity.y = 1000; // Slightly lower for better control
    
    // Give bird a little initial flap to start
    this.bird.setVelocityY(-200);
    
    // Clear any existing pipe interval
    if (this.pipeInterval) {
      this.pipeInterval.destroy();
    }
    
    // Start spawning pipes
    this.pipeInterval = this.time.addEvent({
      delay: 1800,
      callback: this.addPipes,
      callbackScope: this,
      loop: true
    });
  }
  
  update() {
    if (!this.gameStarted || this.gameOver) return;
    
    // Rotate bird based on velocity
    if (this.bird.body) {
      const velocity = this.bird.body.velocity.y;
      
      // Limit rotation
      if (velocity < -100) {
        // Going up fast
        this.bird.setRotation(-0.2);
      } else if (velocity > 100) {
        // Going down
        this.bird.setRotation(Math.min(0.3, velocity / 1000));
      } else {
        // Level flight
        this.bird.setRotation(0);
      }
    }
    
    // Remove pipes that are off screen
    this.pipes.getChildren().forEach((pipe: any) => {
      if (pipe.x < -60) {
        pipe.destroy();
      }
    });
  }
  
  flap() {
    console.log('🦅 Flap!');
    this.bird.setVelocityY(-280); // Reduced for better control
    
    // Quick rotation up
    this.bird.setRotation(-0.2);
    
    // Small tap feedback
    this.tweens.add({
      targets: this.bird,
      scaleX: 0.105,
      scaleY: 0.105,
      duration: 50,
      yoyo: true
    });
  }
  
  addPipes() {
    console.log('Adding pipes');
    
    if (!this.textures.exists('pipe')) {
      console.warn('Pipe texture not found');
      return;
    }
    
    // Dynamic gap size based on score - gets harder as score increases
    let gapSize = 200; // Start easy
    
    if (this.score > 20) {
      gapSize = 160; // Hard
    } else if (this.score > 10) {
      gapSize = 180; // Medium
    }
    
    // Random gap position
    const gapY = Phaser.Math.Between(200, 400);
    
    // PIPE DIMENSIONS
    const pipeWidth = 45;
    const groundLevel = 620; // Ground Y position
    
    // BOTTOM PIPE - positioned to reach the ground
    const bottomY = gapY + gapSize / 2;
    const bottomHeight = groundLevel - bottomY;
    
    const bottomPipe = this.pipes.create(360, bottomY + bottomHeight/2, 'pipe') as any;
    bottomPipe.setVelocityX(-150);
    bottomPipe.setImmovable(true);
    bottomPipe.body.allowGravity = false;
    bottomPipe.scored = false;
    bottomPipe.setScale(0.7);
    bottomPipe.setDisplaySize(pipeWidth, bottomHeight);
    
    // Adjust collision body to match display size exactly
    bottomPipe.body.setSize(pipeWidth, bottomHeight);
    bottomPipe.body.setOffset(0, -bottomHeight/2 + 20); // Adjust offset
    
    // TOP PIPE - positioned from top
    const topY = gapY - gapSize / 2;
    const topHeight = topY - 0; // From top of screen
    
    const topPipe = this.pipes.create(360, topY - topHeight/2, 'pipe') as any;
    topPipe.setVelocityX(-150);
    topPipe.setImmovable(true);
    topPipe.body.allowGravity = false;
    topPipe.setFlipY(true);
    topPipe.setScale(0.7);
    topPipe.setDisplaySize(pipeWidth, topHeight);
    
    // Adjust collision body for top pipe
    topPipe.body.setSize(pipeWidth, topHeight);
    topPipe.body.setOffset(0, -topHeight/2 + 20);
    
    // Add collision with pixel-perfect detection
    this.physics.add.collider(this.bird, bottomPipe, () => this.gameOverHandler());
    this.physics.add.collider(this.bird, topPipe, () => this.gameOverHandler());
    
    // Scoring system
    this.time.delayedCall(100, () => {
      const scoreCheck = this.time.addEvent({
        delay: 50,
        callback: () => {
          if (this.gameOver || !bottomPipe || !bottomPipe.scene) {
            scoreCheck.destroy();
            return;
          }
          
          // Check if bird has passed the pipe
          if (bottomPipe.x < this.bird.x - 30 && !bottomPipe.scored) {
            this.score += 1;
            this.scoreText.setText(this.score.toString());
            bottomPipe.scored = true;
            
            // Small haptic feedback
            if (navigator.vibrate) {
              navigator.vibrate(10);
            }
            
            scoreCheck.destroy();
          }
        },
        callbackScope: this,
        loop: true
      });
    });
  }
  
  gameOverHandler() {
    if (this.gameOver) return;
    
    console.log('💀 Game Over! Final score:', this.score);
    this.gameOver = true;
    this.physics.pause();
    
    // Stop pipe spawning
    if (this.pipeInterval) {
      this.pipeInterval.destroy();
    }
    
    // Check if it's a new high score
    const newHighScore = this.score > this.userData.highScore;
    
    // Go to GameOverScene
    this.scene.start('FlappyBirdGameOverScene', {
      userData: this.userData,
      score: this.score,
      newHighScore: newHighScore
    });
  }
}