// src/scenes/sky-shooter/SkyShooterLoaderScene.ts
import Phaser from 'phaser';

export class SkyShooterLoaderScene extends Phaser.Scene {
  // Simple loading circle
  private loadingCircle!: Phaser.GameObjects.Graphics;
  private loadingAngle: number = 0;
  private loadingText!: Phaser.GameObjects.Text;
  private backgroundImage!: Phaser.GameObjects.Image;
  private spaceshipImage!: Phaser.GameObjects.Image;
  private progressBar!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  
  // Username received from CookieScene
  private username: string = '';
  
  // Loading timing
  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 5000; // 5 seconds minimum
  private assetsLoaded: boolean = false;
  
  constructor() {
    super({ key: 'SkyShooterLoaderScene' });
  }
  
  init(data: { username: string }) {
    console.log('🚀 SkyShooterLoaderScene initialized with data:', data);
    this.loadStartTime = Date.now();
    
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
    console.log('✨ SkyShooterLoaderScene create - waiting for assets to load');
    
  }
  
  private createLoadingUI() {
    // Dark background
    this.cameras.main.setBackgroundColor('#000000');
    
    // Add title immediately (will be replaced when assets load)
    this.titleText = this.add.text(180, 80, 'SPACE SHOOTER', {
      fontSize: '32px',
      color: '#00ffff',
      fontStyle: 'bold',
      stroke: '#0000ff',
      strokeThickness: 4
    }).setOrigin(0.5);
    
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
    }).setOrigin(0.5);
    
    // Show username
    if (this.username) {
      this.add.text(180, 550, `Ready, ${this.username}!`, {
        fontSize: '16px',
        color: '#00ffff'
      }).setOrigin(0.5);
    }
    
    // Loading circle - make it more visible with a white outline
    this.loadingCircle = this.add.graphics();
  }
  
  private onLoadProgress(progress: number) {
    // Update progress bar
    this.progressBar.clear();
    this.progressBar.fillStyle(0x00ffff);
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
    
    // Add earth background if loaded
    if (this.textures.exists('earth-background')) {
      this.backgroundImage = this.add.image(180, 200, 'earth-background');
      this.backgroundImage.setScale(0.8);
    }
    
    // Add spaceship loader image if loaded
    if (this.textures.exists('spaceship-loader')) {
      this.spaceshipImage = this.add.image(180, 300, 'spaceship-loader');
      this.spaceshipImage.setScale(0.3);
    }
    
    // Add title (now in front of background)
    this.add.text(180, 80, 'SPACE SHOOTER', {
      fontSize: '32px',
      color: '#00ffff',
      fontStyle: 'bold',
      stroke: '#0000ff',
      strokeThickness: 4
    }).setOrigin(0.5);
    
    // Bring loading circle to front
    if (this.loadingCircle) {
      this.loadingCircle.setDepth(10);
    }
  }
  
  private onLoadComplete() {
    console.log('✅ All Sky Shooter assets loaded successfully!');
    this.assetsLoaded = true;
    
    // Calculate how long loading took
    const loadTime = Date.now() - this.loadStartTime;
    const remainingTime = Math.max(0, this.MIN_LOAD_TIME - loadTime);
    
    console.log(`⏱️ Load time: ${loadTime}ms, Waiting: ${remainingTime}ms`);
    
    this.loadingText.setText('COMPLETE!');
    this.loadingText.setColor('#00ff00');
    
    // Make sure assets are displayed
    this.addLoadedAssets();
    
    // Ensure minimum load time for user to see the cool assets
    this.time.delayedCall(remainingTime, () => {
      this.goToNextScene();
    });
  }
  
  private loadAssets() {
    console.log('📦 Loading Sky Shooter game assets...');
    
    // Background - using earthbackground.jpg
    this.load.image('earth-background', 'assets/sky-shooter/earthbackground.jpg');
    
    // Spaceship loader image
    this.load.image('spaceship-loader', 'assets/sky-shooter/loaderspaceship.png');
    
    // Player spaceship (shooter.png)
    this.load.image('player-spaceship', 'assets/sky-shooter/shooter.png');
    
    // Enemy spaceship (shooter2.png)
    this.load.image('enemy-spaceship', 'assets/sky-shooter/shooter2.png');
    
    // Space background for game
    this.load.image('space-background', 'assets/sky-shooter/spacebackground.png');
  }
  
  private goToNextScene() {
    console.log('🚀 Moving to SkyShooterStartScene with username:', this.username);
    
    // Fade out
    this.cameras.main.fadeOut(500, 0, 0, 0);
    
    this.cameras.main.once('camerafadeoutcomplete', () => {
      console.log('🎯 Starting SkyShooterStartScene with username:', this.username);
      this.scene.start('SkyShooterStartScene', { username: this.username });
    });
  }
  
  update() {
    // Clear previous frame
    this.loadingCircle.clear();
    
    // Center coordinates for loading circle
    const centerX = 180;
    const centerY = 580;
    const radius = 30; // Slightly larger
    
    // Draw outer circle with brighter color
    this.loadingCircle.lineStyle(4, 0x00000, 1);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.loadingCircle.strokePath();
    
    // Draw inner white circle for better visibility
    this.loadingCircle.lineStyle(2, 0x00000, 0.8);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
    this.loadingCircle.strokePath();
    
    // Draw spinning arc (the actual loader)
    this.loadingCircle.lineStyle(4, 0xae0a0a, 1); // Yellow spinner
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
    this.loadingAngle += 6; // Faster rotation
    if (this.loadingAngle > 360) this.loadingAngle -= 360;
  }
}