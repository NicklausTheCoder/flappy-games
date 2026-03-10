import Phaser from 'phaser';

export class FlappyBirdLoaderScene extends Phaser.Scene {
  // Simple loading circle
  private loadingCircle!: Phaser.GameObjects.Graphics;
  private loadingAngle: number = 0;
  private loadingText!: Phaser.GameObjects.Text;
  
  // Username received from CookieScene
  private username: string = '';
  
  constructor() {
    super({ key: 'FlappyBirdLoaderScene' });
  }
  
  init(data: { username: string }) {
    console.log('🎬 LoaderScene initialized with data:', data);
    
    // Get username from CookieScene
    if (data && data.username) {
      this.username = data.username;
      console.log('👤 Username received from CookieScene:', this.username);
    } else {
      console.error('❌ No username received!');
      // Fallback - go back to CookieScene
      this.scene.start('CookieScene');
      return;
    }
  }
  
  preload() {
    // Create loading UI with phone-optimized positions
    this.createLoadingUI();
    
    // Load ALL game assets
    this.loadAssets();
  }
  
  create() {
    console.log('✨ LoaderScene create - waiting for assets to load');
    
    // Set up the complete event
    this.load.on('complete', () => {
      console.log('✅ All assets loaded successfully!');
      this.goToNextScene();
    });

    // If assets are already loaded
    if (this.load.progress === 1) {
      console.log('✅ Assets already loaded');
      this.goToNextScene();
    }
  }
  
  private createLoadingUI() {
    // Dark blue background
    this.cameras.main.setBackgroundColor('#0a0a2a');
    
    // Game title - centered for 360x640
    this.add.text(180, 100, 'WINTAP GAMES', {
      fontSize: '36px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);
    
    // Loading text
    this.loadingText = this.add.text(180, 200, 'LOADING...', {
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Show username from cookie
    if (this.username) {
      this.add.text(180, 260, `Hello, ${this.username}!`, {
        fontSize: '16px',
        color: '#ffff00'
      }).setOrigin(0.5);
    }
    
    // Loading circle will be drawn in update()
    this.loadingCircle = this.add.graphics();
  }
  
  private loadAssets() {
    console.log('📦 Loading game assets...');
    
    // Backgrounds
    this.load.image('background', 'assets/backgrounds/bg.png');
    this.load.image('background-alt', 'assets/backgrounds/bg2.jpg');
    
    // Bird
    this.load.image('bird-frame1', 'assets/bird/frame-1.png');
    this.load.image('bird-frame2', 'assets/bird/frame-2.png');
    
    // Pipes
    this.load.image('pipe', 'assets/pipe/pipe-green.png');
    
    // Ground
    this.load.image('base', 'assets/base/base.png');
  }
  
  private goToNextScene() {
    console.log('🚀 Moving to StartScene with username:', this.username);
    
    this.loadingText.setText('COMPLETE!');
    this.loadingText.setColor('#00ff00');
    
    // Wait a moment then go to StartScene
    this.time.delayedCall(500, () => {
      // Fade out
      this.cameras.main.fadeOut(500, 0, 0, 0);
      
      this.cameras.main.once('camerafadeoutcomplete', () => {
        console.log('🎯 Starting StartScene with username:', this.username);
        // PASS THE USERNAME to StartScene
        this.scene.start('FlappyBirdStartScene', { username: this.username });
      });
    });
  }
  
  update() {
    // Draw spinning circle
    this.loadingCircle.clear();
    
    // Center coordinates for 360x640 screen
    const centerX = 180;
    const centerY = 320;
    const radius = 25;
    
    // Draw outer circle
    this.loadingCircle.lineStyle(3, 0xffd700, 1);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.loadingCircle.strokePath();
    
    // Draw spinning arc
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(
      centerX, 
      centerY, 
      radius, 
      (this.loadingAngle - 30) * Math.PI / 180, 
      this.loadingAngle * Math.PI / 180
    );
    this.loadingCircle.strokePath();
    
    // Rotate
    this.loadingAngle += 3;
    if (this.loadingAngle > 360) this.loadingAngle -= 360;
  }
}