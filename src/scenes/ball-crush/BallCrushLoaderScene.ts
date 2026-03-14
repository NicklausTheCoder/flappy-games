// src/scenes/ball-crush/BallCrushLoaderScene.ts
import Phaser from 'phaser';

export class BallCrushLoaderScene extends Phaser.Scene {
  // Simple loading circle
  private loadingCircle!: Phaser.GameObjects.Graphics;
  private loadingAngle: number = 0;
  private loadingText!: Phaser.GameObjects.Text;
  private backgroundImage!: Phaser.GameObjects.Image;
  private ballImage!: Phaser.GameObjects.Image;
  private progressBar!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  
  // Username received from CookieScene
  private username: string = '';
  
  constructor() {
    super({ key: 'BallCrushLoaderScene' });
  }
  
  init(data: { username: string }) {
    console.log('⚽ BallCrushLoaderScene initialized with data:', data);
    
    if (data && data.username) {
      this.username = data.username;
      console.log('👤 Username received from CookieScene:', this.username);
    } else {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }
  }
  
  preload() {
    // Create loading UI first
    this.createLoadingUI();
    
    // Set up progress tracking
    this.load.on('progress', this.onLoadProgress, this);
    this.load.on('complete', this.onLoadComplete, this);
    
    // Load ALL game assets
    this.loadAssets();
  }
  
  create() {
    console.log('✨ BallCrushLoaderScene create - waiting for assets to load');
  }
  
  private createLoadingUI() {
    // Dark background initially
    this.cameras.main.setBackgroundColor('#1a2a1a');
    
    // Add title immediately
    this.titleText = this.add.text(180, 80, 'BALL CRUSH', {
      fontSize: '36px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(10);
    
    // Create progress bar background
    const progressBg = this.add.graphics();
    progressBg.fillStyle(0x333333);
    progressBg.fillRoundedRect(60, 500, 240, 20, 10);
    
    // Progress bar (will be updated)
    this.progressBar = this.add.graphics();
    
    // Loading text
    this.loadingText = this.add.text(180, 470, 'LOADING... 0%', {
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5).setDepth(10);
    
    // Show username
    if (this.username) {
      this.add.text(180, 550, `Ready, ${this.username}!`, {
        fontSize: '16px',
        color: '#ffaa00'
      }).setOrigin(0.5).setDepth(10);
    }
    
    // Loading circle - positioned higher
    this.loadingCircle = this.add.graphics().setDepth(10);
  }
  
  private onLoadProgress(progress: number) {
    // Update progress bar
    this.progressBar.clear();
    this.progressBar.fillStyle(0xffaa00);
    this.progressBar.fillRoundedRect(60, 500, 240 * progress, 20, 10);
    
    // Update text
    const percent = Math.round(progress * 100);
    this.loadingText.setText(`LOADING... ${percent}%`);
    
    // Once assets start loading, add them to the screen
    if (progress > 0 && !this.backgroundImage) {
      this.addLoadedAssets();
    }
  }
  
  private addLoadedAssets() {
    // Remove title text
    if (this.titleText) {
      this.titleText.destroy();
    }
    
    // Add background if loaded - make it full screen
    if (this.textures.exists('ball-background')) {
      this.backgroundImage = this.add.image(180, 320, 'ball-background');
      // Scale to cover the entire screen
      const scaleX = 360 / this.backgroundImage.width;
      const scaleY = 640 / this.backgroundImage.height;
      this.backgroundImage.setScale(Math.max(scaleX, scaleY));
      this.backgroundImage.setDepth(0);
    }
    
    // Add ball image if loaded
    if (this.textures.exists('ball')) {
      this.ballImage = this.add.image(180, 300, 'ball');
      this.ballImage.setScale(0.5);
      this.ballImage.setDepth(5);
      
      // Add a bouncing animation to the ball
      this.tweens.add({
        targets: this.ballImage,
        y: 280,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
    
    // Add title (now in front of background)
    this.add.text(180, 80, 'BALL CRUSH', {
      fontSize: '36px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(10);
  }
  
  private onLoadComplete() {
    console.log('✅ All Ball Crush assets loaded successfully!');
    
    this.loadingText.setText('COMPLETE!');
    this.loadingText.setColor('#00ff00');
    
    // Make sure assets are displayed
    this.addLoadedAssets();
    
    // Add a small delay so user can see the loaded assets
    this.time.delayedCall(1000, () => {
      this.goToNextScene();
    });
  }
  
  private loadAssets() {
    console.log('📦 Loading Ball Crush game assets...');
    
    // Load all ball crush assets
    this.load.image('ball-background', 'assets/ball-crush/background.jpg');
    this.load.image('ball', 'assets/ball-crush/ball.png');
    this.load.image('heart', 'assets/ball-crush/heart.png');
    this.load.image('player', 'assets/ball-crush/player.png');
    this.load.image('powerup', 'assets/ball-crush/powerup.png');
  }
  
  private goToNextScene() {
    console.log('🚀 Moving to BallCrushStartScene with username:', this.username);
    
    // Stop all tweens
    this.tweens.killAll();
    
    // Fade out
    this.cameras.main.fadeOut(500, 0, 0, 0);
    
    this.cameras.main.once('camerafadeoutcomplete', () => {
      console.log('🎯 Starting BallCrushStartScene with username:', this.username);
      this.scene.start('BallCrushGameScene', { username: this.username });
    });
  }
  
  update() {
    // Clear previous frame
    this.loadingCircle.clear();
    
    // Center coordinates for loading circle
    const centerX = 180;
    const centerY = 380;
    const radius = 30;
    
    // Draw outer circle
    this.loadingCircle.lineStyle(4, 0xffaa00, 1);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.loadingCircle.strokePath();
    
    // Draw inner white circle for better visibility
    this.loadingCircle.lineStyle(2, 0xffffff, 0.8);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
    this.loadingCircle.strokePath();
    
    // Draw spinning arc
    this.loadingCircle.lineStyle(4, 0xffff00, 1);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(
      centerX, 
      centerY, 
      radius, 
      (this.loadingAngle - 45) * Math.PI / 180, 
      this.loadingAngle * Math.PI / 180
    );
    this.loadingCircle.strokePath();
    
    // Rotate
    this.loadingAngle += 6;
    if (this.loadingAngle > 360) this.loadingAngle -= 360;
  }
}