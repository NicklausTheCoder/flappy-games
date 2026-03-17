// src/scenes/ball-crush/BallCrushStartScene.ts
import Phaser from 'phaser';
import {
  getBallCrushUserData,
  getBallCrushLeaderboard,
  getBallCrushPlayerRank,
  updateBallCrushWalletBalance,
  BallCrushUserData,
  getBallCrushBalance,
  BallCrushLeaderboardEntry

} from '../../firebase/ballCrushSimple';  // Use the new Ball Crush specific service

export class BallCrushStartScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';  // Add uid

  private userData: BallCrushUserData | null = null;
  private leaderboard: BallCrushLeaderboardEntry[] = [];
  private playerRank: number = 0;
  private balance: number = 0;
  private displayName: string = '';
  private avatar: string = '';

  // UI Elements

  private balanceText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private menuButtons: Phaser.GameObjects.Text[] = [];
  private ballSprite!: Phaser.GameObjects.Sprite;
  private loadingText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private retryButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BallCrushStartScene' });
  }

  init(data: { username: string; uid?: string; displayName?: string; avatar?: string }) {
    console.log('📥 BallCrushStartScene received:', data);

    if (!data || !data.username) {
      console.error('❌ No username received!');
      this.showErrorAndRedirect('No username provided');
      return;
    }

    this.username = data.username;
    this.uid = data.uid || '';                    // Store the uid!
    this.displayName = data.displayName || data.username;
    this.avatar = data.avatar || 'default';

    console.log('👤 Username set to:', this.username);
    console.log('🆔 UID set to:', this.uid);
    console.log('📛 DisplayName set to:', this.displayName);
    console.log('🖼️ Avatar set to:', this.avatar);
  }
  async create() {
    console.log('🎨 Creating BallCrushStartScene for:', this.username);

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
    this.loadingText = this.add.text(180, 300, `LOADING BALL CRUSH DATA...`, {
      fontSize: '18px',
      color: '#ffff00'
    }).setOrigin(0.5);
  }

  private showError(message: string) {
    this.loadingText?.destroy();

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, 360, 640);

    this.add.text(180, 200, '❌', {
      fontSize: '48px',
      color: '#ff0000'
    }).setOrigin(0.5);

    this.errorText = this.add.text(180, 260, message, {
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      wordWrap: { width: 300 }
    }).setOrigin(0.5);

    this.retryButton = this.add.text(180, 330, '🔄 TRY AGAIN', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

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

    this.add.text(180, 370, 'Returning to login...', {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);

    // Go to CookieScene instead of direct window.location
    setTimeout(() => {
      this.scene.start('CookieScene');
    }, 2000);
  }

  private async fetchAllUserData() {
    console.log('📡 Fetching Ball Crush data for:', this.username);

    const [userData, leaderboard, rank, balance] = await Promise.all([
      getBallCrushUserData(this.username),
      getBallCrushLeaderboard(10),
      getBallCrushPlayerRank(this.username),
      getBallCrushBalance(this.uid)
    ]);

    if (!userData) {
      throw new Error('No user data found for: ' + this.username);
    }

    this.userData = userData;
    this.leaderboard = leaderboard;
    this.playerRank = rank;
    this.balance = balance;

    console.log('✅ Ball Crush user data fetched:', {
      username: this.userData.username,
      displayName: this.userData.displayName,
      highScore: this.userData.highScore,
      balance: this.balance,
      totalGames: this.userData.totalGames,
    });
  }
  // private async fetchUserBalance() {
  //   console.log('📡 Fetching Ball balance data for:', this.uid);

  //   // This returns a NUMBER, not an object with userData
  //   const balance = await getBallCrushBalance(this.uid);

  //   console.log('✅ Ball Crush balance fetched:', balance);

  //   // Store it somewhere - you need a variable for this
  //   // Add this at the top of your class:
  //   // private userBalance: number = 0;

  //   this.userBalance = balance;

  //   // Update the balance display if it exists
  //   if (this.balanceText) {
  //     this.balanceText.setText(balance.toFixed(0));
  //   }
  // }
  private buildFullUI() {
    if (!this.userData) return;

    this.addTitle();
    this.addBall();
    this.createBalanceDisplay();
    this.createHighScoreDisplay();
    this.createRankDisplay();
    this.createWelcomeMessage();
    this.createMenuButtons();
    this.addFooter();
    this.setupInputHandlers();
  }

  private addBackground() {
    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
    } else {
      this.cameras.main.setBackgroundColor('#1a3a1a');
    }
  }

  private addTitle() {
    this.add.text(180, 70, 'BALL CRUSH', {
      fontSize: '32px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);
  }

  private addBall() {
    if (!this.textures.exists('ball')) return;

    this.ballSprite = this.add.sprite(180, 150, 'ball');
    this.ballSprite.setScale(0.3);

    this.tweens.add({
      targets: this.ballSprite,
      y: 140,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: this.ballSprite,
      angle: 10,
      duration: 600,
      yoyo: true,
      repeat: -1
    });
  }

  private createWelcomeMessage() {
    if (!this.userData) return;

    this.add.text(180, 200, `Welcome, ${this.userData.displayName}!`, {
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(180, 220, `${this.userData.rank} • Level ${this.userData.level}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(180, 240, `Wins: ${this.userData.totalWins} | Streak: ${this.userData.winStreak}`, {
      fontSize: '12px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  private createBalanceDisplay() {
    if (!this.userData) return;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(5, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(5, 5, 110, 40, 8);

    this.add.text(10, 8, '💰', { fontSize: '20px' });
    this.add.text(35, 8, 'Bal:', { fontSize: '12px', color: '#ffffff' });

    this.balanceText = this.add.text(35, 23, `${this.balance.toFixed(0)}`, {
      fontSize: '14px',
      color: '#00ff00',
      fontStyle: 'bold'
    });
  }

  private createHighScoreDisplay() {
    if (!this.userData) return;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(245, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(245, 5, 110, 40, 8);

    this.add.text(250, 8, '🏆', { fontSize: '20px' });
    this.add.text(275, 8, 'Best:', { fontSize: '12px', color: '#ffffff' });

    const highScore = this.userData.highScore || 0;
    this.highScoreText = this.add.text(275, 23, highScore.toString(), {
      fontSize: '14px',
      color: '#ffaa00',
      fontStyle: 'bold'
    });
  }

  private createRankDisplay() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(125, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(125, 5, 110, 40, 8);

    this.add.text(130, 8, '📊', { fontSize: '20px' });
    this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });

    this.rankText = this.add.text(175, 23, `#${this.playerRank}`, {
      fontSize: '14px',
      color: '#ffaa00',
      fontStyle: 'bold'
    });
  }

  private createMenuButtons() {
    if (!this.userData) return;

    const buttonWidth = 160;
    const buttonHeight = 45;
    const startX = 180;
    const startY = 280;

    const buttons = [
      { text: '⚽ PLAY BALL', color: '#4CAF50', scene: 'BallCrushMatchmakingScene' },
      { text: '🏆 LEADERBOARD', color: '#2196F3', scene: 'BallCrushLeaderboardScene' },
      { text: '👤 PROFILE', color: '#9C27B0', scene: 'BallCrushProfileScene' },
      { text: '📊 MY SCORES', color: '#FF9800', scene: 'BallCrushScoresScene' },
      { text: '🛒 STORE', color: '#E91E63', scene: 'BallCrushStoreScene' }
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

      // Look for this section:
      if (btn.text === '⚽ PLAY BALL') {
        button.on('pointerdown', async () => {
          if (this.userData!.balance < 1) {
            this.showInsufficientFunds();
            return;
          }

          const success = await this.deductGameFee();

          if (success) {
            this.userData!.balance -= 1;
            this.balanceText.setText(this.userData!.balance.toFixed(0));

            this.tweens.add({
              targets: this.balanceText,
              scale: 1.3,
              color: '#ff0000',
              duration: 200,
              yoyo: true,
              onComplete: () => {
                // CRITICAL: Check what data we have right now
                console.log('🔍 Current data in StartScene:', {
                  username: this.userData!.username,
                  uid: this.uid,
                  displayName: this.userData!.displayName,
                  avatar: this.userData!.avatar,
                  userDataExists: !!this.userData,
                  uidExists: !!this.uid
                });

                // Try to start the scene
                console.log('🚀 Attempting to start MatchmakingScene...');

                this.scene.start('BallCrushMatchmakingScene', {
                  username: this.userData!.username,
                  uid: this.uid,
                  displayName: this.userData!.displayName,
                  avatar: this.userData!.avatar
                });

                // Add a small delay and check if we're still here (scene didn't change)
                setTimeout(() => {
                  console.log('⚠️ Still in StartScene after 1 second - scene transition may have failed');
                }, 1000);
              }
            });
          } else {
            this.showError('Failed to process payment');
          }
        });

      } else {
        button.on('pointerdown', () => {
          this.scene.start(btn.scene, { userData: this.userData });
        });
      }

      this.menuButtons.push(button);
    });
  }

  private async deductGameFee(): Promise<boolean> {
    if (!this.userData || !this.uid) return false;

    try {
      console.log('💰 Deducting 1 coin game fee for UID:', this.uid);

      const success = await updateBallCrushWalletBalance(
        this.uid,  // Pass UID instead of username
        -1,
        'loss',
        'Ball Crush game entry fee'
      );

      return success;

    } catch (error) {
      console.error('❌ Error deducting game fee:', error);
      return false;
    }
  }

  private showInsufficientFunds() {
    // Create a container for the popup
    const popup = this.add.graphics();
    popup.fillStyle(0x000000, 0.9);
    popup.fillRoundedRect(40, 200, 280, 150, 10);
    popup.lineStyle(2, 0xff0000, 1);
    popup.strokeRoundedRect(40, 200, 280, 150, 10);

    const warningIcon = this.add.text(180, 230, '⚠️', {
      fontSize: '40px',
      color: '#ff0000'
    }).setOrigin(0.5);

    const warningText = this.add.text(180, 280, 'Insufficient Coins!', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const subText = this.add.text(180, 310, 'Need 1 coin to play', {
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

    // Function to destroy all popup elements
    const destroyPopup = () => {
      popup.destroy();
      warningIcon.destroy();
      warningText.destroy();
      subText.destroy();
      closeBtn.destroy();
    };

    closeBtn.on('pointerdown', destroyPopup);

    // Auto close after 3 seconds (increased from 2)
    this.time.delayedCall(3000, destroyPopup);
  }

  private addFooter() {
    this.add.text(340, 620, 'Ball Crush v1.0.0', {
      fontSize: '10px',
      color: '#666666'
    }).setOrigin(1, 0);
  }

  private setupInputHandlers() {
    if (!this.userData) return;

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => {
        if (this.userData && this.userData.balance >= 1) {
          this.scene.start('BallCrushMatchmakingScene', {
            username: this.userData.username,
            uid: this.uid,
            displayName: this.userData.displayName,
            avatar: this.userData.avatar
          });
        }
      });
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.userData && this.userData.balance >= 1) {
          this.scene.start('BallCrushMatchmakingScene', {
            username: this.userData.username,
            uid: this.uid,
            displayName: this.userData.displayName,
            avatar: this.userData.avatar
          });
        }
      });
    }
  }
}