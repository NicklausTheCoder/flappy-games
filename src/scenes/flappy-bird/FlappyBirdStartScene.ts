import Phaser from 'phaser';
import {
  getFlappyBirdUserData,
  getFlappyBirdLeaderboard,
  getFlappyBirdPlayerRank,
  getFlappyBirdBalance,
  updateFlappyBirdWalletBalance,
  FlappyBirdUserData,
  FlappyBirdLeaderboardEntry
} from '../../firebase/flappyBirdSimple';


interface MenuButton {
  text: string;
  color: string;
  scene?: string;
  isExternal?: boolean;
  url?: string;
}
export class FlappyBirdStartScene extends Phaser.Scene {
  // Receive username from LoaderScene
  private username: string = '';
  private uid: string = '';


  // Then we fetch ALL this data ourselves
  private userData: FlappyBirdUserData | null = null;
  private leaderboard: FlappyBirdLeaderboardEntry[] = [];
  private playerRank: number = 0;
  private balance: number = 0;

  // UI Elements
  private balanceText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private menuButtons: Phaser.GameObjects.Text[] = [];
  private birdSprite!: Phaser.GameObjects.Sprite;
  private loadingText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private retryButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'FlappyBirdStartScene' });
  }

  // RECEIVE USERNAME AND UID FROM LOADERSCENE
  init(data: { username: string; uid?: string }) {
    console.log('📥 StartScene received:', data);

    if (!data || !data.username) {
      console.error('❌ No username received!');
      this.showErrorAndRedirect('No username provided');
      return;
    }

    this.username = data.username;
    this.uid = data.uid || '';
    console.log('👤 Username set to:', this.username);
    console.log('🆔 UID set to:', this.uid);
  }

  async create() {
    console.log('🎨 Creating StartScene for:', this.username);

    this.addBackground();
    this.showLoading();

    try {
      await this.fetchAllUserData();
      this.loadingText?.destroy();
      this.buildFullUI();
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      this.showError('Failed to load game data. Please try again.');
    }
  }

  private showLoading() {
    this.loadingText = this.add.text(180, 300, `LOADING DATA...`, {
      fontSize: '18px',
      color: '#ffff00'
    }).setOrigin(0.5);
  }

  private showError(message: string) {
    this.loadingText?.destroy();

    // Dark overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, 360, 640);

    // Error icon
    this.add.text(180, 200, '❌', {
      fontSize: '48px',
      color: '#ff0000'
    }).setOrigin(0.5);

    // Error message
    this.errorText = this.add.text(180, 260, message, {
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      wordWrap: { width: 300 }
    }).setOrigin(0.5);

    // Retry button
    this.retryButton = this.add.text(180, 330, '🔄 TRY AGAIN', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.retryButton.on('pointerover', () => {
      this.retryButton.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
    });

    this.retryButton.on('pointerout', () => {
      this.retryButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
    });

    this.retryButton.on('pointerdown', () => {
      this.scene.restart({ username: this.username, uid: this.uid });
    });
  }

  private showErrorAndRedirect(message: string) {
    this.loadingText?.destroy();

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, 360, 640);

    this.add.text(180, 250, '🔒', {
      fontSize: '48px',
      color: '#ff0000'
    }).setOrigin(0.5);

    this.add.text(180, 310, message, {
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(180, 370, 'Redirecting to login...', {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);

    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  }

  private async fetchAllUserData() {
    console.log('📡 Fetching data for:', this.username);
    console.log('🆔 Using UID:', this.uid);

    // Use the Flappy Bird specific functions
    const [userData, leaderboard, rank, balance] = await Promise.all([
      getFlappyBirdUserData(this.uid),
      getFlappyBirdLeaderboard(10),
      getFlappyBirdPlayerRank(this.username),
      getFlappyBirdBalance(this.uid)
    ]);

    if (!userData) {
      throw new Error('No user data found for: ' + this.username);
    }

    // Update userData with the correct balance
    this.balance = balance;
    this.userData = userData;
    this.leaderboard = leaderboard;
    this.playerRank = rank;

    console.log('✅ User data fetched:', {
      username: this.userData.username,
      displayName: this.userData.displayName,
      highScore: this.userData.highScore,
      balance: this.balance,
      totalGames: this.userData.totalGames
    });
  }

  private buildFullUI() {
    if (!this.userData) return;

    this.addTitle();
    this.addBird();
    this.createBalanceDisplay();
    this.createHighScoreDisplay();
    this.createRankDisplay();
    this.createWelcomeMessage();
    this.createMenuButtons();
    this.addFooter();
    this.setupInputHandlers();
  }

  private addBackground() {
    if (this.textures.exists('background')) {
      const bg = this.add.image(180, 320, 'background');
      bg.setDisplaySize(360, 640);
    } else {
      this.cameras.main.setBackgroundColor('#87CEEB');
    }
  }

  private addTitle() {
    this.add.text(180, 70, 'FLAPPY BIRD ONLINE', {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);
  }

  private addBird() {
    if (!this.textures.exists('bird-frame1')) return;

    this.birdSprite = this.add.sprite(180, 150, 'bird-frame1');
    this.birdSprite.setScale(0.2);

    if (!this.anims.exists('fly')) {
      this.anims.create({
        key: 'fly',
        frames: [
          { key: 'bird-frame1' },
          { key: 'bird-frame2' }
        ],
        frameRate: 4,
        repeat: -1
      });
    }

    this.birdSprite.play('fly');

    this.tweens.add({
      targets: this.birdSprite,
      y: 145,
      duration: 1000,
      yoyo: true,
      repeat: -1
    });
  }

  private createWelcomeMessage() {
    this.add.text(180, 200, `Welcome, ${this.userData!.displayName}!`, {
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(180, 220, `${this.userData!.rank} • Level ${this.userData!.level}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  private createBalanceDisplay() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(5, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffd700);
    bg.strokeRoundedRect(5, 5, 110, 40, 8);

    this.add.text(10, 8, '💰', { fontSize: '20px' });
    this.add.text(35, 8, 'Bal:', { fontSize: '12px', color: '#ffffff' });

    // Use this.balance instead of userData.balance
    this.balanceText = this.add.text(35, 23, `$${this.balance.toFixed(2)}`, {
      fontSize: '14px',
      color: '#00ff00',
      fontStyle: 'bold'
    });
  }

  private createHighScoreDisplay() {
    if (!this.userData) {
      console.log('❌ No user data for high score');
      return;
    }

    console.log('📊 Displaying high score:', this.userData.highScore);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(245, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffd700);
    bg.strokeRoundedRect(245, 5, 110, 40, 8);

    this.add.text(250, 8, '🏆', { fontSize: '20px' });
    this.add.text(275, 8, 'Best:', { fontSize: '12px', color: '#ffffff' });

    const highScore = this.userData.highScore || 0;

    this.highScoreText = this.add.text(275, 23, highScore.toString(), {
      fontSize: '14px',
      color: '#ffd700',
      fontStyle: 'bold'
    });
  }

  private createRankDisplay() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(125, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffd700);
    bg.strokeRoundedRect(125, 5, 110, 40, 8);

    this.add.text(130, 8, '📊', { fontSize: '20px' });
    this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });

    this.rankText = this.add.text(175, 23, `#${this.playerRank}`, {
      fontSize: '14px',
      color: '#ffd700',
      fontStyle: 'bold'
    });
  }

  private createMenuButtons() {
    const buttonWidth = 160;
    const buttonHeight = 45;
    const startX = 180;
    const startY = 280;

    const buttons: MenuButton[] = [
      { text: '▶ PLAY GAME', color: '#4CAF50', scene: 'FlappyBirdGameScene' },
      { text: '🏆 LEADERBOARD', color: '#2196F3', scene: 'FlappyBirdLeaderboardScene' },
      { text: '👤 PROFILE', color: '#9C27B0', scene: 'FlappyBirdProfileScene' },
      { text: '📊 MY SCORES', color: '#FF9800', scene: 'FlappyBirdScoresScene' },
      {
        text: '🏆 TOURNAMENT',
        color: '#9C27B0',
        scene: 'PrizeTournamentScene'
      },
      {
        text: '🎮 BACK TO GAMES',
        color: '#FF5722',
        isExternal: true,
        url: 'https://wintapgames.com/games'
      }
    ];

    buttons.forEach((btn, index) => {
      const yPos = startY + (index * 55);

      const bg = this.add.graphics();
      bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
      bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      bg.lineStyle(2, 0xffffff, 1);
      bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);

      const button = this.add.text(startX, yPos, btn.text, {
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
      })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        button.setStyle({ color: '#ffff00' });
        button.setScale(1.05);

        bg.clear();
        bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
        bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(3, 0xffff00, 2);
        bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      });

      button.on('pointerout', () => {
        button.setStyle({ color: '#ffffff' });
        button.setScale(1);

        bg.clear();
        bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
        bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(2, 0xffffff, 1);
        bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      });

      // *** ADD THE CLICK HANDLER HERE ***
      button.on('pointerdown', () => {
        // Check if it's an external link
        if (btn.isExternal && btn.url) {
          // Redirect to external URL
          window.location.href = btn.url;
          return;
        }

        // Otherwise handle as internal game scene
        if (btn.text === '▶ PLAY GAME') {
          if (this.balance < 1) {
            this.showInsufficientFunds();
            return;
          }

          this.deductGameFee().then(success => {
            if (success) {
              this.balance -= 1;
              if (this.userData) {
                this.userData.balance = this.balance;
              }
              this.balanceText.setText(`$${this.balance.toFixed(2)}`);

              this.tweens.add({
                targets: this.balanceText,
                scale: 1.3,
                color: '#ff0000',
                duration: 200,
                yoyo: true,
                onComplete: () => {
                  this.scene.start(btn.scene!, {
                    username: this.username,
                    uid: this.uid,
                    userData: this.userData
                  });
                }
              });
            } else {
              this.showError('Failed to process payment');
            }
          });
        } else if (btn.scene) {
          // For other internal scenes
          this.scene.start(btn.scene, {
            username: this.username,
            uid: this.uid,
            userData: this.userData
          });
        }
      });

      this.menuButtons.push(button);
    });
  }

  private async deductGameFee(): Promise<boolean> {
    if (!this.userData || !this.uid) {
      console.error('❌ No user data or UID for fee deduction');
      return false;
    }

    try {
      console.log('💰 Deducting $1 game fee for:', this.userData.username);

      const success = await updateFlappyBirdWalletBalance(
        this.uid,
        -1.00,
        'loss',
        'Game entry fee'
      );

      if (success) {
        console.log('✅ Game fee deducted successfully');
      } else {
        console.log('❌ Failed to deduct game fee');
      }

      return success;

    } catch (error) {
      console.error('❌ Error deducting game fee:', error);
      return false;
    }
  }

  private showInsufficientFunds() {
    const popup = this.add.graphics();
    popup.fillStyle(0x000000, 0.9);
    popup.fillRoundedRect(40, 200, 280, 150, 10);
    popup.lineStyle(2, 0xff0000, 1);
    popup.strokeRoundedRect(40, 200, 280, 150, 10);

    this.add.text(180, 230, '⚠️', {
      fontSize: '40px',
      color: '#ff0000'
    }).setOrigin(0.5);

    this.add.text(180, 280, 'Insufficient Funds!', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(180, 310, `Need $1 (You have $${this.balance.toFixed(2)})`, {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);

    const closeBtn = this.add.text(180, 340, 'OK', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 20, y: 5 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      popup.destroy();
      closeBtn.destroy();
    });

    this.time.delayedCall(2000, () => {
      popup.destroy();
      closeBtn.destroy();
    });
  }

  private addFooter() {
    this.add.text(340, 620, 'v1.0.0', {
      fontSize: '10px',
      color: '#666666'
    }).setOrigin(1, 0);
  }

  private setupInputHandlers() {
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => {
        if (this.userData && this.balance >= 1) {
          this.scene.start('FlappyBirdGameScene', {
            username: this.username,
            uid: this.uid,
            userData: this.userData
          });
        } else {
          this.showInsufficientFunds();
        }
      });
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.userData && this.balance >= 1) {
          this.scene.start('FlappyBirdGameScene', {
            username: this.username,
            uid: this.uid,
            userData: this.userData
          });
        } else {
          this.showInsufficientFunds();
        }
      });
    }
  }
}