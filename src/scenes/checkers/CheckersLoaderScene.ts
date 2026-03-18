// src/scenes/checkers/CheckersLoaderScene.ts
import Phaser from 'phaser';
import { checkersService } from '../../firebase/checkersService';

export class CheckersLoaderScene extends Phaser.Scene {
  // Loading UI
  private loadingCircle!: Phaser.GameObjects.Graphics;
  private loadingAngle: number = 0;
  private loadingText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // User data
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = 'default';

  // Loading timing
  private loadStartTime: number = 0;
  private readonly MIN_LOAD_TIME = 2000; // 2 seconds minimum
  private assetsLoaded: boolean = false;

  constructor() {
    super({ key: 'CheckersLoaderScene' });
  }

  async init(data: { username: string; uid?: string }) {
    console.log('♟️ CheckersLoaderScene initialized with data:', data);
    this.loadStartTime = Date.now();

    if (data && data.username) {
      this.username = data.username;

      if (data.uid) {
        this.uid = data.uid;
        console.log('✅ Using provided UID:', this.uid);
      } else {
        console.error('❌ No UID provided!');
        this.uid = `temp_${Date.now()}`;
        console.log('⚠️ Created temporary UID:', this.uid);
      }

      console.log('👤 Username:', this.username);
      console.log('🆔 UID:', this.uid);

      // Get user details from Firebase
      try {
        const userData = await checkersService.getUserData(this.uid);
        if (userData) {
          this.displayName = userData.displayName || this.username;
          this.avatar = userData.avatar || 'default';
          console.log('📊 User data loaded:', { displayName: this.displayName, avatar: this.avatar });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    } else {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }
  }

  preload() {
    // Create loading UI
    this.createLoadingUI();

    // Set up progress tracking
    this.load.on('progress', this.onLoadProgress, this);
    this.load.on('complete', this.onLoadComplete, this);

    // Load all Checkers assets
    this.loadAssets();
  }

  create() {
    console.log('✨ CheckersLoaderScene create - waiting for assets to load');
    this.statusText.setText('Loading assets...');
  }

  private createLoadingUI() {
    // Dark brown background
    this.cameras.main.setBackgroundColor('#2a1a0a');

    // Title
    this.titleText = this.add.text(180, 80, 'CHECKERS', {
      fontSize: '36px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 6
    }).setOrigin(0.5);

    // Progress bar background
    const progressBg = this.add.graphics();
    progressBg.fillStyle(0x333333);
    progressBg.fillRoundedRect(60, 500, 240, 20, 10);

    // Progress bar
    this.progressBar = this.add.graphics();

    // Loading text
    this.loadingText = this.add.text(180, 470, 'LOADING... 0%', {
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Status text
    this.statusText = this.add.text(180, 550, 'Loading assets...', {
      fontSize: '16px',
      color: '#ffff00'
    }).setOrigin(0.5);

    // Show username
    this.add.text(180, 590, `Player: ${this.displayName || this.username}`, {
      fontSize: '14px',
      color: '#ffaa00'
    }).setOrigin(0.5);

    // Loading circle
    this.loadingCircle = this.add.graphics();
  }

  private onLoadProgress(progress: number) {
    // Update progress bar
    this.progressBar.clear();
    this.progressBar.fillStyle(0xffaa00);
    this.progressBar.fillRoundedRect(60, 500, 240 * progress, 20, 10);

    // Update text
    const percent = Math.round(progress * 100);
    this.loadingText.setText(`LOADING... ${percent}%`);

    // Once assets start loading, add preview
    if (progress > 0 && !this.titleText) {
      this.addAssetPreview();
    }
  }

  private addAssetPreview() {
    // Add checker pieces preview if loaded
    if (this.textures.exists('red_normal')) {
      const redPiece = this.add.image(120, 250, 'red_normal');
      redPiece.setDisplaySize(40, 40);

      const blackPiece = this.add.image(240, 250, 'black_normal');
      blackPiece.setDisplaySize(40, 40);

      // Add floating animation
      this.tweens.add({
        targets: [redPiece, blackPiece],
        y: '+=10',
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      // Add board preview
      const boardPreview = this.add.grid(
        180, 350,
        140, 140,
        35, 35,
        0x8b4513, 0.5,
        0xdeb887, 0.5
      );
    }
  }

  private onLoadComplete() {
    console.log('✅ All Checkers assets loaded successfully!');
    this.assetsLoaded = true;

    // Calculate loading time
    const loadTime = Date.now() - this.loadStartTime;
    const remainingTime = Math.max(0, this.MIN_LOAD_TIME - loadTime);

    console.log(`⏱️ Load time: ${loadTime}ms, Waiting: ${remainingTime}ms`);

    this.loadingText.setText('READY!');
    this.loadingText.setColor('#00ff00');
    this.statusText.setText('Starting game...');

    // Ensure minimum load time for visual
    this.time.delayedCall(remainingTime, () => {
      this.goToStartScene();
    });
  }

  private loadAssets() {
    console.log('📦 Loading Checkers game assets...');

    // Load all checkers assets
    this.load.image('red_normal', 'assets/checkers/red_normal.png');
    this.load.image('red_king', 'assets/checkers/red_king.png');
    this.load.image('black_normal', 'assets/checkers/black_normal.png');
    this.load.image('black_king', 'assets/checkers/black_king.png');

    // Add fallbacks if assets don't exist
    this.load.on('loaderror', (file: any) => {
      console.warn(`⚠️ Asset not found: ${file.key}, using fallback`);
    });
  }

private goToStartScene() {
    console.log('🚀 Moving to CheckersStartScene');
    
    // Make sure displayName is set
    if (!this.displayName || this.displayName === 'Player') {
        this.displayName = this.username; // Fallback to username
    }

    console.log('📤 Passing to StartScene:', {
        username: this.username,
        uid: this.uid,
        displayName: this.displayName,
        avatar: this.avatar
    });

    // Fade out
    this.cameras.main.fadeOut(500, 0, 0, 0);

    this.scene.start('CheckersStartScene', {
        username: this.username,
        uid: this.uid,
        displayName: this.displayName,
        avatar: this.avatar
    });
}

  update() {
    // Loading circle animation
    this.loadingCircle.clear();

    const centerX = 180;
    const centerY = 580;
    const radius = 30;

    // Draw outer circle
    this.loadingCircle.lineStyle(4, 0xffaa00, 1);
    this.loadingCircle.beginPath();
    this.loadingCircle.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.loadingCircle.strokePath();

    // Draw spinning arc
    this.loadingCircle.lineStyle(4, 0xff5500, 1);
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

  shutdown() {
    // Clean up
    this.load.off('progress', this.onLoadProgress);
    this.load.off('complete', this.onLoadComplete);
  }
}