// src/scenes/checkers/CheckersStartScene.ts
import Phaser from 'phaser';
import {
  getCheckersUserData,
  getCheckersLeaderboard,
  updateCheckersWalletBalance,
  CheckersUserData,
  getCheckersBalance,
  CheckersLeaderboardEntry
} from '../../firebase/checkersService';

export class CheckersStartScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';

  private userData: CheckersUserData | null = null;
  private leaderboard: CheckersLeaderboardEntry[] = [];
  private playerRank: number = 0;
  private balance: number = 0;
  private displayName: string = '';
  private avatar: string = '';

  // UI Elements
  private balanceText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private menuButtons: Phaser.GameObjects.Text[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private retryButton!: Phaser.GameObjects.Text;

  // Checker pieces for animation
  private redPiece!: Phaser.GameObjects.Image;
  private blackPiece!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'CheckersStartScene' });
  }

  init(data: { username: string; uid?: string; displayName?: string; avatar?: string }) {
    console.log('📥 CheckersStartScene received:', data);

    if (!data || !data.username) {
      console.error('❌ No username received!');
      this.showErrorAndRedirect('No username provided');
      return;
    }

    this.username = data.username;
    this.uid = data.uid || '';
    this.displayName = data.displayName || data.username;
    this.avatar = data.avatar || 'default';

    console.log('👤 Username set to:', this.username);
    console.log('🆔 UID set to:', this.uid);
    console.log('📛 DisplayName set to:', this.displayName);
  }

  async create() {
    console.log('🎨 Creating CheckersStartScene for:', this.username);

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
    this.loadingText = this.add.text(180, 300, `LOADING CHECKERS DATA...`, {
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

    setTimeout(() => {
      this.scene.start('CookieScene');
    }, 2000);
  }

  private async fetchAllUserData() {
    console.log('📡 Fetching Checkers data for:', this.username);

    const [userData, leaderboard, balance] = await Promise.all([
      getCheckersUserData(this.uid),
      getCheckersLeaderboard(10),
      getCheckersBalance(this.uid)
    ]);

    if (!userData) {
      throw new Error('No user data found for: ' + this.username);
    }

    this.userData = userData;
    this.leaderboard = leaderboard;
    this.balance = balance;

    // Calculate player rank
    const rankIndex = leaderboard.findIndex(entry => entry.username === this.username);
    this.playerRank = rankIndex + 1;

    console.log('✅ Checkers user data fetched:', {
      username: this.userData.username,
      displayName: this.userData.displayName,
      gamesPlayed: this.userData.gamesPlayed,
      gamesWon: this.userData.gamesWon,
      balance: this.balance
    });
  }

  private buildFullUI() {
    if (!this.userData) return;

    this.addTitle();
    this.addCheckerPieces();
    this.createBalanceDisplay();
    this.createStatsDisplay();
    this.createRankDisplay();
    this.createWelcomeMessage();
    this.createMenuButtons();
    this.addFooter();
    this.setupInputHandlers();
  }

  private addBackground() {
    // Dark wood-like background
    this.cameras.main.setBackgroundColor('#2a1a0a');
    
    // Add subtle pattern
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const square = this.add.rectangle(x, y, 20, 20, 0x8b4513, 0.1);
      square.angle = 45;
    }
  }

  private addTitle() {
    this.add.text(180, 70, 'CHECKERS', {
      fontSize: '32px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);
  }

  private addCheckerPieces() {
    if (!this.textures.exists('red_normal') || !this.textures.exists('black_normal')) return;

    // Red piece
    this.redPiece = this.add.image(120, 140, 'red_normal');
    this.redPiece.setDisplaySize(40, 40);

    // Black piece
    this.blackPiece = this.add.image(240, 140, 'black_normal');
    this.blackPiece.setDisplaySize(40, 40);

    // Add animation - pieces bounce
    this.tweens.add({
      targets: [this.redPiece, this.blackPiece],
      y: 130,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Add rotation
    this.tweens.add({
      targets: [this.redPiece, this.blackPiece],
      angle: 5,
      duration: 600,
      yoyo: true,
      repeat: -1
    });
  }

  private createWelcomeMessage() {
    if (!this.userData) return;

    this.add.text(180, 190, `Welcome, ${this.userData.displayName}!`, {
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(180, 210, `${this.userData.rank} • Level ${this.userData.level}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const winRate = this.userData.gamesPlayed > 0 
      ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100) 
      : 0;

    this.add.text(180, 230, `Wins: ${this.userData.gamesWon} | Win Rate: ${winRate}%`, {
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

  private createStatsDisplay() {
    if (!this.userData) return;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(245, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(245, 5, 110, 40, 8);

    this.add.text(250, 8, '📊', { fontSize: '20px' });
    this.add.text(275, 8, 'Stats:', { fontSize: '12px', color: '#ffffff' });

    const gamesPlayed = this.userData.gamesPlayed || 0;
    this.statsText = this.add.text(265, 23, `${gamesPlayed} Games`, {
      fontSize: '12px',
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

    this.add.text(130, 8, '🏆', { fontSize: '20px' });
    this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });

    this.rankText = this.add.text(165, 23, `#${this.playerRank || 999}`, {
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
      { text: '♟️ PLAY CHECKERS', color: '#4CAF50', scene: 'CheckersGameScene' },
      { text: '🏆 LEADERBOARD', color: '#2196F3', scene: 'CheckersLeaderboardScene' },
      { text: '👤 PROFILE', color: '#9C27B0', scene: 'CheckersProfileScene' },
      { text: '📊 MY GAMES', color: '#FF9800', scene: 'CheckersScoresScene' },
      { text: '🛒 STORE', color: '#E91E63', scene: 'CheckersStoreScene' }
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

      if (btn.text === '♟️ PLAY CHECKERS') {
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
                console.log('🔍 Starting Checkers game with:', {
                  username: this.userData!.username,
                  uid: this.uid,
                  displayName: this.userData!.displayName
                });

                this.scene.start('CheckersGameScene', {
                  username: this.userData!.username,
                  uid: this.uid,
                  displayName: this.userData!.displayName,
                  avatar: this.userData!.avatar
                });
              }
            });
          } else {
            this.showError('Failed to process payment');
          }
        });
      } else {
        button.on('pointerdown', () => {
          this.scene.start(btn.scene, { userData: this.userData, uid: this.uid });
        });
      }

      this.menuButtons.push(button);
    });
  }

  private async deductGameFee(): Promise<boolean> {
    if (!this.userData || !this.uid) return false;

    try {
      console.log('💰 Deducting 1 coin game fee for UID:', this.uid);

      const success = await updateCheckersWalletBalance(
        this.uid,
        -1,
        'loss',
        'Checkers game entry fee'
      );

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

    const destroyPopup = () => {
      popup.destroy();
      warningIcon.destroy();
      warningText.destroy();
      subText.destroy();
      closeBtn.destroy();
    };

    closeBtn.on('pointerdown', destroyPopup);
    this.time.delayedCall(3000, destroyPopup);
  }

  private addFooter() {
    this.add.text(340, 620, 'Checkers v1.0.0', {
      fontSize: '10px',
      color: '#666666'
    }).setOrigin(1, 0);
  }

  private setupInputHandlers() {
    if (!this.userData) return;

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => {
        if (this.userData && this.userData.balance >= 1) {
          this.scene.start('CheckersGameScene', {
            username: this.userData.username,
            uid: this.uid,
            displayName: this.userData.displayName,
            avatar: this.userData.avatar
          });
        }
      });
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.userData && this.userData.balance >= 1) {
          this.scene.start('CheckersGameScene', {
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